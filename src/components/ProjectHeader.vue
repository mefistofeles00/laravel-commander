<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import type { LaravelProject } from '@shared/types'

const props = defineProps<{ project: LaravelProject }>()
const route = useRoute()

const tabs = computed(() => [
  { label: 'Overview', to: `/projects/${props.project.id}`, mono: false },
  { label: 'Dev', to: `/projects/${props.project.id}/dev`, mono: false },
  { label: '.env', to: `/projects/${props.project.id}/env`, mono: true },
  { label: 'Artisan', to: `/projects/${props.project.id}/artisan`, mono: false },
  { label: 'Logs', to: `/projects/${props.project.id}/logs`, mono: false },
  { label: 'Code', to: `/projects/${props.project.id}/code`, mono: false },
  { label: 'Doctor', to: `/projects/${props.project.id}/doctor`, mono: false }
])

function reveal(): void {
  window.api.revealProject(props.project.id)
}
</script>

<template>
  <div>
    <RouterLink
      to="/"
      class="font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
    >
      ← projects
    </RouterLink>

    <header class="mt-4">
      <h1 class="font-mono text-2xl font-semibold tracking-tight">
        <span class="text-primary" aria-hidden="true">❯</span> {{ project.name }}
      </h1>
      <button
        class="mt-1.5 block text-left font-mono text-xs break-all text-muted-foreground transition-colors hover:text-foreground"
        title="Show in file manager"
        @click="reveal"
      >
        {{ project.path }}
      </button>
    </header>

    <nav class="mt-6 flex gap-1 border-b" aria-label="Project sections">
      <RouterLink
        v-for="tab in tabs"
        :key="tab.to"
        :to="tab.to"
        class="-mb-px px-3 py-2 text-sm transition-colors"
        :class="[
          tab.mono ? 'font-mono' : '',
          route.path === tab.to
            ? 'border-b-2 border-primary text-foreground'
            : 'text-muted-foreground hover:text-foreground'
        ]"
      >
        {{ tab.label }}
      </RouterLink>
    </nav>
  </div>
</template>
