<script setup lang="ts">
import { onMounted } from 'vue'
import { useAppStore } from '@/stores/app'
import { useProjectsStore } from '@/stores/projects'
import { useDevStore } from '@/stores/dev'

const app = useAppStore()
const projects = useProjectsStore()
const dev = useDevStore()

onMounted(() => {
  app.init()
  projects.refresh()
  dev.init()
})
</script>

<template>
  <div class="flex h-screen overflow-hidden">
    <aside class="flex w-64 shrink-0 flex-col border-r bg-black/20">
      <!-- Drag strip doubles as the brand row; padded past macOS traffic lights. -->
      <div
        class="app-drag flex h-12 shrink-0 items-center border-b"
        :class="app.isMac ? 'pl-[78px]' : 'pl-5'"
      >
        <RouterLink to="/" class="app-no-drag font-mono text-[13px] font-semibold tracking-tight">
          <span class="text-primary">❯</span> laravel commander
        </RouterLink>
      </div>

      <nav class="flex-1 overflow-y-auto p-3">
        <RouterLink
          to="/"
          class="flex items-center justify-between rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-white/4 hover:text-foreground"
          exact-active-class="bg-white/6 text-foreground"
        >
          <span>Projects</span>
          <span v-if="projects.projects.length" class="font-mono text-xs text-muted-foreground">
            {{ projects.projects.length }}
          </span>
        </RouterLink>

        <ul v-if="projects.projects.length" class="mt-3 space-y-0.5">
          <li v-for="project in projects.projects" :key="project.id">
            <RouterLink
              :to="`/projects/${project.id}`"
              class="flex items-center gap-2 rounded-md px-2.5 py-1.5 font-mono text-[13px] text-muted-foreground transition-colors hover:bg-white/4 hover:text-foreground"
              active-class="bg-white/6 text-foreground"
            >
              <span class="text-primary/70">❯</span>
              <span class="truncate">{{ project.name }}</span>
              <span
                v-if="dev.isRunning(project.id)"
                class="ml-auto size-1.5 shrink-0 animate-pulse rounded-full bg-success"
                title="Dev processes running"
              />
            </RouterLink>
          </li>
        </ul>
      </nav>

      <div class="shrink-0 space-y-1 border-t px-5 py-3">
        <div v-if="app.php" class="flex items-center gap-2 font-mono text-xs">
          <span class="size-1.5 rounded-full bg-success" />
          <span>PHP {{ app.php.version }}</span>
          <span class="text-muted-foreground">· {{ app.php.source }}</span>
        </div>
        <div v-else-if="app.phpChecked" class="flex items-center gap-2 font-mono text-xs">
          <span class="size-1.5 rounded-full bg-warning" />
          <span class="text-muted-foreground">PHP not found</span>
        </div>
        <div v-else class="flex items-center gap-2 font-mono text-xs text-muted-foreground">
          <span class="size-1.5 rounded-full bg-muted" />
          <span>Checking PHP…</span>
        </div>
        <div v-if="app.info" class="font-mono text-[10px] text-muted-foreground/60">
          v{{ app.info.appVersion }}
        </div>
      </div>
    </aside>

    <main class="min-w-0 flex-1 overflow-y-auto">
      <!-- Drag strip over the content area keeps the whole top edge grabbable. -->
      <div class="app-drag sticky top-0 z-10 h-3" />
      <RouterView />
    </main>
  </div>
</template>
