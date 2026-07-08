import { store } from './storage'
import type { EditorChoice } from '@shared/types'

export function getEditor(): EditorChoice {
  return store.get('editor') ?? 'vscode'
}

export function setEditor(editor: EditorChoice): EditorChoice {
  store.set('editor', editor)
  return editor
}

/** URL-scheme link that opens a file (or folder) in the preferred editor. */
export function editorUrl(path: string, line?: number): string {
  const suffix = line ? `:${line}` : ''
  switch (getEditor()) {
    case 'phpstorm':
      return `phpstorm://open?file=${encodeURIComponent(path)}${line ? `&line=${line}` : ''}`
    case 'cursor':
      return `cursor://file/${path}${suffix}`
    default:
      return `vscode://file/${path}${suffix}`
  }
}
