import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { PhpInfo, PingResponse } from '@shared/types'

export const useAppStore = defineStore('app', () => {
  const info = ref<PingResponse | null>(null)
  const php = ref<PhpInfo | null>(null)
  const phpChecked = ref(false)

  const isMac = computed(() => info.value?.platform === 'darwin')

  async function init(): Promise<void> {
    info.value = await window.api.ping('hello')
    php.value = await window.api.detectPhp()
    phpChecked.value = true
  }

  return { info, php, phpChecked, isMac, init }
})
