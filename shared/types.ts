/**
 * IPC contract between main and renderer.
 *
 * This file is the single source of truth: every channel is declared in
 * `IpcChannels`, the preload script exposes it as a named method on
 * `LaravelCommanderApi`, and the main process registers a handler for it
 * via the typed `handle()` helper. Adding a channel here type-errors
 * until both sides implement it.
 */

// ---- Payload types ----

export interface PingResponse {
  message: string
  appVersion: string
  electronVersion: string
  nodeVersion: string
  platform: string
}

export interface LaravelProject {
  id: string
  name: string
  path: string
  /** Installed version from composer.lock, e.g. "11.34.2". Null if the lock file is missing. */
  laravelVersion: string | null
  /** PHP constraint from composer.json, e.g. "^8.2". */
  phpConstraint: string | null
  addedAt: number
}

export type AddProjectFailure = 'canceled' | 'not-laravel' | 'already-added'

export type AddProjectResult =
  { ok: true; project: LaravelProject } | { ok: false; reason: AddProjectFailure; message: string }

export type PhpSource = 'herd' | 'homebrew' | 'xampp' | 'system' | 'manual'

export interface PhpInfo {
  binaryPath: string
  version: string
  source: PhpSource
}

// Command streaming payloads (wired to the renderer in Phase 2).
export interface CommandOutputEvent {
  runId: string
  stream: 'stdout' | 'stderr'
  chunk: string
}

export interface CommandExitEvent {
  runId: string
  exitCode: number | null
  signal: string | null
}

// ---- Channel map: channel name -> request tuple + response ----

export interface IpcChannels {
  'app:ping': { args: [message: string]; result: PingResponse }
  'php:detect': { args: []; result: PhpInfo | null }
  'projects:list': { args: []; result: LaravelProject[] }
  'projects:add': { args: []; result: AddProjectResult }
  'projects:remove': { args: [projectId: string]; result: LaravelProject[] }
  'projects:reveal': { args: [projectId: string]; result: boolean }
  // Phase 2: 'artisan:list', 'artisan:run', 'artisan:cancel', 'env:read', 'env:write'
}

export type IpcChannel = keyof IpcChannels
export type IpcArgs<C extends IpcChannel> = IpcChannels[C]['args']
export type IpcResult<C extends IpcChannel> = IpcChannels[C]['result']

// ---- Renderer-facing API surface (implemented by preload) ----

export interface LaravelCommanderApi {
  ping(message: string): Promise<PingResponse>
  detectPhp(): Promise<PhpInfo | null>
  listProjects(): Promise<LaravelProject[]>
  addProject(): Promise<AddProjectResult>
  removeProject(projectId: string): Promise<LaravelProject[]>
  revealProject(projectId: string): Promise<boolean>
}
