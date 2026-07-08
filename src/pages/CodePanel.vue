<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ExternalLink } from 'lucide-vue-next'
import { Input } from '@/components/ui/input'
import ProjectHeader from '@/components/ProjectHeader.vue'
import { useProjectsStore } from '@/stores/projects'
import type { ModelDetail, ModelInfo, RouteInfo } from '@shared/types'

type SubView = 'routes' | 'models'
type MethodFilter = 'ALL' | 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

const METHOD_COLORS: Record<string, string> = {
  GET: 'text-success',
  POST: 'text-primary',
  PUT: 'text-warning',
  PATCH: 'text-warning',
  DELETE: 'text-destructive'
}

const route = useRoute()
const projects = useProjectsStore()

const project = computed(() => projects.byId(String(route.params.id)))

const view = ref<SubView>('routes')

const routes = ref<RouteInfo[] | null>(null)
const routesError = ref<string | null>(null)
const routeSearch = ref('')
const methodFilter = ref<MethodFilter>('ALL')

const models = ref<ModelInfo[]>([])
const selectedModel = ref<string | null>(null)
const modelDetail = ref<ModelDetail | null>(null)
const modelError = ref<string | null>(null)
const modelLoading = ref(false)

const filteredRoutes = computed(() => {
  if (!routes.value) return []
  const query = routeSearch.value.trim().toLowerCase()
  return routes.value.filter((r) => {
    if (methodFilter.value !== 'ALL' && !r.method.includes(methodFilter.value)) return false
    if (!query) return true
    return (
      r.uri.toLowerCase().includes(query) ||
      (r.name ?? '').toLowerCase().includes(query) ||
      r.action.toLowerCase().includes(query)
    )
  })
})

function primaryMethod(method: string): string {
  // "GET|HEAD" -> "GET"
  return method.split('|')[0]
}

function shortAction(action: string): string {
  const [className, methodName] = action.split('@')
  const short = className.split('\\').pop() ?? className
  return methodName ? `${short}@${methodName}` : short
}

function shortClass(name: string | null): string {
  return name ? (name.split('\\').pop() ?? name) : ''
}

async function loadRoutes(): Promise<void> {
  if (!project.value) return
  routesError.value = null
  const result = await window.api.listRoutes(project.value.id)
  if (result.ok) routes.value = result.routes
  else routesError.value = result.message
}

async function loadModels(): Promise<void> {
  if (!project.value) return
  models.value = await window.api.listModels(project.value.id)
  if (!selectedModel.value && models.value.length) selectModel(models.value[0].class)
}

async function selectModel(modelClass: string): Promise<void> {
  if (!project.value) return
  selectedModel.value = modelClass
  modelDetail.value = null
  modelError.value = null
  modelLoading.value = true
  const result = await window.api.getModelDetail(project.value.id, modelClass)
  modelLoading.value = false
  if (result.ok) modelDetail.value = result.detail
  else modelError.value = result.message
}

function openRoute(info: RouteInfo): void {
  if (!project.value || !info.file) return
  window.api.openProjectFile(project.value.id, info.file)
}

function openModel(info: ModelInfo): void {
  if (!project.value) return
  window.api.openProjectFile(project.value.id, info.file)
}

onMounted(() => {
  loadRoutes()
  loadModels()
})
</script>

<template>
  <section v-if="project" class="mx-auto max-w-5xl px-8 pt-5 pb-10">
    <ProjectHeader :project="project" />

    <div class="mt-6 flex gap-1">
      <button
        v-for="sub in ['routes', 'models'] as const"
        :key="sub"
        class="rounded-md px-3 py-1.5 text-sm transition-colors"
        :class="
          view === sub
            ? 'bg-white/6 text-foreground'
            : 'text-muted-foreground hover:bg-white/4 hover:text-foreground'
        "
        @click="view = sub"
      >
        {{ sub === 'routes' ? 'Routes' : 'Models' }}
      </button>
    </div>

    <!-- Routes -->
    <template v-if="view === 'routes'">
      <div
        v-if="routesError"
        class="mt-4 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm"
      >
        {{ routesError }}
      </div>

      <template v-else-if="routes">
        <div class="mt-4 flex flex-wrap items-center gap-2">
          <div class="flex gap-1">
            <button
              v-for="method in ['ALL', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const"
              :key="method"
              class="rounded-md px-2 py-1 font-mono text-xs transition-colors"
              :class="
                methodFilter === method
                  ? 'bg-white/6 text-foreground'
                  : 'text-muted-foreground hover:bg-white/4 hover:text-foreground'
              "
              @click="methodFilter = method"
            >
              {{ method }}
            </button>
          </div>
          <Input
            v-model="routeSearch"
            placeholder="Search uri, name or action…"
            class="h-8 max-w-64 !text-xs"
          />
          <span class="ml-auto font-mono text-xs text-muted-foreground">
            {{ filteredRoutes.length }} / {{ routes.length }}
          </span>
        </div>

        <ul class="mt-3 divide-y overflow-hidden rounded-lg border bg-card">
          <li
            v-for="(info, index) in filteredRoutes"
            :key="`${info.method}-${info.uri}-${index}`"
            class="flex items-center gap-3 px-4 py-2"
          >
            <span
              class="w-14 shrink-0 font-mono text-xs font-semibold"
              :class="METHOD_COLORS[primaryMethod(info.method)] ?? 'text-muted-foreground'"
            >
              {{ primaryMethod(info.method) }}
            </span>
            <span class="min-w-0 flex-1 truncate font-mono text-xs"
              >/{{ info.uri.replace(/^\//, '') }}</span
            >
            <span v-if="info.name" class="shrink-0 font-mono text-[10px] text-muted-foreground">
              {{ info.name }}
            </span>
            <span
              v-for="mw in info.middleware.slice(0, 3)"
              :key="mw"
              class="shrink-0 rounded-md bg-secondary/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
              :title="info.middleware.join(', ')"
            >
              {{ shortClass(mw) }}
            </span>
            <button
              v-if="info.file"
              class="inline-flex shrink-0 items-center gap-1 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
              :title="`Open ${info.file} in your editor`"
              @click="openRoute(info)"
            >
              {{ shortAction(info.action) }}
              <ExternalLink class="size-3" />
            </button>
            <span v-else class="shrink-0 font-mono text-xs text-muted-foreground/60">
              {{ shortAction(info.action) || 'Closure' }}
            </span>
          </li>
        </ul>
        <p
          v-if="filteredRoutes.length === 0"
          class="mt-6 text-center text-sm text-muted-foreground"
        >
          No routes match the current filter.
        </p>
      </template>

      <p v-else class="mt-6 font-mono text-xs text-muted-foreground">Loading routes…</p>
    </template>

    <!-- Models -->
    <template v-else>
      <div
        v-if="models.length === 0"
        class="mt-4 flex flex-col items-center rounded-xl border border-dashed px-8 py-14"
      >
        <p class="font-mono text-sm text-muted-foreground">No models found in app/Models.</p>
      </div>

      <div v-else class="mt-4 grid grid-cols-[240px_1fr] gap-4">
        <div class="h-[480px] overflow-y-auto rounded-lg border bg-card p-2">
          <button
            v-for="model in models"
            :key="model.class"
            class="block w-full truncate rounded-md px-2 py-1 text-left font-mono text-xs transition-colors"
            :class="
              selectedModel === model.class
                ? 'bg-white/6 text-foreground'
                : 'text-muted-foreground hover:bg-white/4 hover:text-foreground'
            "
            @click="selectModel(model.class)"
          >
            {{ model.class.replace('App\\Models\\', '') }}
          </button>
        </div>

        <div class="rounded-lg border bg-card p-5">
          <template v-if="modelDetail">
            <div class="flex items-start justify-between gap-3">
              <div>
                <h3 class="font-mono text-sm font-semibold">{{ modelDetail.class }}</h3>
                <p v-if="modelDetail.table" class="mt-0.5 font-mono text-xs text-muted-foreground">
                  table: {{ modelDetail.table }}
                </p>
              </div>
              <button
                class="inline-flex shrink-0 items-center gap-1 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
                title="Open in your editor"
                @click="openModel(models.find((m) => m.class === selectedModel)!)"
              >
                open <ExternalLink class="size-3" />
              </button>
            </div>

            <h4 class="mt-5 text-xs font-medium text-muted-foreground">
              Attributes ({{ modelDetail.attributes.length }})
            </h4>
            <div class="mt-2 divide-y overflow-hidden rounded-md border">
              <div
                v-for="attribute in modelDetail.attributes"
                :key="attribute.name"
                class="flex items-center gap-3 px-3 py-1.5"
              >
                <span class="w-44 truncate font-mono text-xs">{{ attribute.name }}</span>
                <span class="flex-1 font-mono text-xs text-muted-foreground">
                  {{ attribute.type ?? '—' }}{{ attribute.nullable ? '?' : '' }}
                </span>
                <span
                  v-if="attribute.fillable"
                  class="rounded-md bg-secondary/60 px-1.5 font-mono text-[10px] text-muted-foreground"
                >
                  fillable
                </span>
              </div>
            </div>

            <template v-if="modelDetail.relations.length">
              <h4 class="mt-5 text-xs font-medium text-muted-foreground">
                Relations ({{ modelDetail.relations.length }})
              </h4>
              <ul class="mt-2 space-y-1">
                <li
                  v-for="relation in modelDetail.relations"
                  :key="relation.name"
                  class="flex items-center gap-2 font-mono text-xs"
                >
                  <span>{{ relation.name }}</span>
                  <span class="text-muted-foreground">→ {{ relation.type }}</span>
                  <span v-if="relation.related" class="text-primary/80">
                    {{ shortClass(relation.related) }}
                  </span>
                </li>
              </ul>
            </template>

            <template v-if="modelDetail.observers.length">
              <h4 class="mt-5 text-xs font-medium text-muted-foreground">Observers</h4>
              <p class="mt-1 font-mono text-xs text-muted-foreground">
                {{ modelDetail.observers.join(', ') }}
              </p>
            </template>
          </template>

          <div
            v-else-if="modelError"
            class="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm"
          >
            {{ modelError }}
          </div>

          <p v-else-if="modelLoading" class="font-mono text-xs text-muted-foreground">
            Inspecting model…
          </p>
        </div>
      </div>
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
