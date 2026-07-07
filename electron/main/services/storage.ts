import Store from 'electron-store'
import type { LaravelProject } from '@shared/types'

interface StoreSchema {
  projects: LaravelProject[]
  /** Manual PHP binary path override, set from settings (UI in a later phase). */
  phpPathOverride?: string
}

export const store = new Store<StoreSchema>({
  defaults: { projects: [] }
})
