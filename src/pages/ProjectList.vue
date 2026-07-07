<script setup lang="ts">
import { ChevronRight } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import MetaBadge from '@/components/MetaBadge.vue'
import { useProjectsStore } from '@/stores/projects'

const store = useProjectsStore()
</script>

<template>
  <section class="mx-auto max-w-4xl px-8 pt-5 pb-10">
    <header class="flex items-end justify-between">
      <div>
        <h1 class="text-xl font-semibold tracking-tight">Projects</h1>
        <p class="mt-1 text-sm text-muted-foreground">Laravel apps this machine knows about.</p>
      </div>
      <Button v-if="store.projects.length" @click="store.add()">Add project</Button>
    </header>

    <div
      v-if="store.lastError"
      class="mt-5 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm"
      role="alert"
    >
      {{ store.lastError }}
    </div>

    <ul v-if="store.projects.length" class="mt-6 space-y-2">
      <li v-for="project in store.projects" :key="project.id">
        <RouterLink
          :to="`/projects/${project.id}`"
          class="group flex items-center gap-4 rounded-lg border bg-card px-5 py-4 transition-colors hover:border-primary/40"
        >
          <span class="font-mono text-lg leading-none text-primary" aria-hidden="true">❯</span>
          <div class="min-w-0 flex-1">
            <div class="truncate font-mono text-sm font-medium">{{ project.name }}</div>
            <div class="mt-0.5 truncate font-mono text-xs text-muted-foreground">
              {{ project.path }}
            </div>
          </div>
          <MetaBadge v-if="project.laravelVersion">Laravel {{ project.laravelVersion }}</MetaBadge>
          <MetaBadge v-if="project.phpConstraint">PHP {{ project.phpConstraint }}</MetaBadge>
          <ChevronRight
            class="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
          />
        </RouterLink>
      </li>
    </ul>

    <div
      v-else-if="store.loaded"
      class="mt-6 flex flex-col items-center rounded-xl border border-dashed px-8 py-20 text-center"
    >
      <p class="font-mono text-2xl text-primary" aria-hidden="true">
        ❯<span class="prompt-caret">_</span>
      </p>
      <h2 class="mt-6 text-lg font-semibold">No projects yet</h2>
      <p class="mt-2 max-w-sm text-sm text-balance text-muted-foreground">
        Add a Laravel project folder to get started. A valid project has an
        <code class="font-mono text-foreground/80">artisan</code> file and
        <code class="font-mono text-foreground/80">laravel/framework</code> in its composer.json.
      </p>
      <Button class="mt-6" @click="store.add()">Add project</Button>
    </div>
  </section>
</template>
