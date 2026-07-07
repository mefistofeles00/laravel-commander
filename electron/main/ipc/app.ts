import { app } from 'electron'
import { handle } from './registry'

export function registerAppIpc(): void {
  handle('app:ping', (_event, message) => ({
    message: `pong: ${message}`,
    appVersion: app.getVersion(),
    electronVersion: process.versions.electron,
    nodeVersion: process.versions.node,
    platform: process.platform
  }))
}
