import Store from 'electron-store'
import type { ArtisanHistoryEntry, EditorChoice, LaravelProject } from '@shared/types'

interface StoreSchema {
  projects: LaravelProject[]
  /** Manual PHP binary path override, set from settings (UI in a later phase). */
  phpPathOverride?: string
  /** Manual composer binary path override. */
  composerPathOverride?: string
  /** Preferred editor for "open in editor" actions. */
  editor?: EditorChoice
  /** Recent artisan runs per project id (newest first, capped). */
  artisanHistory?: Record<string, ArtisanHistoryEntry[]>
}

export const store = new Store<StoreSchema>({
  defaults: { projects: [] }
})
