<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ExternalLink } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import ProjectHeader from '@/components/ProjectHeader.vue'
import { useProjectsStore } from '@/stores/projects'
import type { FailedJob, LogEntry, LogFileInfo, LogReadResult } from '@shared/types'

const ERROR_LEVELS = new Set(['emergency', 'alert', 'critical', 'error'])
const WARN_LEVELS = new Set(['warning', 'notice'])

type LevelFilter = 'all' | 'errors' | 'warnings' | 'info'

const route = useRoute()
const projects = useProjectsStore()

const project = computed(() => projects.byId(String(route.params.id)))

const files = ref<LogFileInfo[]>([])
const selectedFile = ref<string | null>(null)
const result = ref<LogReadResult | null>(null)
const loaded = ref(false)
const loadError = ref<string | null>(null)
const levelFilter = ref<LevelFilter>('all')
const search = ref('')
const expanded = ref<Set<number>>(new Set())
const confirmClear = ref(false)

const failedJobs = ref<FailedJob[] | null>(null)
const failedJobsError = ref<string | null>(null)
const failedJobsRaw = ref<string | null>(null)
const jobActionOutput = ref<string | null>(null)
const jobBusy = ref(false)
const confirmFlush = ref(false)

const filteredEntries = computed(() => {
  if (!result.value) return []
  const query = search.value.trim().toLowerCase()
  return result.value.entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => {
      if (levelFilter.value === 'errors' && !ERROR_LEVELS.has(entry.level)) return false
      if (levelFilter.value === 'warnings' && !WARN_LEVELS.has(entry.level)) return false
      if (
        levelFilter.value === 'info' &&
        (ERROR_LEVELS.has(entry.level) || WARN_LEVELS.has(entry.level))
      ) {
        return false
      }
      if (query && !entry.message.toLowerCase().includes(query)) return false
      return true
    })
    .reverse() // newest first
})

function levelDot(entry: LogEntry): string {
  if (ERROR_LEVELS.has(entry.level)) return 'bg-destructive'
  if (WARN_LEVELS.has(entry.level)) return 'bg-warning'
  return 'bg-muted-foreground/50'
}

function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function toggle(index: number): void {
  const next = new Set(expanded.value)
  if (next.has(index)) next.delete(index)
  else next.add(index)
  expanded.value = next
}

async function loadFiles(): Promise<void> {
  if (!project.value) return
  files.value = await window.api.listLogFiles(project.value.id)
  loaded.value = true
  if (!selectedFile.value && files.value.length) {
    await selectFile(files.value[0].name)
  }
}

async function selectFile(name: string): Promise<void> {
  if (!project.value) return
  selectedFile.value = name
  expanded.value = new Set()
  loadError.value = null
  try {
    result.value = await window.api.readLog(project.value.id, name)
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : String(error)
    result.value = null
  }
}

async function refresh(): Promise<void> {
  if (selectedFile.value) await selectFile(selectedFile.value)
}

async function clearFile(): Promise<void> {
  if (!project.value || !selectedFile.value) return
  if (!confirmClear.value) {
    confirmClear.value = true
    setTimeout(() => (confirmClear.value = false), 3000)
    return
  }
  confirmClear.value = false
  result.value = await window.api.clearLog(project.value.id, selectedFile.value)
}

function openFrame(entry: LogEntry): void {
  if (!project.value || !entry.appFrame) return
  window.api.openProjectFile(project.value.id, entry.appFrame.file, entry.appFrame.line)
}

async function loadFailedJobs(): Promise<void> {
  if (!project.value) return
  failedJobsError.value = null
  failedJobsRaw.value = null
  const response = await window.api.listFailedJobs(project.value.id)
  if (response.ok) {
    failedJobs.value = response.jobs
  } else {
    failedJobs.value = null
    failedJobsError.value = response.message
    failedJobsRaw.value = response.raw ?? null
  }
}

async function jobAction(action: 'retry' | 'forget', uuid: string): Promise<void> {
  if (!project.value || jobBusy.value) return
  jobBusy.value = true
  const call = action === 'retry' ? window.api.retryFailedJob : window.api.forgetFailedJob
  const output = await call(project.value.id, uuid)
  jobActionOutput.value = output.output
  jobBusy.value = false
  await loadFailedJobs()
}

async function flushJobs(): Promise<void> {
  if (!project.value || jobBusy.value) return
  if (!confirmFlush.value) {
    confirmFlush.value = true
    setTimeout(() => (confirmFlush.value = false), 3000)
    return
  }
  confirmFlush.value = false
  jobBusy.value = true
  const output = await window.api.flushFailedJobs(project.value.id)
  jobActionOutput.value = output.output
  jobBusy.value = false
  await loadFailedJobs()
}

const unsubscribe: Array<() => void> = []

onMounted(() => {
  loadFiles()
  loadFailedJobs()
  unsubscribe.push(
    window.api.onLogAppended((event) => {
      if (event.projectId === project.value?.id && event.file === selectedFile.value) refresh()
    })
  )
})

onBeforeUnmount(() => unsubscribe.forEach((off) => off()))
</script>

<template>
  <section v-if="project" class="mx-auto max-w-4xl px-8 pt-5 pb-10">
    <ProjectHeader :project="project" />

    <template v-if="loaded && files.length === 0">
      <div class="mt-6 flex flex-col items-center rounded-xl border border-dashed px-8 py-16">
        <p class="font-mono text-sm text-muted-foreground">No log files in storage/logs.</p>
      </div>
    </template>

    <template v-else-if="loaded">
      <!-- Toolbar -->
      <div class="mt-6 flex flex-wrap items-center gap-2">
        <select
          class="h-8 rounded-md border bg-transparent px-2 font-mono text-xs focus-visible:ring-[2px] focus-visible:ring-ring/50 focus-visible:outline-none"
          :value="selectedFile ?? ''"
          @change="selectFile(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="file in files" :key="file.name" :value="file.name">
            {{ file.name }} ({{ sizeLabel(file.size) }})
          </option>
        </select>

        <div class="flex gap-1">
          <button
            v-for="filter in ['all', 'errors', 'warnings', 'info'] as const"
            :key="filter"
            class="rounded-md px-2.5 py-1 font-mono text-xs transition-colors"
            :class="
              levelFilter === filter
                ? 'bg-white/6 text-foreground'
                : 'text-muted-foreground hover:bg-white/4 hover:text-foreground'
            "
            @click="levelFilter = filter"
          >
            {{ filter }}
          </button>
        </div>

        <Input v-model="search" placeholder="Search messages…" class="h-8 max-w-52 !text-xs" />

        <Button
          variant="outline"
          size="sm"
          class="ml-auto h-8 font-mono text-xs"
          :class="confirmClear ? 'text-destructive' : ''"
          @click="clearFile"
        >
          {{ confirmClear ? 'Click again to clear' : 'Clear file' }}
        </Button>
      </div>

      <p v-if="result?.truncated" class="mt-2 font-mono text-[10px] text-muted-foreground">
        Large file — showing the most recent {{ sizeLabel(512 * 1024) }}.
      </p>

      <div
        v-if="loadError"
        class="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm"
        role="alert"
      >
        {{ loadError }}
      </div>

      <!-- Entries -->
      <ul v-if="result" class="mt-4 space-y-1.5">
        <li
          v-for="{ entry, index } in filteredEntries"
          :key="`${entry.timestamp}-${index}`"
          class="rounded-lg border bg-card"
        >
          <button
            class="flex w-full items-baseline gap-3 px-4 py-2.5 text-left"
            @click="toggle(index)"
          >
            <span
              class="size-1.5 shrink-0 translate-y-[-1px] rounded-full"
              :class="levelDot(entry)"
            />
            <span class="shrink-0 font-mono text-[10px] text-muted-foreground">
              {{ entry.timestamp }}
            </span>
            <span class="min-w-0 flex-1 truncate font-mono text-xs">{{ entry.message }}</span>
            <span
              v-if="entry.count > 1"
              class="shrink-0 rounded-md bg-secondary/60 px-1.5 font-mono text-[10px] text-muted-foreground"
            >
              ×{{ entry.count }}
            </span>
          </button>
          <div v-if="expanded.has(index)" class="border-t px-4 py-3">
            <div class="flex items-start justify-between gap-3">
              <p class="font-mono text-xs break-all whitespace-pre-wrap select-text">
                {{ entry.message }}
              </p>
              <button
                v-if="entry.appFrame"
                class="inline-flex shrink-0 items-center gap-1 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
                :title="`Open ${entry.appFrame.file}:${entry.appFrame.line} in your editor`"
                @click="openFrame(entry)"
              >
                {{ entry.appFrame.file }}:{{ entry.appFrame.line }}
                <ExternalLink class="size-3" />
              </button>
            </div>
            <pre
              v-if="entry.stack.length"
              class="mt-2 max-h-64 overflow-auto font-mono text-[11px] leading-relaxed text-muted-foreground select-text"
              >{{ entry.stack.join('\n') }}</pre>
          </div>
        </li>
      </ul>
      <p
        v-if="result && filteredEntries.length === 0"
        class="mt-6 text-center text-sm text-muted-foreground"
      >
        No entries match the current filter.
      </p>

      <!-- Failed jobs -->
      <section class="mt-10">
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-medium text-muted-foreground">
            Failed jobs
            <span v-if="failedJobs" class="font-mono text-xs">({{ failedJobs.length }})</span>
          </h2>
          <div class="flex gap-2">
            <Button variant="ghost" size="sm" class="h-7 text-xs" @click="loadFailedJobs">
              Refresh
            </Button>
            <Button
              v-if="failedJobs && failedJobs.length"
              variant="outline"
              size="sm"
              class="h-7 text-xs"
              :class="confirmFlush ? 'text-destructive' : ''"
              :disabled="jobBusy"
              @click="flushJobs"
            >
              {{ confirmFlush ? 'Click again to delete all' : 'Flush all' }}
            </Button>
          </div>
        </div>

        <div
          v-if="failedJobsError"
          class="mt-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm"
        >
          <p>{{ failedJobsError }}</p>
          <pre
            v-if="failedJobsRaw"
            class="mt-2 max-h-40 overflow-auto font-mono text-[11px] text-muted-foreground select-text"
            >{{ failedJobsRaw }}</pre>
        </div>

        <p
          v-else-if="failedJobs && failedJobs.length === 0"
          class="mt-3 text-sm text-muted-foreground"
        >
          No failed jobs. 🎉
        </p>

        <ul v-else-if="failedJobs" class="mt-3 space-y-1.5">
          <li
            v-for="job in failedJobs"
            :key="job.uuid"
            class="flex items-center gap-3 rounded-lg border bg-card px-4 py-2.5"
          >
            <span class="shrink-0 font-mono text-[10px] text-muted-foreground">
              {{ job.uuid.slice(0, 8) }}
            </span>
            <span class="min-w-0 flex-1 truncate font-mono text-xs">{{ job.description }}</span>
            <Button
              variant="outline"
              size="sm"
              class="h-7 font-mono text-xs"
              :disabled="jobBusy"
              @click="jobAction('retry', job.uuid)"
            >
              Retry
            </Button>
            <Button
              variant="ghost"
              size="sm"
              class="h-7 font-mono text-xs text-destructive"
              :disabled="jobBusy"
              @click="jobAction('forget', job.uuid)"
            >
              Forget
            </Button>
          </li>
        </ul>

        <p v-if="jobActionOutput" class="mt-2 font-mono text-xs text-muted-foreground select-text">
          {{ jobActionOutput }}
        </p>
      </section>
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
