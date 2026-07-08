import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type {
  IpcChannel,
  IpcArgs,
  IpcResult,
  IpcEvent,
  IpcEventPayload,
  LaravelCommanderApi
} from '@shared/types'

// The only place ipcRenderer is touched. The renderer never sees raw
// channel strings — only the named methods below, which acts as the
// channel whitelist.
function invoke<C extends IpcChannel>(channel: C, ...args: IpcArgs<C>): Promise<IpcResult<C>> {
  return ipcRenderer.invoke(channel, ...args)
}

function subscribe<E extends IpcEvent>(
  channel: E,
  callback: (payload: IpcEventPayload<E>) => void
): () => void {
  const listener = (_event: IpcRendererEvent, payload: IpcEventPayload<E>): void =>
    callback(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: LaravelCommanderApi = {
  ping: (message) => invoke('app:ping', message),
  detectPhp: () => invoke('php:detect'),
  listProjects: () => invoke('projects:list'),
  addProject: () => invoke('projects:add'),
  removeProject: (projectId) => invoke('projects:remove', projectId),
  revealProject: (projectId) => invoke('projects:reveal', projectId),
  readEnv: (projectId) => invoke('env:read', projectId),
  writeEnv: (projectId, changes) => invoke('env:write', projectId, changes),
  initEnv: (projectId) => invoke('env:init', projectId),
  listArtisanCommands: (projectId) => invoke('artisan:list', projectId),
  runArtisan: (projectId, command, cliArgs, options) =>
    invoke('artisan:run', projectId, command, cliArgs, options),
  cancelArtisan: (runId) => invoke('artisan:cancel', runId),
  runDoctor: (projectId) => invoke('doctor:run', projectId),
  fixDoctorFinding: (projectId, findingId) => invoke('doctor:fix', projectId, findingId),
  listDevProcesses: (projectId) => invoke('dev:list', projectId),
  startDevProcess: (projectId, role) => invoke('dev:start', projectId, role),
  stopDevProcess: (projectId, role) => invoke('dev:stop', projectId, role),
  startAllDevProcesses: (projectId) => invoke('dev:startAll', projectId),
  stopAllDevProcesses: (projectId) => invoke('dev:stopAll', projectId),
  devRunningProjects: () => invoke('dev:runningProjects'),
  onCommandOutput: (callback) => subscribe('command:output', callback),
  onCommandExit: (callback) => subscribe('command:exit', callback),
  onDevStatus: (callback) => subscribe('dev:status', callback)
}

contextBridge.exposeInMainWorld('api', api)
