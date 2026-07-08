<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Button } from '@/components/ui/button'
import ProjectHeader from '@/components/ProjectHeader.vue'
import { useProjectsStore } from '@/stores/projects'
import type { ExecResult, MigrationsResult, OutdatedResult, ScheduleResult } from '@shared/types'

const route = useRoute()
const projects = useProjectsStore()

const project = computed(() => projects.byId(String(route.params.id)))

const migrations = ref<MigrationsResult | null>(null)
const outdated = ref<OutdatedResult | null>(null)
const schedule = ref<ScheduleResult | null>(null)

const migrateBusy = ref(false)
const migrateOutput = ref<ExecResult | null>(null)
const confirmMigrate = ref(false)
const confirmRollback = ref(false)

const pendingCount = computed(() =>
  migrations.value?.ok
    ? migrations.value.migrations.filter((m) => m.status === 'pending').length
    : 0
)
const ranCount = computed(() =>
  migrations.value?.ok ? migrations.value.migrations.filter((m) => m.status === 'ran').length : 0
)

async function loadMigrations(): Promise<void> {
  if (!project.value) return
  migrations.value = await window.api.listMigrations(project.value.id)
}

async function loadOutdated(): Promise<void> {
  if (!project.value) return
  outdated.value = await window.api.listOutdatedPackages(project.value.id)
}

async function loadSchedule(): Promise<void> {
  if (!project.value) return
  schedule.value = await window.api.listScheduledTasks(project.value.id)
}

async function migrateAction(action: 'migrate' | 'rollback'): Promise<void> {
  if (!project.value || migrateBusy.value) return
  const confirmRef = action === 'migrate' ? confirmMigrate : confirmRollback
  if (!confirmRef.value) {
    confirmRef.value = true
    setTimeout(() => (confirmRef.value = false), 3000)
    return
  }
  confirmRef.value = false
  migrateBusy.value = true
  migrateOutput.value = null
  const call = action === 'migrate' ? window.api.runMigrations : window.api.rollbackMigrations
  migrateOutput.value = await call(project.value.id)
  migrateBusy.value = false
  await loadMigrations()
}

onMounted(() => {
  loadMigrations()
  loadOutdated()
  loadSchedule()
})
</script>

<template>
  <section v-if="project" class="mx-auto max-w-4xl px-8 pt-5 pb-10">
    <ProjectHeader :project="project" />

    <!-- Migrations -->
    <section class="mt-6">
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-medium text-muted-foreground">
          Migrations
          <span v-if="migrations?.ok" class="font-mono text-xs">
            ({{ ranCount }} ran<template v-if="pendingCount">
              · <span class="text-warning">{{ pendingCount }} pending</span></template
            >)
          </span>
        </h2>
        <div class="flex gap-2">
          <Button
            v-if="pendingCount"
            size="sm"
            class="h-7 text-xs"
            :disabled="migrateBusy"
            @click="migrateAction('migrate')"
          >
            {{ confirmMigrate ? 'Click again to migrate' : `Migrate (${pendingCount})` }}
          </Button>
          <Button
            v-if="ranCount"
            variant="outline"
            size="sm"
            class="h-7 text-xs"
            :class="confirmRollback ? 'text-destructive' : ''"
            :disabled="migrateBusy"
            @click="migrateAction('rollback')"
          >
            {{ confirmRollback ? 'Click again to rollback' : 'Rollback last batch' }}
          </Button>
        </div>
      </div>

      <div
        v-if="migrations && !migrations.ok"
        class="mt-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm"
      >
        <p>{{ migrations.message }}</p>
        <pre
          v-if="migrations.raw"
          class="mt-2 max-h-40 overflow-auto font-mono text-[11px] text-muted-foreground select-text"
          >{{ migrations.raw }}</pre>
      </div>

      <ul
        v-else-if="migrations?.ok && migrations.migrations.length"
        class="mt-3 max-h-72 divide-y overflow-y-auto rounded-lg border bg-card"
      >
        <li
          v-for="migration in migrations.migrations"
          :key="migration.name"
          class="flex items-center gap-3 px-4 py-1.5"
        >
          <span
            class="size-1.5 shrink-0 rounded-full"
            :class="migration.status === 'ran' ? 'bg-success' : 'bg-warning'"
          />
          <span class="min-w-0 flex-1 truncate font-mono text-xs">{{ migration.name }}</span>
          <span class="shrink-0 font-mono text-[10px] text-muted-foreground">
            {{ migration.status === 'ran' ? `batch ${migration.batch ?? '?'}` : 'pending' }}
          </span>
        </li>
      </ul>
      <p v-else-if="migrations?.ok" class="mt-3 text-sm text-muted-foreground">
        No migrations in this project.
      </p>
      <p v-else class="mt-3 font-mono text-xs text-muted-foreground">Loading…</p>

      <div
        v-if="migrateOutput"
        class="mt-3 rounded-lg border px-4 py-3"
        :class="
          migrateOutput.ok
            ? 'border-success/40 bg-success/10'
            : 'border-destructive/40 bg-destructive/10'
        "
      >
        <pre
          class="max-h-48 overflow-auto font-mono text-[11px] whitespace-pre-wrap text-muted-foreground select-text"
          >{{ migrateOutput.output }}</pre>
      </div>
    </section>

    <!-- Composer packages -->
    <section class="mt-10">
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-medium text-muted-foreground">
          Outdated packages
          <span v-if="outdated?.ok" class="font-mono text-xs"
            >({{ outdated.packages.length }})</span
          >
        </h2>
        <Button variant="ghost" size="sm" class="h-7 text-xs" @click="loadOutdated">Refresh</Button>
      </div>

      <div
        v-if="outdated && !outdated.ok"
        class="mt-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm"
      >
        {{ outdated.message }}
      </div>

      <p
        v-else-if="outdated?.ok && outdated.packages.length === 0"
        class="mt-3 text-sm text-success"
      >
        ✓ All direct dependencies are up to date.
      </p>

      <ul v-else-if="outdated?.ok" class="mt-3 divide-y overflow-hidden rounded-lg border bg-card">
        <li
          v-for="pkg in outdated.packages"
          :key="pkg.name"
          class="flex items-center gap-3 px-4 py-2"
          :title="pkg.description"
        >
          <span class="min-w-0 flex-1 truncate font-mono text-xs">{{ pkg.name }}</span>
          <span class="shrink-0 font-mono text-xs text-muted-foreground">
            {{ pkg.current }} → <span class="text-foreground">{{ pkg.latest }}</span>
          </span>
          <span
            class="w-14 shrink-0 text-right font-mono text-[10px]"
            :class="pkg.severity === 'major' ? 'text-destructive' : 'text-warning'"
          >
            {{ pkg.severity }}
          </span>
        </li>
      </ul>
      <p v-else class="mt-3 font-mono text-xs text-muted-foreground">
        Checking packagist… (this can take a few seconds)
      </p>
    </section>

    <!-- Schedule -->
    <section class="mt-10">
      <h2 class="text-sm font-medium text-muted-foreground">Scheduled tasks</h2>

      <div
        v-if="schedule && !schedule.ok"
        class="mt-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm"
      >
        <p>{{ schedule.message }}</p>
        <pre
          v-if="schedule.raw"
          class="mt-2 max-h-40 overflow-auto font-mono text-[11px] text-muted-foreground select-text"
          >{{ schedule.raw }}</pre>
      </div>

      <p
        v-else-if="schedule?.ok && schedule.tasks.length === 0"
        class="mt-3 text-sm text-muted-foreground"
      >
        No scheduled tasks.
      </p>

      <ul v-else-if="schedule?.ok" class="mt-3 divide-y overflow-hidden rounded-lg border bg-card">
        <li
          v-for="(task, index) in schedule.tasks"
          :key="index"
          class="flex items-center gap-3 px-4 py-2"
        >
          <span
            class="shrink-0 rounded-md bg-secondary/60 px-2 py-0.5 font-mono text-[10px] text-muted-foreground"
          >
            {{ task.expression }}
          </span>
          <span class="min-w-0 flex-1 truncate font-mono text-xs">{{ task.command }}</span>
          <span v-if="task.nextDue" class="shrink-0 font-mono text-[10px] text-muted-foreground">
            {{ task.nextDue }}
          </span>
        </li>
      </ul>
      <p v-else class="mt-3 font-mono text-xs text-muted-foreground">Loading…</p>
    </section>
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
