<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Code2, Globe, TerminalSquare } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import ProjectHeader from '@/components/ProjectHeader.vue'
import { useProjectsStore } from '@/stores/projects'
import type { EditorChoice, OpenTarget } from '@shared/types'

const EDITORS: { value: EditorChoice; label: string }[] = [
  { value: 'vscode', label: 'VS Code' },
  { value: 'phpstorm', label: 'PhpStorm' },
  { value: 'cursor', label: 'Cursor' }
]

const route = useRoute()
const router = useRouter()
const store = useProjectsStore()

const project = computed(() => store.byId(String(route.params.id)))
const editor = ref<EditorChoice>('vscode')
const openError = ref<string | null>(null)

const addedOn = computed(() =>
  project.value
    ? new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(project.value.addedAt)
    : ''
)

async function open(target: OpenTarget): Promise<void> {
  if (!project.value) return
  openError.value = null
  const result = await window.api.openProject(project.value.id, target)
  if (!result.ok && result.message) openError.value = result.message
}

async function changeEditor(value: string): Promise<void> {
  editor.value = await window.api.setEditor(value as EditorChoice)
}

async function remove(): Promise<void> {
  if (!project.value) return
  await store.remove(project.value.id)
  router.push('/')
}

onMounted(async () => {
  editor.value = await window.api.getEditor()
})
</script>

<template>
  <section v-if="project" class="mx-auto max-w-4xl px-8 pt-5 pb-10">
    <ProjectHeader :project="project" />

    <div class="mt-6 flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" class="gap-1.5" @click="open('editor')">
        <Code2 class="size-3.5" /> Open in editor
      </Button>
      <Button variant="outline" size="sm" class="gap-1.5" @click="open('terminal')">
        <TerminalSquare class="size-3.5" /> Open in terminal
      </Button>
      <Button variant="outline" size="sm" class="gap-1.5" @click="open('browser')">
        <Globe class="size-3.5" /> Open in browser
      </Button>
      <select
        class="ml-auto h-8 rounded-md border bg-transparent px-2 font-mono text-xs text-muted-foreground focus-visible:ring-[2px] focus-visible:ring-ring/50 focus-visible:outline-none"
        :value="editor"
        title="Editor used by every open-in-editor action"
        @change="changeEditor(($event.target as HTMLSelectElement).value)"
      >
        <option v-for="choice in EDITORS" :key="choice.value" :value="choice.value">
          {{ choice.label }}
        </option>
      </select>
    </div>

    <p v-if="openError" class="mt-2 text-xs text-warning">{{ openError }}</p>

    <dl class="mt-6 grid grid-cols-3 gap-px overflow-hidden rounded-lg border bg-border">
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
