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

export interface ArtisanHistoryEntry {
  command: string
  cliArgs: string[]
  options: ArtisanOptionValues
  at: number
}

export type EditorChoice = 'vscode' | 'phpstorm' | 'cursor'

export type OpenTarget = 'editor' | 'terminal' | 'browser'

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

// ---- Dev process manager ----

export type DevRole = 'serve' | 'vite' | 'queue' | 'reverb'

export type DevProcessStatus = 'stopped' | 'running' | 'crashed'

export interface DevProcessInfo {
  role: DevRole
  status: DevProcessStatus
  /** Whether this role can run in this project (e.g. vite needs a dev script). */
  available: boolean
  /** Why it's unavailable, or an advisory note (e.g. Herd already serves this app). */
  hint?: string
  /** Current run id while running — live output arrives on command:output with this id. */
  runId?: string
  port?: number
  url?: string
  startedAt?: number
  exitCode?: number | null
  /** Recent output (ring buffer), only included in dev:list responses. */
  buffer?: string
}

export interface DevActionResult {
  ok: boolean
  message?: string
}

export interface DevStatusEvent {
  projectId: string
  process: DevProcessInfo
}

// ---- Logs & failed jobs ----

export interface LogFileInfo {
  name: string
  size: number
  modifiedAt: number
}

export interface LogEntry {
  timestamp: string
  env: string
  level: string
  message: string
  stack: string[]
  /** Consecutive identical entries collapsed into one. */
  count: number
  /** First frame inside the project (app/, routes/, …) — openable in an editor. */
  appFrame?: { file: string; line: number }
}

export interface LogReadResult {
  file: string
  entries: LogEntry[]
  /** True when only the tail of a large file was read. */
  truncated: boolean
  sizeBytes: number
}

export interface FailedJob {
  uuid: string
  description: string
}

export type FailedJobsResult =
  { ok: true; jobs: FailedJob[] } | { ok: false; message: string; raw?: string }

export interface ExecResult {
  ok: boolean
  output: string
}

export interface LogAppendedEvent {
  projectId: string
  file: string
}

// ---- Code X-ray (routes & models) ----

export interface RouteInfo {
  method: string
  uri: string
  name: string | null
  action: string
  middleware: string[]
  /** Project-relative controller file when it could be resolved via PSR-4. */
  file?: string
}

export type RoutesResult = { ok: true; routes: RouteInfo[] } | { ok: false; message: string }

export interface ModelInfo {
  /** Fully-qualified class, e.g. "App\Models\User". */
  class: string
  /** Project-relative file path. */
  file: string
}

export interface ModelAttribute {
  name: string
  type: string | null
  nullable: boolean
  fillable: boolean
}

export interface ModelRelation {
  name: string
  type: string
  related: string | null
}

export interface ModelDetail {
  class: string
  table: string | null
  attributes: ModelAttribute[]
  relations: ModelRelation[]
  observers: string[]
}

export type ModelDetailResult = { ok: true; detail: ModelDetail } | { ok: false; message: string }

// ---- Maintenance (migrations, packages, schedule) ----

export interface MigrationInfo {
  name: string
  batch: number | null
  status: 'ran' | 'pending'
}

export type MigrationsResult =
  { ok: true; migrations: MigrationInfo[] } | { ok: false; message: string; raw?: string }

export interface OutdatedPackage {
  name: string
  current: string
  latest: string
  /** major = crosses a semver boundary; minor = semver-safe update. */
  severity: 'major' | 'minor' | 'unknown'
  description?: string
}

export type OutdatedResult =
  { ok: true; packages: OutdatedPackage[] } | { ok: false; message: string }

export interface ScheduledTask {
  expression: string
  command: string
  nextDue: string | null
}

export type ScheduleResult =
  { ok: true; tasks: ScheduledTask[] } | { ok: false; message: string; raw?: string }

// ---- Project Doctor ----

export type DoctorSeverity = 'error' | 'warning' | 'info'

export interface DoctorFinding {
  /** Stable check id; the main process derives the fix action from it. */
  id: string
  title: string
  detail: string
  severity: DoctorSeverity
  /** Button label of the one-click fix, if this finding has one. */
  fixLabel?: string
}

export interface DoctorReport {
  ranAt: number
  /** Checks that were applicable and evaluated (passed + findings). */
  checkCount: number
  findings: DoctorFinding[]
}

export interface DoctorFixResult {
  ok: boolean
  output: string
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
  'doctor:run': { args: [projectId: string]; result: DoctorReport }
  'doctor:fix': { args: [projectId: string, findingId: string]; result: DoctorFixResult }
  'dev:list': { args: [projectId: string]; result: DevProcessInfo[] }
  'dev:start': { args: [projectId: string, role: DevRole]; result: DevActionResult }
  'dev:stop': { args: [projectId: string, role: DevRole]; result: boolean }
  'dev:startAll': { args: [projectId: string]; result: DevActionResult }
  'dev:stopAll': { args: [projectId: string]; result: boolean }
  'dev:runningProjects': { args: []; result: string[] }
  'log:files': { args: [projectId: string]; result: LogFileInfo[] }
  'log:read': { args: [projectId: string, file: string]; result: LogReadResult }
  'log:clear': { args: [projectId: string, file: string]; result: LogReadResult }
  'jobs:failed': { args: [projectId: string]; result: FailedJobsResult }
  'jobs:retry': { args: [projectId: string, uuid: string]; result: ExecResult }
  'jobs:forget': { args: [projectId: string, uuid: string]; result: ExecResult }
  'jobs:flush': { args: [projectId: string]; result: ExecResult }
  'projects:openFile': {
    args: [projectId: string, relativeFile: string, line?: number]
    result: boolean
  }
  'code:routes': { args: [projectId: string]; result: RoutesResult }
  'code:models': { args: [projectId: string]; result: ModelInfo[] }
  'code:modelDetail': { args: [projectId: string, modelClass: string]; result: ModelDetailResult }
  'artisan:history': { args: [projectId: string]; result: ArtisanHistoryEntry[] }
  'projects:open': { args: [projectId: string, target: OpenTarget]; result: DevActionResult }
  'settings:getEditor': { args: []; result: EditorChoice }
  'settings:setEditor': { args: [editor: EditorChoice]; result: EditorChoice }
  'maint:migrations': { args: [projectId: string]; result: MigrationsResult }
  'maint:migrate': { args: [projectId: string]; result: ExecResult }
  'maint:rollback': { args: [projectId: string]; result: ExecResult }
  'maint:outdated': { args: [projectId: string]; result: OutdatedResult }
  'maint:schedule': { args: [projectId: string]; result: ScheduleResult }
}

export type IpcChannel = keyof IpcChannels
export type IpcArgs<C extends IpcChannel> = IpcChannels[C]['args']
export type IpcResult<C extends IpcChannel> = IpcChannels[C]['result']

// ---- Event map: main -> renderer push channels ----

export interface IpcEvents {
  'command:output': CommandOutputEvent
  'command:exit': CommandExitEvent
  'dev:status': DevStatusEvent
  'log:appended': LogAppendedEvent
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
  runDoctor(projectId: string): Promise<DoctorReport>
  fixDoctorFinding(projectId: string, findingId: string): Promise<DoctorFixResult>
  listDevProcesses(projectId: string): Promise<DevProcessInfo[]>
  startDevProcess(projectId: string, role: DevRole): Promise<DevActionResult>
  stopDevProcess(projectId: string, role: DevRole): Promise<boolean>
  startAllDevProcesses(projectId: string): Promise<DevActionResult>
  stopAllDevProcesses(projectId: string): Promise<boolean>
  devRunningProjects(): Promise<string[]>
  listLogFiles(projectId: string): Promise<LogFileInfo[]>
  readLog(projectId: string, file: string): Promise<LogReadResult>
  clearLog(projectId: string, file: string): Promise<LogReadResult>
  listFailedJobs(projectId: string): Promise<FailedJobsResult>
  retryFailedJob(projectId: string, uuid: string): Promise<ExecResult>
  forgetFailedJob(projectId: string, uuid: string): Promise<ExecResult>
  flushFailedJobs(projectId: string): Promise<ExecResult>
  openProjectFile(projectId: string, relativeFile: string, line?: number): Promise<boolean>
  listRoutes(projectId: string): Promise<RoutesResult>
  listModels(projectId: string): Promise<ModelInfo[]>
  getModelDetail(projectId: string, modelClass: string): Promise<ModelDetailResult>
  artisanHistory(projectId: string): Promise<ArtisanHistoryEntry[]>
  openProject(projectId: string, target: OpenTarget): Promise<DevActionResult>
  getEditor(): Promise<EditorChoice>
  setEditor(editor: EditorChoice): Promise<EditorChoice>
  listMigrations(projectId: string): Promise<MigrationsResult>
  runMigrations(projectId: string): Promise<ExecResult>
  rollbackMigrations(projectId: string): Promise<ExecResult>
  listOutdatedPackages(projectId: string): Promise<OutdatedResult>
  listScheduledTasks(projectId: string): Promise<ScheduleResult>
  /** Subscribe to live command output. Returns an unsubscribe function. */
  onCommandOutput(callback: (event: CommandOutputEvent) => void): () => void
  onCommandExit(callback: (event: CommandExitEvent) => void): () => void
  onDevStatus(callback: (event: DevStatusEvent) => void): () => void
  onLogAppended(callback: (event: LogAppendedEvent) => void): () => void
}
