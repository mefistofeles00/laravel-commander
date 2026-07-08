<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ExternalLink } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import ProjectHeader from '@/components/ProjectHeader.vue'
import TerminalView from '@/components/TerminalView.vue'
import { useProjectsStore } from '@/stores/projects'
import type { DevProcessInfo, DevRole } from '@shared/types'

const ROLE_LABELS: Record<DevRole, string> = {
  serve: 'php artisan serve',
  vite: 'vite dev server',
  queue: 'queue worker',
  reverb: 'reverb websockets'
}

const route = useRoute()
const projects = useProjectsStore()

const project = computed(() => projects.byId(String(route.params.id)))

const processes = ref<DevProcessInfo[]>([])
const loaded = ref(false)
const actionError = ref<string | null>(null)
const selectedRole = ref<DevRole | null>(null)
const now = ref(Date.now())

const terminal = ref<InstanceType<typeof TerminalView>>()
let clock: ReturnType<typeof setInterval> | undefined

const available = computed(() => processes.value.filter((p) => p.available))
const unavailable = computed(() => processes.value.filter((p) => !p.available))
const anyRunning = computed(() => processes.value.some((p) => p.status === 'running'))
const selected = computed(() => processes.value.find((p) => p.role === selectedRole.value))

function uptime(startedAt?: number): string {
  if (!startedAt) return ''
  const seconds = Math.max(0, Math.floor((now.value - startedAt) / 1000))
  if (seconds < 60) return `up ${seconds}s`
  if (seconds < 3600) return `up ${Math.floor(seconds / 60)}m`
  return `up ${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
}

function statusDot(process: DevProcessInfo): string {
  if (process.status === 'running') return 'bg-success'
  if (process.status === 'crashed') return 'bg-destructive'
  return 'bg-muted-foreground/40'
}

async function refresh(selectFirstRunning = false): Promise<void> {
  if (!project.value) return
  processes.value = await window.api.listDevProcesses(project.value.id)
  loaded.value = true
  if ((selectFirstRunning || !selectedRole.value) && processes.value.length) {
    const preferred =
      processes.value.find((p) => p.status === 'running') ??
      processes.value.find((p) => p.available)
    if (preferred) selectRole(preferred.role)
  }
}

function selectRole(role: DevRole): void {
  if (selectedRole.value === role) return
  selectedRole.value = role
  terminal.value?.clear()
  const buffer = processes.value.find((p) => p.role === role)?.buffer
  if (buffer) terminal.value?.write(buffer)
}

async function start(role: DevRole): Promise<void> {
  if (!project.value) return
  actionError.value = null
  const result = await window.api.startDevProcess(project.value.id, role)
  if (!result.ok && result.message) actionError.value = result.message
  await refresh()
  selectRole(role)
}

async function stop(role: DevRole): Promise<void> {
  if (!project.value) return
  await window.api.stopDevProcess(project.value.id, role)
}

async function startAll(): Promise<void> {
  if (!project.value) return
  actionError.value = null
  const result = await window.api.startAllDevProcesses(project.value.id)
  if (!result.ok && result.message) actionError.value = result.message
  await refresh(true)
}

async function stopAll(): Promise<void> {
  if (!project.value) return
  await window.api.stopAllDevProcesses(project.value.id)
}

function openUrl(url: string): void {
  window.open(url, '_blank')
}

const unsubscribe: Array<() => void> = []

onMounted(() => {
  refresh(true)
  clock = setInterval(() => (now.value = Date.now()), 10_000)
  unsubscribe.push(
    window.api.onDevStatus((event) => {
      if (event.projectId !== project.value?.id) return
      const index = processes.value.findIndex((p) => p.role === event.process.role)
      if (index >= 0) {
        // Keep availability/buffer from the list call; the event carries runtime state.
        processes.value[index] = { ...processes.value[index], ...event.process, available: true }
      }
    }),
    window.api.onCommandOutput((event) => {
      if (event.runId && event.runId === selected.value?.runId) terminal.value?.write(event.chunk)
      // Keep buffers in sync for non-selected processes too.
      const target = processes.value.find((p) => p.runId === event.runId)
      if (target) target.buffer = (target.buffer ?? '') + event.chunk
    })
  )
})

onBeforeUnmount(() => {
  unsubscribe.forEach((off) => off())
  if (clock) clearInterval(clock)
})
</script>

<template>
  <section v-if="project" class="mx-auto max-w-5xl px-8 pt-5 pb-10">
    <ProjectHeader :project="project" />

    <div class="mt-6 flex items-center justify-between">
      <div>
        <h2 class="text-sm font-medium text-muted-foreground">Development processes</h2>
        <p class="mt-0.5 text-xs text-muted-foreground">
          Everything started here stops when the app quits.
        </p>
      </div>
      <div class="flex gap-2">
        <Button v-if="!anyRunning" size="sm" :disabled="!available.length" @click="startAll">
          ▶ Start all
        </Button>
        <Button v-else variant="outline" size="sm" class="text-destructive" @click="stopAll">
          ■ Stop all
        </Button>
      </div>
    </div>

    <div
      v-if="actionError"
      class="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm"
      role="alert"
    >
      {{ actionError }}
    </div>

    <div v-if="loaded" class="mt-4 grid grid-cols-2 gap-3">
      <div
        v-for="process in available"
        :key="process.role"
        class="rounded-lg border bg-card px-4 py-3"
        :class="selectedRole === process.role ? 'border-primary/40' : ''"
      >
        <button class="flex w-full items-center gap-2 text-left" @click="selectRole(process.role)">
          <span class="size-2 shrink-0 rounded-full" :class="statusDot(process)" />
          <span class="min-w-0 flex-1 truncate font-mono text-sm">{{
            ROLE_LABELS[process.role]
          }}</span>
          <span v-if="process.status === 'crashed'" class="font-mono text-[10px] text-destructive">
            crashed{{ process.exitCode !== null ? ` (exit ${process.exitCode})` : '' }}
          </span>
          <span
            v-else-if="process.status === 'running'"
            class="font-mono text-[10px] text-muted-foreground"
          >
            {{ uptime(process.startedAt) }}
          </span>
        </button>

        <div class="mt-2 flex items-center gap-2">
          <Button
            v-if="process.status !== 'running'"
            variant="outline"
            size="sm"
            class="h-7 font-mono text-xs"
            @click="start(process.role)"
          >
            {{ process.status === 'crashed' ? 'Restart' : 'Start' }}
          </Button>
          <Button
            v-else
            variant="outline"
            size="sm"
            class="h-7 font-mono text-xs text-destructive"
            @click="stop(process.role)"
          >
            Stop
          </Button>
          <button
            v-if="process.url && process.status === 'running'"
            class="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
            @click="openUrl(process.url)"
          >
            {{ process.url }}
            <ExternalLink class="size-3" />
          </button>
        </div>
        <p v-if="process.hint" class="mt-2 text-xs text-warning">{{ process.hint }}</p>
      </div>

      <div
        v-for="process in unavailable"
        :key="process.role"
        class="rounded-lg border border-dashed px-4 py-3 opacity-50"
      >
        <div class="flex items-center gap-2">
          <span class="size-2 shrink-0 rounded-full bg-muted-foreground/30" />
          <span class="font-mono text-sm">{{ ROLE_LABELS[process.role] }}</span>
        </div>
        <p class="mt-1.5 text-xs text-muted-foreground">{{ process.hint }}</p>
      </div>
    </div>

    <div v-if="loaded && available.length" class="mt-4">
      <div class="mb-2 flex gap-1">
        <button
          v-for="process in available"
          :key="process.role"
          class="rounded-md px-2.5 py-1 font-mono text-xs transition-colors"
          :class="
            selectedRole === process.role
              ? 'bg-white/6 text-foreground'
              : 'text-muted-foreground hover:bg-white/4 hover:text-foreground'
          "
          @click="selectRole(process.role)"
        >
          {{ process.role }}
        </button>
      </div>
      <TerminalView ref="terminal" />
    </div>
  </section>

  <section v-else-if="projects.loaded" class="mx-auto max-w-5xl px-8 pt-5">
    <RouterLink
      to="/"
      class="font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
    >
      ← projects
    </RouterLink>
    <p class="mt-4 text-sm text-muted-foreground">This project is no longer in your list.</p>
  </section>
</template>
