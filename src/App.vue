<script setup lang="ts">
import { onMounted } from 'vue'
import { useAppStore } from '@/stores/app'

const store = useAppStore()

onMounted(() => {
  store.checkIpc()
})
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <main class="flex-1">
      <RouterView />
    </main>
    <footer class="border-t px-4 py-2 text-xs text-muted-foreground">
      <template v-if="store.ping">
        IPC ok — {{ store.ping.message }} · app {{ store.ping.appVersion }} · electron
        {{ store.ping.electronVersion }} · node {{ store.ping.nodeVersion }}
      </template>
      <template v-else>IPC bekleniyor…</template>
    </footer>
  </div>
</template>
