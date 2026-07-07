import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { PingResponse } from '@shared/types'

export const useAppStore = defineStore('app', () => {
  const ping = ref<PingResponse | null>(null)

  async function checkIpc(): Promise<void> {
    ping.value = await window.api.ping('hello')
  }

  return { ping, checkIpc }
})
