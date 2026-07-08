import { BrowserWindow } from 'electron'
import { watch, type FSWatcher } from 'fs'
import { open, readdir, stat, writeFile } from 'fs/promises'
import { join } from 'path'
import { sendEvent } from '../ipc/registry'
import type { LogEntry, LogFileInfo, LogReadResult } from '@shared/types'

const TAIL_BYTES = 512 * 1024
const LOG_NAME_RE = /^[\w.-]+\.log$/
const ENTRY_RE = /^\[(\d{4}-\d{2}-\d{2}[T ][\d:.]+(?:[+-][\d:]+)?)\]\s+(\w+)\.(\w+):\s?(.*)$/
const APP_FRAME_RE = /((?:app|routes|database|resources|config|tests)\/[^\s:()]+\.php)[:(](\d+)/

function parseEntries(content: string): LogEntry[] {
  const entries: LogEntry[] = []
  let current: LogEntry | null = null

  for (const line of content.split('\n')) {
    const match = ENTRY_RE.exec(line)
    if (match) {
      const [, timestamp, env, rawLevel, message] = match
      const level = rawLevel.toLowerCase()
      const previous = entries[entries.length - 1]
      if (previous && previous.level === level && previous.message === message) {
        previous.count++
        current = null // duplicates keep the first stack only
        continue
      }
      current = { timestamp, env, level, message, stack: [], count: 1 }
      entries.push(current)
    } else if (current && line.trim() !== '') {
      current.stack.push(line)
    }
  }

  for (const entry of entries) {
    for (const line of entry.stack) {
      const frame = APP_FRAME_RE.exec(line)
      if (frame) {
        entry.appFrame = { file: frame[1], line: Number(frame[2]) }
        break
      }
    }
  }
  return entries
}

/**
 * Reads Laravel log files (tail-only for large files) and pushes a
 * `log:appended` event while a file is being watched. One watcher at a
 * time — the renderer watches whatever file it is displaying.
 */
export class LogService {
  private watcher: FSWatcher | undefined
  private watchDebounce: ReturnType<typeof setTimeout> | undefined

  async listFiles(projectPath: string): Promise<LogFileInfo[]> {
    const dir = join(projectPath, 'storage', 'logs')
    let names: string[]
    try {
      names = await readdir(dir)
    } catch {
      return []
    }
    const files: LogFileInfo[] = []
    for (const name of names.filter((n) => LOG_NAME_RE.test(n))) {
      try {
        const info = await stat(join(dir, name))
        files.push({ name, size: info.size, modifiedAt: info.mtimeMs })
      } catch {
        /* raced deletion — skip */
      }
    }
    return files.sort((a, b) => b.modifiedAt - a.modifiedAt)
  }

  async read(projectId: string, projectPath: string, file: string): Promise<LogReadResult> {
    const path = this.resolveLogPath(projectPath, file)
    const info = await stat(path)
    const truncated = info.size > TAIL_BYTES

    const handle = await open(path, 'r')
    let content: string
    try {
      if (truncated) {
        const buffer = Buffer.alloc(TAIL_BYTES)
        await handle.read(buffer, 0, TAIL_BYTES, info.size - TAIL_BYTES)
        content = buffer.toString('utf8')
        // Drop the first partial line/entry.
        content = content.slice(content.indexOf('\n[') + 1)
      } else {
        content = (await handle.readFile()).toString('utf8')
      }
    } finally {
      await handle.close()
    }

    this.watch(projectId, path, file)
    return { file, entries: parseEntries(content), truncated, sizeBytes: info.size }
  }

  async clear(projectId: string, projectPath: string, file: string): Promise<LogReadResult> {
    const path = this.resolveLogPath(projectPath, file)
    await writeFile(path, '', 'utf8')
    return this.read(projectId, projectPath, file)
  }

  private resolveLogPath(projectPath: string, file: string): string {
    if (!LOG_NAME_RE.test(file)) {
      throw new Error('Invalid log file name.')
    }
    return join(projectPath, 'storage', 'logs', file)
  }

  private watch(projectId: string, path: string, file: string): void {
    this.watcher?.close()
    try {
      this.watcher = watch(path, () => {
        clearTimeout(this.watchDebounce)
        this.watchDebounce = setTimeout(() => {
          for (const window of BrowserWindow.getAllWindows()) {
            sendEvent(window.webContents, 'log:appended', { projectId, file })
          }
        }, 400)
      })
    } catch {
      this.watcher = undefined
    }
  }
}
