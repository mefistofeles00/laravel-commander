/// <reference types="vite/client" />

import type { LaravelCommanderApi } from '@shared/types'

declare global {
  interface Window {
    api: LaravelCommanderApi
  }
}

export {}
