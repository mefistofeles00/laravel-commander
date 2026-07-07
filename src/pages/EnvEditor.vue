<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Button } from '@/components/ui/button'
import ProjectHeader from '@/components/ProjectHeader.vue'
import EnvRow from '@/components/EnvRow.vue'
import { useProjectsStore } from '@/stores/projects'
import type { EnvFileState } from '@shared/types'

const route = useRoute()
const projects = useProjectsStore()

const project = computed(() => projects.byId(String(route.params.id)))

const state = ref<EnvFileState | null>(null)
const loadError = ref<string | null>(null)
const drafts = ref<Record<string, string>>({})
/** Keys added in this session (from the missing-keys banner) but not saved yet. */
const addedKeys = ref<string[]>([])
const saving = ref(false)
const savedFlash = ref(false)

const rows = computed(() => {
  if (!state.value) return []
  const existing = state.value.entries.map((entry) => ({
    key: entry.key,
    original: entry.value
  }))
  const added = addedKeys.value.map((key) => ({ key, original: '' }))
  return [...existing, ...added]
})

const extraKeySet = computed(() => new Set(state.value?.extraKeys ?? []))

const missingKeys = computed(() =>
  (state.value?.missingKeys ?? []).filter((key) => !addedKeys.value.includes(key))
)

const dirtyCount = computed(() => Object.keys(drafts.value).length + addedKeys.value.length)

function valueOf(key: string, original: string): string {
  return drafts.value[key] ?? original
}

function setValue(key: string, value: string, original: string): void {
  if (addedKeys.value.includes(key)) {
    drafts.value[key] = value
    return
  }
  if (value === original) delete drafts.value[key]
  else drafts.value[key] = value
}

function addMissingKey(key: string): void {
  addedKeys.value.push(key)
  drafts.value[key] = ''
}

async function load(): Promise<void> {
  if (!project.value) return
  loadError.value = null
  try {
    state.value = await window.api.readEnv(project.value.id)
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : String(error)
  }
}

async function save(): Promise<void> {
  if (!project.value || dirtyCount.value === 0) return
  saving.value = true
  try {
    state.value = await window.api.writeEnv(project.value.id, { ...drafts.value })
    drafts.value = {}
    addedKeys.value = []
    savedFlash.value = true
    setTimeout(() => (savedFlash.value = false), 2000)
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : String(error)
  } finally {
    saving.value = false
  }
}

function discard(): void {
  drafts.value = {}
  addedKeys.value = []
}

async function createFromExample(): Promise<void> {
  if (!project.value) return
  loadError.value = null
  try {
    state.value = await window.api.initEnv(project.value.id)
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : String(error)
  }
}

onMounted(load)
</script>

<template>
  <section v-if="project" class="mx-auto max-w-4xl px-8 pt-5 pb-24">
    <ProjectHeader :project="project" />

    <div
      v-if="loadError"
      class="mt-6 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm"
      role="alert"
    >
      {{ loadError }}
    </div>

    <template v-if="state">
      <!-- .env missing -->
      <div
        v-if="!state.exists"
        class="mt-6 flex flex-col items-center rounded-xl border border-dashed px-8 py-16 text-center"
      >
        <p class="font-mono text-sm text-muted-foreground">No .env file in this project.</p>
        <Button v-if="state.exampleExists" class="mt-5" @click="createFromExample">
          Create from .env.example
        </Button>
        <p v-else class="mt-2 text-xs text-muted-foreground">
          There's no .env.example to copy from either — create a .env file by hand first.
        </p>
      </div>

      <template v-else>
        <div
          v-if="missingKeys.length"
          class="mt-6 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3"
        >
          <p class="text-sm">In .env.example but missing here:</p>
          <div class="mt-2 flex flex-wrap gap-2">
            <button
              v-for="key in missingKeys"
              :key="key"
              class="rounded-md border border-warning/40 px-2 py-0.5 font-mono text-xs transition-colors hover:bg-warning/20"
              :title="`Add ${key} with an empty value`"
              @click="addMissingKey(key)"
            >
              + {{ key }}
            </button>
          </div>
        </div>

        <div class="mt-6 divide-y overflow-hidden rounded-lg border bg-card">
          <EnvRow
            v-for="row in rows"
            :key="row.key"
            :env-key="row.key"
            :original="row.original"
            :extra="extraKeySet.has(row.key)"
            :model-value="valueOf(row.key, row.original)"
            @update:model-value="setValue(row.key, $event, row.original)"
          />
        </div>

        <!-- Save bar -->
        <div
          v-if="dirtyCount > 0 || savedFlash"
          class="fixed right-8 bottom-6 left-72 z-20 mx-auto flex max-w-3xl items-center justify-between rounded-lg border bg-popover px-4 py-3 shadow-lg"
        >
          <span v-if="dirtyCount > 0" class="text-sm">
            {{ dirtyCount }} unsaved {{ dirtyCount === 1 ? 'change' : 'changes' }}
          </span>
          <span v-else class="text-sm text-success">Saved</span>
          <div v-if="dirtyCount > 0" class="flex gap-2">
            <Button variant="ghost" size="sm" @click="discard">Discard</Button>
            <Button size="sm" :disabled="saving" @click="save">
              {{ saving ? 'Saving…' : 'Save' }}
            </Button>
          </div>
        </div>
      </template>
    </template>
  </section>

  <section v-else-if="projects.loaded" class="mx-auto max-w-4xl px-8 pt-5">
    <RouterLink
      to="/"
      class="font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
    >
      ← projects
    </RouterLink>
    <p class="mt-4 text-sm text-muted-foreground">This project is no longer in your list.</p>
  </section>
</template>
