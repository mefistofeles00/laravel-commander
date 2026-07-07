<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button } from '@/components/ui/button'
import ProjectHeader from '@/components/ProjectHeader.vue'
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

async function remove(): Promise<void> {
  if (!project.value) return
  await store.remove(project.value.id)
  router.push('/')
}
</script>

<template>
  <section v-if="project" class="mx-auto max-w-4xl px-8 pt-5 pb-10">
    <ProjectHeader :project="project" />

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

    <section class="mt-10 border-t pt-6">
      <Button variant="outline" class="text-destructive hover:text-destructive" @click="remove">
        Remove from list
      </Button>
      <p class="mt-2 text-xs text-muted-foreground">
        Removes the project from Laravel Commander only. Files on disk are untouched.
      </p>
    </section>
  </section>

  <section v-else-if="store.loaded" class="mx-auto max-w-4xl px-8 pt-5">
    <RouterLink
      to="/"
      class="font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
    >
      ← projects
    </RouterLink>
    <p class="mt-4 text-sm text-muted-foreground">This project is no longer in your list.</p>
  </section>
</template>
