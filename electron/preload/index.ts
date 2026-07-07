import { contextBridge, ipcRenderer } from 'electron'
import type { IpcChannel, IpcArgs, IpcResult, LaravelCommanderApi } from '@shared/types'

// The only place ipcRenderer is touched. The renderer never sees raw
// channel strings — only the named methods below, which acts as the
// channel whitelist.
function invoke<C extends IpcChannel>(channel: C, ...args: IpcArgs<C>): Promise<IpcResult<C>> {
  return ipcRenderer.invoke(channel, ...args)
}

const api: LaravelCommanderApi = {
  ping: (message) => invoke('app:ping', message),
  detectPhp: () => invoke('php:detect'),
  listProjects: () => invoke('projects:list'),
  addProject: () => invoke('projects:add'),
  removeProject: (projectId) => invoke('projects:remove', projectId),
  revealProject: (projectId) => invoke('projects:reveal', projectId)
}

contextBridge.exposeInMainWorld('api', api)
