<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import ProjectHeader from '@/components/ProjectHeader.vue'
import TerminalView from '@/components/TerminalView.vue'
import { useAppStore } from '@/stores/app'
import { useProjectsStore } from '@/stores/projects'
import type { ArtisanCommand } from '@shared/types'

const QUICK_ACTIONS = ['cache:clear', 'config:clear', 'route:clear', 'migrate', 'storage:link']

const route = useRoute()
const app = useAppStore()
const projects = useProjectsStore()

const project = computed(() => projects.byId(String(route.params.id)))

const catalog = ref<ArtisanCommand[] | null>(null)
const catalogError = ref<string | null>(null)
const loadingCatalog = ref(false)

const search = ref('')
const selected = ref<ArtisanCommand | null>(null)
const argValues = ref<Record<string, string>>({})
const optionValues = ref<Record<string, string | boolean>>({})

const running = ref(false)
const currentRunId = ref<string | null>(null)
const exitInfo = ref<{ exitCode: number | null; signal: string | null } | null>(null)
const runError = ref<string | null>(null)
const hasOutput = ref(false)

const terminal = ref<InstanceType<typeof TerminalView>>()
const terminalSection = ref<HTMLDivElement>()

const quickActions = computed(() =>
  QUICK_ACTIONS.filter((name) => catalog.value?.some((c) => c.name === name))
)

const grouped = computed(() => {
  const query = search.value.trim().toLowerCase()
  const matches = (catalog.value ?? []).filter(
    (c) => !query || c.name.includes(query) || c.description.toLowerCase().includes(query)
  )
  const groups = new Map<string, ArtisanCommand[]>()
  for (const command of matches) {
    const namespace = command.name.includes(':') ? command.name.split(':')[0] : 'app'
    groups.set(namespace, [...(groups.get(namespace) ?? []), command])
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
})

const missingRequired = computed(() =>
  (selected.value?.arguments ?? [])
    .filter((arg) => arg.isRequired && !(argValues.value[arg.name] ?? '').trim())
    .map((arg) => arg.name)
)

function select(command: ArtisanCommand): void {
  selected.value = command
  argValues.value = {}
  optionValues.value = {}
  exitInfo.value = null
  runError.value = null
}

async function loadCatalog(): Promise<void> {
  if (!project.value) return
  loadingCatalog.value = true
  catalogError.value = null
  const result = await window.api.listArtisanCommands(project.value.id)
  loadingCatalog.value = false
  if (result.ok) catalog.value = result.commands
  else catalogError.value = result.message
}

async function run(command?: ArtisanCommand): Promise<void> {
  const target = command ?? selected.value
  if (!project.value || !target || running.value) return

  const cliArgs = target.arguments
    .map((arg) => (argValues.value[arg.name] ?? '').trim())
    .filter((value) => value !== '')
  const options: Record<string, string | true> = {}
  for (const option of target.options) {
    const value = optionValues.value[option.name]
    if (value === true) options[option.name] = true
    else if (typeof value === 'string' && value.trim() !== '') options[option.name] = value.trim()
  }

  exitInfo.value = null
  runError.value = null
  hasOutput.value = true
  await nextTick()
  terminalSection.value?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  terminal.value?.clear()
  terminal.value?.write(
    `\x1b[90m❯ php artisan ${[target.name, ...cliArgs].join(' ')}\x1b[0m\r\n\r\n`
  )

  const result = await window.api.runArtisan(project.value.id, target.name, cliArgs, options)
  if (!result.ok) {
    runError.value = result.message
    return
  }
  currentRunId.value = result.runId
  running.value = true
}

function quickRun(name: string): void {
  const command = catalog.value?.find((c) => c.name === name)
  if (!command) return
  select(command)
  run(command)
}

async function cancel(): Promise<void> {
  if (currentRunId.value) await window.api.cancelArtisan(currentRunId.value)
}

const unsubscribe: Array<() => void> = []

onMounted(() => {
  loadCatalog()
  unsubscribe.push(
    window.api.onCommandOutput((event) => {
      if (event.runId === currentRunId.value) terminal.value?.write(event.chunk)
    }),
    window.api.onCommandExit((event) => {
      if (event.runId !== currentRunId.value) return
      running.value = false
      exitInfo.value = { exitCode: event.exitCode, signal: event.signal }
      const trailer =
        event.exitCode === 0
          ? '\r\n\x1b[32m✓ exit 0\x1b[0m\r\n'
          : event.signal
            ? `\r\n\x1b[31m✗ stopped (${event.signal})\x1b[0m\r\n`
            : `\r\n\x1b[31m✗ exit ${event.exitCode}\x1b[0m\r\n`
      terminal.value?.write(trailer)
    })
  )
})

onBeforeUnmount(() => unsubscribe.forEach((off) => off()))
</script>

<template>
  <section v-if="project" class="mx-auto max-w-5xl px-8 pt-5 pb-10">
    <ProjectHeader :project="project" />

    <!-- PHP missing: nothing below can work. -->
    <div
      v-if="app.phpChecked && !app.php"
      class="mt-6 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm"
      role="alert"
    >
      No PHP binary found on this machine. Install PHP (Herd, Homebrew, or your package manager) and
      reopen the app.
    </div>

    <template v-else>
      <div
        v-if="catalogError"
        class="mt-6 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm"
        role="alert"
      >
        <p>{{ catalogError }}</p>
        <Button variant="outline" size="sm" class="mt-3" @click="loadCatalog">Try again</Button>
      </div>

      <p v-else-if="loadingCatalog" class="mt-6 font-mono text-xs text-muted-foreground">
        Loading commands…
      </p>

      <template v-else-if="catalog">
        <!-- One-click favorites -->
        <div v-if="quickActions.length" class="mt-6">
          <h2 class="text-sm font-medium text-muted-foreground">Quick actions</h2>
          <div class="mt-2 flex flex-wrap gap-2">
            <button
              v-for="name in quickActions"
              :key="name"
              class="rounded-md border bg-card px-3 py-1.5 font-mono text-xs transition-colors hover:border-primary/40 disabled:opacity-50"
              :disabled="running"
              @click="quickRun(name)"
            >
              ❯ {{ name }}
            </button>
          </div>
        </div>

        <div class="mt-6 grid grid-cols-[260px_1fr] gap-4">
          <!-- Catalog -->
          <div class="flex flex-col rounded-lg border bg-card">
            <div class="border-b p-2">
              <Input v-model="search" placeholder="Filter commands…" class="h-8 !text-xs" />
            </div>
            <div class="h-96 overflow-y-auto p-2">
              <div v-for="[namespace, commands] in grouped" :key="namespace" class="mb-3">
                <div class="px-2 py-1 font-mono text-[10px] tracking-wider text-muted-foreground">
                  {{ namespace }}
                </div>
                <button
                  v-for="command in commands"
                  :key="command.name"
                  class="block w-full truncate rounded-md px-2 py-1 text-left font-mono text-xs transition-colors"
                  :class="
                    selected?.name === command.name
                      ? 'bg-white/6 text-foreground'
                      : 'text-muted-foreground hover:bg-white/4 hover:text-foreground'
                  "
                  :title="command.description"
                  @click="select(command)"
                >
                  {{ command.name }}
                </button>
              </div>
              <p
                v-if="grouped.length === 0"
                class="px-2 py-4 text-center text-xs text-muted-foreground"
              >
                No commands match "{{ search }}".
              </p>
            </div>
          </div>

          <!-- Selected command -->
          <div class="rounded-lg border bg-card p-5">
            <template v-if="selected">
              <h3 class="font-mono text-sm font-semibold">
                <span class="text-primary">❯</span> {{ selected.name }}
              </h3>
              <p v-if="selected.description" class="mt-1 text-sm text-muted-foreground">
                {{ selected.description }}
              </p>

              <div v-if="selected.arguments.length" class="mt-4 space-y-3">
                <div v-for="arg in selected.arguments" :key="arg.name">
                  <label class="font-mono text-xs" :for="`arg-${arg.name}`">
                    {{ arg.name }}<span v-if="arg.isRequired" class="text-primary">*</span>
                  </label>
                  <Input
                    :id="`arg-${arg.name}`"
                    v-model="argValues[arg.name]"
                    class="mt-1 h-8 font-mono !text-xs"
                    :placeholder="arg.description"
                  />
                </div>
              </div>

              <div v-if="selected.options.length" class="mt-4 space-y-2.5">
                <div
                  v-for="option in selected.options"
                  :key="option.name"
                  class="flex items-center gap-3"
                >
                  <template v-if="option.acceptValue">
                    <label
                      class="w-40 shrink-0 truncate font-mono text-xs"
                      :for="`opt-${option.name}`"
                      :title="option.description"
                    >
                      --{{ option.name }}
                    </label>
                    <Input
                      :id="`opt-${option.name}`"
                      class="h-8 font-mono !text-xs"
                      :model-value="String(optionValues[option.name] ?? '')"
                      :placeholder="option.description"
                      @update:model-value="optionValues[option.name] = String($event)"
                    />
                  </template>
                  <template v-else>
                    <Switch
                      :id="`opt-${option.name}`"
                      :model-value="optionValues[option.name] === true"
                      @update:model-value="optionValues[option.name] = $event"
                    />
                    <label
                      class="truncate font-mono text-xs"
                      :for="`opt-${option.name}`"
                      :title="option.description"
                    >
                      --{{ option.name }}
                    </label>
                  </template>
                </div>
              </div>

              <div class="mt-5 flex items-center gap-3">
                <Button
                  v-if="!running"
                  :disabled="missingRequired.length > 0"
                  :title="
                    missingRequired.length ? `Required: ${missingRequired.join(', ')}` : undefined
                  "
                  @click="run()"
                >
                  Run
                </Button>
                <Button v-else variant="outline" class="text-destructive" @click="cancel">
                  Cancel
                </Button>
                <span v-if="running" class="font-mono text-xs text-muted-foreground">running…</span>
                <span
                  v-else-if="exitInfo"
                  class="font-mono text-xs"
                  :class="exitInfo.exitCode === 0 ? 'text-success' : 'text-destructive'"
                >
                  {{
                    exitInfo.exitCode === 0
                      ? '✓ exit 0'
                      : exitInfo.signal
                        ? `✗ stopped (${exitInfo.signal})`
                        : `✗ exit ${exitInfo.exitCode}`
                  }}
                </span>
              </div>

              <p v-if="runError" class="mt-3 text-sm text-destructive" role="alert">
                {{ runError }}
              </p>
            </template>

            <p v-else class="py-10 text-center text-sm text-muted-foreground">
              Pick a command from the list — or use a quick action above.
            </p>

            <!-- Live output, right under the command that produced it -->
            <div v-show="hasOutput" ref="terminalSection" class="mt-5">
              <TerminalView ref="terminal" />
            </div>
          </div>
        </div>
      </template>
    </template>
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
