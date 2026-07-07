import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'

export interface CommandCallbacks {
  onOutput: (chunk: string, stream: 'stdout' | 'stderr') => void
  onExit: (exitCode: number | null, signal: string | null) => void
}

const KILL_GRACE_MS = 5000

/**
 * Runs commands (artisan, composer) with live output streaming.
 *
 * The most critical module — every feature sits on top of it. The renderer
 * never passes raw commands here; callers in the main process build the
 * command from validated project data.
 */
export class CommandRunner {
  private running = new Map<string, ChildProcessWithoutNullStreams>()

  run(
    runId: string,
    command: string,
    args: string[],
    cwd: string,
    callbacks: CommandCallbacks
  ): void {
    if (this.running.has(runId)) {
      throw new Error(`A command with run id "${runId}" is already running.`)
    }

    const child = spawn(command, args, { cwd, env: process.env })
    this.running.set(runId, child)

    child.stdout.on('data', (data: Buffer) => callbacks.onOutput(data.toString(), 'stdout'))
    child.stderr.on('data', (data: Buffer) => callbacks.onOutput(data.toString(), 'stderr'))
    child.on('error', (error) => callbacks.onOutput(`${error.message}\n`, 'stderr'))
    child.on('close', (exitCode, signal) => {
      this.running.delete(runId)
      callbacks.onExit(exitCode, signal)
    })
  }

  isRunning(runId: string): boolean {
    return this.running.has(runId)
  }

  /** SIGTERM first; escalates to SIGKILL if the process ignores it. */
  cancel(runId: string): boolean {
    const child = this.running.get(runId)
    if (!child) return false
    child.kill('SIGTERM')
    const escalation = setTimeout(() => {
      if (this.running.has(runId)) child.kill('SIGKILL')
    }, KILL_GRACE_MS)
    escalation.unref()
    return true
  }

  /** Called on app quit so no artisan process outlives the window. */
  killAll(): void {
    for (const runId of this.running.keys()) this.cancel(runId)
  }
}
