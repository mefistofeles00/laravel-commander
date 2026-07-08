<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { X } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import ProjectHeader from '@/components/ProjectHeader.vue'
import EnvRow from '@/components/EnvRow.vue'
import { useProjectsStore } from '@/stores/projects'
import type { EnvFileState, EnvProfile } from '@shared/types'

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

const profiles = ref<EnvProfile[]>([])
const newProfileName = ref('')
const armApply = ref<string | null>(null)
const armDelete = ref<string | null>(null)
const profileFlash = ref<string | null>(null)

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

async function loadProfiles(): Promise<void> {
  if (!project.value) return
  profiles.value = await window.api.listEnvProfiles(project.value.id)
}

function flashProfile(message: string): void {
  profileFlash.value = message
  setTimeout(() => (profileFlash.value = null), 2500)
}

async function saveProfile(): Promise<void> {
  const name = newProfileName.value.trim()
  if (!project.value || !name) return
  loadError.value = null
  try {
    profiles.value = await window.api.saveEnvProfile(project.value.id, name)
    newProfileName.value = ''
    flashProfile(`Saved current .env as "${name}"`)
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : String(error)
  }
}

async function applyProfile(name: string): Promise<void> {
  if (!project.value) return
  if (armApply.value !== name) {
    armApply.value = name
    setTimeout(() => (armApply.value = null), 3000)
    return
  }
  armApply.value = null
  loadError.value = null
  try {
    state.value = await window.api.applyEnvProfile(project.value.id, name)
    drafts.value = {}
    addedKeys.value = []
    flashProfile(`Applied "${name}" — .env replaced`)
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : String(error)
  }
}

async function deleteProfile(name: string): Promise<void> {
  if (!project.value) return
  if (armDelete.value !== name) {
    armDelete.value = name
    setTimeout(() => (armDelete.value = null), 3000)
    return
  }
  armDelete.value = null
  profiles.value = await window.api.deleteEnvProfile(project.value.id, name)
}

onMounted(() => {
  load()
  loadProfiles()
})
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
        <!-- Profiles: named .env snapshots stored in app data -->
        <div class="mt-6 flex flex-wrap items-center gap-2">
          <span class="text-xs text-muted-foreground">Profiles:</span>
          <template v-for="profile in profiles" :key="profile.name">
            <span class="inline-flex items-center overflow-hidden rounded-md border">
              <button
                class="px-2.5 py-1 font-mono text-xs transition-colors hover:bg-white/4"
                :class="armApply === profile.name ? 'text-warning' : ''"
                :title="`Replace .env with the “${profile.name}” snapshot`"
                @click="applyProfile(profile.name)"
              >
                {{ armApply === profile.name ? 'Apply? This replaces .env' : profile.name }}
              </button>
              <button
                class="border-l px-1.5 py-1 text-muted-foreground transition-colors hover:text-destructive"
                :class="armDelete === profile.name ? 'text-destructive' : ''"
                :title="
                  armDelete === profile.name
                    ? 'Click again to delete'
                    : `Delete profile ${profile.name}`
                "
                @click="deleteProfile(profile.name)"
              >
                <X class="size-3" />
              </button>
            </span>
          </template>
          <div class="ml-auto flex items-center gap-2">
            <Input
              v-model="newProfileName"
              placeholder="local, staging…"
              class="h-7 w-32 font-mono !text-xs"
              @keydown.enter="saveProfile"
            />
            <Button
              variant="outline"
              size="sm"
              class="h-7 text-xs"
              :disabled="!newProfileName.trim()"
              @click="saveProfile"
            >
              Save current as profile
            </Button>
          </div>
        </div>
        <p v-if="profileFlash" class="mt-2 text-xs text-success">{{ profileFlash }}</p>

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
