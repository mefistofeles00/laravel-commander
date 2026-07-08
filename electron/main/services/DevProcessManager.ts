import { BrowserWindow } from 'electron'
import { existsSync } from 'fs'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { sendEvent } from '../ipc/registry'
import type {
  DevActionResult,
  DevProcessInfo,
  DevProcessStatus,
  DevRole,
  LaravelProject
} from '@shared/types'
import type { CommandRunner } from './CommandRunner'
import type { PhpEnvironment } from './PhpEnvironment'

const ALL_ROLES: DevRole[] = ['serve', 'vite', 'queue', 'reverb']
const BUFFER_LIMIT = 64 * 1024 // per-process ring buffer, characters

interface ManagedProcess {
  role: DevRole
  runId: string
  status: DevProcessStatus
  startedAt: number
  userStopped: boolean
  port?: number
  url?: string
  exitCode?: number | null
  chunks: string[]
  chunksLength: number
}

interface RoleAvailability {
  available: boolean
  hint?: string
  command?: { binary: string; args: string[] }
}

function detectNodePackageManager(projectPath: string): string {
  if (existsSync(join(projectPath, 'pnpm-lock.yaml'))) return 'pnpm'
  if (existsSync(join(projectPath, 'yarn.lock'))) return 'yarn'
  if (existsSync(join(projectPath, 'bun.lockb')) || existsSync(join(projectPath, 'bun.lock'))) {
    return 'bun'
  }
  return 'npm'
}

/**
 * Supervises the long-running processes of a dev session (serve, Vite,
 * queue worker, Reverb) per project. Commands are built entirely in the
 * main process from validated project data; the renderer only names a role.
 */
export class DevProcessManager {
  private byProject = new Map<string, Map<DevRole, ManagedProcess>>()

  constructor(
    private readonly php: PhpEnvironment,
    private readonly runner: CommandRunner
  ) {}

  async list(project: LaravelProject): Promise<DevProcessInfo[]> {
    const infos: DevProcessInfo[] = []
    for (const role of ALL_ROLES) {
      const availability = await this.availability(project, role)
      const managed = this.byProject.get(project.id)?.get(role)
      infos.push({
        role,
        status: managed?.status ?? 'stopped',
        available: availability.available,
        hint: availability.hint,
        runId: managed?.status === 'running' ? managed.runId : undefined,
        port: managed?.port,
        url: managed?.url,
        startedAt: managed?.status === 'running' ? managed.startedAt : undefined,
        exitCode: managed?.exitCode,
        buffer: managed ? managed.chunks.join('') : undefined
      })
    }
    return infos
  }

  async start(project: LaravelProject, role: DevRole): Promise<DevActionResult> {
    const current = this.byProject.get(project.id)?.get(role)
    if (current?.status === 'running') {
      return { ok: false, message: `${role} is already running.` }
    }

    const availability = await this.availability(project, role)
    if (!availability.available || !availability.command) {
      return { ok: false, message: availability.hint ?? `${role} is not available here.` }
    }

    const managed: ManagedProcess = {
      role,
      runId: `dev-${randomUUID()}`,
      status: 'running',
      startedAt: Date.now(),
      userStopped: false,
      chunks: [],
      chunksLength: 0
    }

    const projectProcesses = this.byProject.get(project.id) ?? new Map<DevRole, ManagedProcess>()
    projectProcesses.set(role, managed)
    this.byProject.set(project.id, projectProcesses)

    try {
      this.runner.run(
        managed.runId,
        availability.command.binary,
        availability.command.args,
        project.path,
        {
          onOutput: (chunk, stream) => {
            this.appendBuffer(managed, chunk)
            if (!managed.port) this.detectPort(managed, chunk)
            this.broadcast('command:output', { runId: managed.runId, stream, chunk })
          },
          onExit: (exitCode, signal) => {
            managed.exitCode = exitCode
            managed.status =
              managed.userStopped || (exitCode === 0 && signal === null) ? 'stopped' : 'crashed'
            this.broadcastStatus(project.id, managed)
            this.broadcast('command:exit', { runId: managed.runId, exitCode, signal })
          }
        }
      )
    } catch (error) {
      projectProcesses.delete(role)
      const detail = error instanceof Error ? error.message : String(error)
      return { ok: false, message: detail }
    }

    this.broadcastStatus(project.id, managed)
    return { ok: true }
  }

  stop(projectId: string, role: DevRole): boolean {
    const managed = this.byProject.get(projectId)?.get(role)
    if (!managed || managed.status !== 'running') return false
    managed.userStopped = true
    return this.runner.cancel(managed.runId)
  }

  async startAll(project: LaravelProject): Promise<DevActionResult> {
    const failures: string[] = []
    for (const role of ALL_ROLES) {
      const availability = await this.availability(project, role)
      if (!availability.available) continue
      const current = this.byProject.get(project.id)?.get(role)
      if (current?.status === 'running') continue
      const result = await this.start(project, role)
      if (!result.ok) failures.push(`${role}: ${result.message}`)
    }
    return failures.length === 0 ? { ok: true } : { ok: false, message: failures.join(' · ') }
  }

  stopAll(projectId: string): boolean {
    let any = false
    for (const role of ALL_ROLES) any = this.stop(projectId, role) || any
    return any
  }

  runningProjects(): string[] {
    return [...this.byProject.entries()]
      .filter(([, processes]) => [...processes.values()].some((p) => p.status === 'running'))
      .map(([projectId]) => projectId)
  }

  // ---- internals ----

  private async availability(project: LaravelProject, role: DevRole): Promise<RoleAvailability> {
    const phpInfo = await this.php.detect()

    switch (role) {
      case 'serve': {
        if (!phpInfo) return { available: false, hint: 'No PHP binary found.' }
        const hint =
          phpInfo.source === 'herd'
            ? `Herd may already serve this app at http://${project.name}.test`
            : undefined
        return {
          available: true,
          hint,
          command: { binary: phpInfo.binaryPath, args: ['artisan', 'serve'] }
        }
      }
      case 'vite': {
        try {
          const pkg: { scripts?: Record<string, string> } = JSON.parse(
            await readFile(join(project.path, 'package.json'), 'utf8')
          )
          if (!pkg.scripts?.['dev']) {
            return { available: false, hint: 'No dev script in package.json.' }
          }
        } catch {
          return { available: false, hint: 'No package.json in this project.' }
        }
        const pm = detectNodePackageManager(project.path)
        return { available: true, command: { binary: pm, args: ['run', 'dev'] } }
      }
      case 'queue': {
        if (!phpInfo) return { available: false, hint: 'No PHP binary found.' }
        return {
          available: true,
          command: { binary: phpInfo.binaryPath, args: ['artisan', 'queue:work'] }
        }
      }
      case 'reverb': {
        if (!phpInfo) return { available: false, hint: 'No PHP binary found.' }
        try {
          const composer: {
            require?: Record<string, string>
            'require-dev'?: Record<string, string>
          } = JSON.parse(await readFile(join(project.path, 'composer.json'), 'utf8'))
          if (
            !composer.require?.['laravel/reverb'] &&
            !composer['require-dev']?.['laravel/reverb']
          ) {
            return { available: false, hint: 'laravel/reverb is not installed.' }
          }
        } catch {
          return { available: false, hint: 'laravel/reverb is not installed.' }
        }
        return {
          available: true,
          command: { binary: phpInfo.binaryPath, args: ['artisan', 'reverb:start'] }
        }
      }
    }
  }

  private appendBuffer(managed: ManagedProcess, chunk: string): void {
    managed.chunks.push(chunk)
    managed.chunksLength += chunk.length
    while (managed.chunksLength > BUFFER_LIMIT && managed.chunks.length > 1) {
      managed.chunksLength -= managed.chunks[0].length
      managed.chunks.shift()
    }
  }

  private detectPort(managed: ManagedProcess, chunk: string): void {
    // serve: "Server running on [http://127.0.0.1:8000]" — vite: "➜  Local:   http://localhost:5173/"
    const pattern =
      managed.role === 'vite'
        ? /Local:\s*(https?:\/\/[^\s/]+:(\d+))/
        : /(https?:\/\/[\d.[\]:a-z]+:(\d+))/i
    const match = pattern.exec(chunk)
    if (!match) return
    managed.url = match[1]
    managed.port = Number(match[2])
    // Re-announce so the UI can show the port/link.
    for (const [projectId, processes] of this.byProject) {
      if (processes.get(managed.role) === managed) this.broadcastStatus(projectId, managed)
    }
  }

  private toInfo(managed: ManagedProcess): DevProcessInfo {
    return {
      role: managed.role,
      status: managed.status,
      available: true,
      runId: managed.status === 'running' ? managed.runId : undefined,
      port: managed.port,
      url: managed.url,
      startedAt: managed.status === 'running' ? managed.startedAt : undefined,
      exitCode: managed.exitCode
    }
  }

  private broadcastStatus(projectId: string, managed: ManagedProcess): void {
    this.broadcast('dev:status', { projectId, process: this.toInfo(managed) })
  }

  private broadcast<E extends 'dev:status' | 'command:output' | 'command:exit'>(
    channel: E,
    payload: Parameters<typeof sendEvent<E>>[2]
  ): void {
    for (const window of BrowserWindow.getAllWindows()) {
      sendEvent(window.webContents, channel, payload)
    }
  }
}
