import Store from 'electron-store'
import type { LaravelProject } from '@shared/types'

export type EditorChoice = 'vscode' | 'phpstorm' | 'cursor'

interface StoreSchema {
  projects: LaravelProject[]
  /** Manual PHP binary path override, set from settings (UI in a later phase). */
  phpPathOverride?: string
  /** Preferred editor for "open in editor" actions. */
  editor?: EditorChoice
}

export const store = new Store<StoreSchema>({
  defaults: { projects: [] }
})
