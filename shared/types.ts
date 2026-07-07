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
}

// ---- Channel map: channel name -> request tuple + response ----

export interface IpcChannels {
  'app:ping': { args: [message: string]; result: PingResponse }
  // Phase 1+: 'projects:list', 'projects:add', 'artisan:run', 'env:read', ...
}

export type IpcChannel = keyof IpcChannels
export type IpcArgs<C extends IpcChannel> = IpcChannels[C]['args']
export type IpcResult<C extends IpcChannel> = IpcChannels[C]['result']

// ---- Renderer-facing API surface (implemented by preload) ----

export interface LaravelCommanderApi {
  ping(message: string): Promise<PingResponse>
}
