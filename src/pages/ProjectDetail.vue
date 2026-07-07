<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button } from '@/components/ui/button'
import { useProjectsStore } from '@/stores/projects'

const route = useRoute()
const router = useRouter()
const store = useProjectsStore()

const project = computed(() => store.byId(String(route.params.id)))

const addedOn = computed(() =>
  project.value
    ? new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(project.value.addedAt)
    : ''
)

function reveal(): void {
  if (project.value) window.api.revealProject(project.value.id)
}

async function remove(): Promise<void> {
  if (!project.value) return
  await store.remove(project.value.id)
  router.push('/')
}
</script>

<template>
  <section v-if="project" class="mx-auto max-w-3xl px-8 pt-5 pb-10">
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

    <dl class="mt-8 grid grid-cols-3 gap-px overflow-hidden rounded-lg border bg-border">
      <div class="bg-card px-4 py-3">
        <dt class="text-xs text-muted-foreground">Laravel</dt>
        <dd class="mt-1 font-mono text-sm">{{ project.laravelVersion ?? '—' }}</dd>
      </div>
      <div class="bg-card px-4 py-3">
        <dt class="text-xs text-muted-foreground">PHP requirement</dt>
        <dd class="mt-1 font-mono text-sm">{{ project.phpConstraint ?? '—' }}</dd>
      </div>
      <div class="bg-card px-4 py-3">
        <dt class="text-xs text-muted-foreground">Added</dt>
        <dd class="mt-1 font-mono text-sm">{{ addedOn }}</dd>
      </div>
    </dl>

    <section class="mt-10">
      <h2 class="text-sm font-medium text-muted-foreground">Tools</h2>
      <ul class="mt-3 space-y-2">
        <li
          class="flex items-center justify-between rounded-lg border bg-card/50 px-5 py-4 opacity-60"
        >
          <div>
            <div class="text-sm font-medium">.env editor</div>
            <div class="mt-0.5 text-xs text-muted-foreground">
              Edit environment values without breaking comments or order.
            </div>
          </div>
          <span class="font-mono text-xs text-muted-foreground">not available yet</span>
        </li>
        <li
          class="flex items-center justify-between rounded-lg border bg-card/50 px-5 py-4 opacity-60"
        >
          <div>
            <div class="text-sm font-medium">Artisan</div>
            <div class="mt-0.5 text-xs text-muted-foreground">
              Run artisan commands with live output.
            </div>
          </div>
          <span class="font-mono text-xs text-muted-foreground">not available yet</span>
        </li>
      </ul>
    </section>

    <section class="mt-10 border-t pt-6">
      <Button variant="outline" class="text-destructive hover:text-destructive" @click="remove">
        Remove from list
      </Button>
      <p class="mt-2 text-xs text-muted-foreground">
        Removes the project from Laravel Commander only. Files on disk are untouched.
      </p>
    </section>
  </section>

  <section v-else class="mx-auto max-w-3xl px-8 pt-5">
    <RouterLink
      to="/"
      class="font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
    >
      ← projects
    </RouterLink>
    <p class="mt-4 text-sm text-muted-foreground">This project is no longer in your list.</p>
  </section>
</template>
