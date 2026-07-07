import { ipcMain, type IpcMainInvokeEvent, type WebContents } from 'electron'
import type { IpcChannel, IpcArgs, IpcResult, IpcEvent, IpcEventPayload } from '@shared/types'

/**
 * Typed wrapper around ipcMain.handle: channel name, argument tuple and
 * return type are all checked against the contract in shared/types.ts.
 */
export function handle<C extends IpcChannel>(
  channel: C,
  handler: (event: IpcMainInvokeEvent, ...args: IpcArgs<C>) => IpcResult<C> | Promise<IpcResult<C>>
): void {
  ipcMain.handle(channel, handler as (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown)
}

/** Typed wrapper for main -> renderer push events. */
export function sendEvent<E extends IpcEvent>(
  target: WebContents,
  channel: E,
  payload: IpcEventPayload<E>
): void {
  if (!target.isDestroyed()) target.send(channel, payload)
}
