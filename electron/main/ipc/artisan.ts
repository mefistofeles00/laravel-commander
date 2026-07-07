import { execFile } from 'child_process'
import { promisify } from 'util'
import { randomUUID } from 'crypto'
import { handle, sendEvent } from './registry'
import type { CommandRunner } from '../services/CommandRunner'
import type { PhpEnvironment } from '../services/PhpEnvironment'
import type { ProjectManager } from '../services/ProjectManager'
import type { ArtisanCommand } from '@shared/types'

const execFileAsync = promisify(execFile)

/** Symfony console globals that appear on every command — noise in a form. */
const GLOBAL_OPTIONS = new Set([
  'help',
  'quiet',
  'verbose',
  'version',
  'ansi',
  'no-ansi',
  'no-interaction',
  'env'
])

const OPTION_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9-]*$/

interface RawArgument {
  name: string
  description?: string
  is_required?: boolean
}

interface RawOption {
  name: string
  description?: string
  accept_value?: boolean
}

interface RawCommand {
  name: string
  description?: string
  hidden?: boolean
  definition?: {
    arguments?: Record<string, RawArgument> | RawArgument[]
    options?: Record<string, RawOption> | RawOption[]
  }
}

function toArray<T>(value: Record<string, T> | T[] | undefined): T[] {
  if (!value) return []
  return Array.isArray(value) ? value : Object.values(value)
}

function toCatalog(raw: RawCommand[]): ArtisanCommand[] {
  return raw
    .filter((command) => !command.hidden)
    .map((command) => ({
      name: command.name,
      description: command.description ?? '',
      arguments: toArray(command.definition?.arguments).map((arg) => ({
        name: arg.name,
        description: arg.description ?? '',
        isRequired: arg.is_required ?? false
      })),
      options: toArray(command.definition?.options)
        .map((option) => ({
          name: option.name.replace(/^--/, ''),
          description: option.description ?? '',
          acceptValue: option.accept_value ?? false
        }))
        .filter((option) => !GLOBAL_OPTIONS.has(option.name))
    }))
}

export function registerArtisanIpc(
  projects: ProjectManager,
  php: PhpEnvironment,
  runner: CommandRunner
): void {
  handle('artisan:list', async (_event, projectId) => {
    const project = projects.get(projectId)
    if (!project) return { ok: false as const, message: 'Project is no longer in your list.' }
    const phpInfo = await php.detect()
    if (!phpInfo) {
      return { ok: false as const, message: 'No PHP binary found on this machine.' }
    }

    try {
      const { stdout } = await execFileAsync(
        phpInfo.binaryPath,
        ['artisan', 'list', '--format=json'],
        { cwd: project.path, timeout: 20000, maxBuffer: 32 * 1024 * 1024 }
      )
      const parsed: { commands?: RawCommand[] } = JSON.parse(stdout)
      return { ok: true as const, commands: toCatalog(parsed.commands ?? []) }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      return {
        ok: false as const,
        message: `Couldn't load the command list from this project. ${detail}`
      }
    }
  })

  handle('artisan:run', async (event, projectId, command, cliArgs, options) => {
    const project = projects.get(projectId)
    if (!project) return { ok: false as const, message: 'Project is no longer in your list.' }
    const phpInfo = await php.detect()
    if (!phpInfo) {
      return { ok: false as const, message: 'No PHP binary found on this machine.' }
    }

    const optionTokens: string[] = []
    for (const [name, value] of Object.entries(options)) {
      if (!OPTION_NAME_RE.test(name)) continue
      optionTokens.push(value === true ? `--${name}` : `--${name}=${value}`)
    }

    const runId = randomUUID()
    const sender = event.sender
    try {
      // --no-interaction: a prompt would hang a headless run.
      runner.run(
        runId,
        phpInfo.binaryPath,
        ['artisan', command, ...cliArgs, ...optionTokens, '--ansi', '--no-interaction'],
        project.path,
        {
          onOutput: (chunk, stream) =>
            sendEvent(sender, 'command:output', { runId, stream, chunk }),
          onExit: (exitCode, signal) =>
            sendEvent(sender, 'command:exit', { runId, exitCode, signal })
        }
      )
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      return { ok: false as const, message: detail }
    }
    return { ok: true as const, runId }
  })

  handle('artisan:cancel', (_event, runId) => runner.cancel(runId))
}
