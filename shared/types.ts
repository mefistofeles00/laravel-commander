/**
 * IPC contract between main and renderer.
 *
 * This file is the single source of truth: every channel is declared in
 * `IpcChannels` (invoke/handle) or `IpcEvents` (main -> renderer push),
 * the preload script exposes them as named methods on `LaravelCommanderApi`,
 * and the main process registers handlers via the typed `handle()` helper.
 * Adding a channel here type-errors until both sides implement it.
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

// ---- .env editing ----

export interface EnvEntry {
  key: string
  value: string
}

export interface EnvFileState {
  /** .env exists in the project root. */
  exists: boolean
  /** .env.example exists in the project root. */
  exampleExists: boolean
  entries: EnvEntry[]
  /** Keys present in .env.example but missing from .env. */
  missingKeys: string[]
  /** Keys present in .env but not in .env.example. */
  extraKeys: string[]
}

// ---- Artisan ----

export interface ArtisanArgument {
  name: string
  description: string
  isRequired: boolean
}

export interface ArtisanOption {
  name: string
  description: string
  acceptValue: boolean
}

export interface ArtisanCommand {
  name: string
  description: string
  arguments: ArtisanArgument[]
  options: ArtisanOption[]
}

export type ArtisanCatalogResult =
  { ok: true; commands: ArtisanCommand[] } | { ok: false; message: string }

export type ArtisanRunResult = { ok: true; runId: string } | { ok: false; message: string }

/** Option values keyed by option name (without leading dashes); `true` for flags. */
export type ArtisanOptionValues = Record<string, string | true>

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
  'env:read': { args: [projectId: string]; result: EnvFileState }
  'env:write': {
    args: [projectId: string, changes: Record<string, string>]
    result: EnvFileState
  }
  'env:init': { args: [projectId: string]; result: EnvFileState }
  'artisan:list': { args: [projectId: string]; result: ArtisanCatalogResult }
  'artisan:run': {
    args: [projectId: string, command: string, cliArgs: string[], options: ArtisanOptionValues]
    result: ArtisanRunResult
  }
  'artisan:cancel': { args: [runId: string]; result: boolean }
}

export type IpcChannel = keyof IpcChannels
export type IpcArgs<C extends IpcChannel> = IpcChannels[C]['args']
export type IpcResult<C extends IpcChannel> = IpcChannels[C]['result']

// ---- Event map: main -> renderer push channels ----

export interface IpcEvents {
  'command:output': CommandOutputEvent
  'command:exit': CommandExitEvent
}

export type IpcEvent = keyof IpcEvents
export type IpcEventPayload<E extends IpcEvent> = IpcEvents[E]

// ---- Renderer-facing API surface (implemented by preload) ----

export interface LaravelCommanderApi {
  ping(message: string): Promise<PingResponse>
  detectPhp(): Promise<PhpInfo | null>
  listProjects(): Promise<LaravelProject[]>
  addProject(): Promise<AddProjectResult>
  removeProject(projectId: string): Promise<LaravelProject[]>
  revealProject(projectId: string): Promise<boolean>
  readEnv(projectId: string): Promise<EnvFileState>
  writeEnv(projectId: string, changes: Record<string, string>): Promise<EnvFileState>
  initEnv(projectId: string): Promise<EnvFileState>
  listArtisanCommands(projectId: string): Promise<ArtisanCatalogResult>
  runArtisan(
    projectId: string,
    command: string,
    cliArgs: string[],
    options: ArtisanOptionValues
  ): Promise<ArtisanRunResult>
  cancelArtisan(runId: string): Promise<boolean>
  /** Subscribe to live command output. Returns an unsubscribe function. */
  onCommandOutput(callback: (event: CommandOutputEvent) => void): () => void
  onCommandExit(callback: (event: CommandExitEvent) => void): () => void
}
