import { app } from 'electron'
import { handle } from './registry'
import { getEditor, setEditor } from '../services/editor'

export function registerAppIpc(): void {
  handle('app:ping', (_event, message) => ({
    message: `pong: ${message}`,
    appVersion: app.getVersion(),
    electronVersion: process.versions.electron,
    nodeVersion: process.versions.node,
    platform: process.platform
  }))

  handle('settings:getEditor', () => getEditor())
  handle('settings:setEditor', (_event, editor) => setEditor(editor))
}
