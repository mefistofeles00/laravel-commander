<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Button } from '@/components/ui/button'
import ProjectHeader from '@/components/ProjectHeader.vue'
import { useProjectsStore } from '@/stores/projects'
import type { DoctorFixResult, DoctorReport, DoctorSeverity } from '@shared/types'

const route = useRoute()
const projects = useProjectsStore()

const project = computed(() => projects.byId(String(route.params.id)))

const report = ref<DoctorReport | null>(null)
const scanning = ref(false)
const scanError = ref<string | null>(null)
const fixing = ref<string | null>(null)
const lastFix = ref<{ findingId: string; title: string; result: DoctorFixResult } | null>(null)

const SEVERITY_META: Record<DoctorSeverity, { label: string; dot: string; text: string }> = {
  error: { label: 'error', dot: 'bg-destructive', text: 'text-destructive' },
  warning: { label: 'warning', dot: 'bg-warning', text: 'text-warning' },
  info: { label: 'info', dot: 'bg-muted-foreground', text: 'text-muted-foreground' }
}

const summary = computed(() => {
  if (!report.value) return null
  const counts: Record<DoctorSeverity, number> = { error: 0, warning: 0, info: 0 }
  for (const finding of report.value.findings) counts[finding.severity]++
  return counts
})

const ranAtLabel = computed(() =>
  report.value
    ? new Intl.DateTimeFormat('en', { timeStyle: 'medium' }).format(report.value.ranAt)
    : ''
)

async function scan(): Promise<void> {
  if (!project.value || scanning.value) return
  scanning.value = true
  scanError.value = null
  try {
    report.value = await window.api.runDoctor(project.value.id)
  } catch (error) {
    scanError.value = error instanceof Error ? error.message : String(error)
  } finally {
    scanning.value = false
  }
}

async function fix(findingId: string, title: string): Promise<void> {
  if (!project.value || fixing.value) return
  fixing.value = findingId
  lastFix.value = null
  try {
    const result = await window.api.fixDoctorFinding(project.value.id, findingId)
    lastFix.value = { findingId, title, result }
  } catch (error) {
    lastFix.value = {
      findingId,
      title,
      result: { ok: false, output: error instanceof Error ? error.message : String(error) }
    }
  } finally {
    fixing.value = null
  }
  await scan()
}

onMounted(scan)
</script>

<template>
  <section v-if="project" class="mx-auto max-w-4xl px-8 pt-5 pb-10">
    <ProjectHeader :project="project" />

    <div
      v-if="scanError"
      class="mt-6 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm"
      role="alert"
    >
      {{ scanError }}
    </div>

    <template v-if="report">
      <!-- Summary -->
      <div class="mt-6 flex items-center justify-between rounded-lg border bg-card px-5 py-4">
        <div>
          <p v-if="report.findings.length === 0" class="font-mono text-sm text-success">
            ✓ All {{ report.checkCount }} checks passed
          </p>
          <p v-else class="font-mono text-sm">
            <template v-for="(severity, index) in ['error', 'warning', 'info'] as const">
              <span v-if="summary![severity]" :key="severity" :class="SEVERITY_META[severity].text">
                <template v-if="index > 0 && (summary!.error || summary!.warning)"> </template>
                {{ summary![severity] }} {{ SEVERITY_META[severity].label
                }}{{ summary![severity] > 1 ? 's' : '' }}
              </span>
            </template>
            <span class="text-muted-foreground"> · {{ report.checkCount }} checks</span>
          </p>
          <p class="mt-1 text-xs text-muted-foreground">Last scan {{ ranAtLabel }}</p>
        </div>
        <Button variant="outline" size="sm" :disabled="scanning" @click="scan">
          {{ scanning ? 'Scanning…' : 'Run checks' }}
        </Button>
      </div>

      <!-- Fix outcome -->
      <div
        v-if="lastFix"
        class="mt-4 rounded-lg border px-4 py-3"
        :class="
          lastFix.result.ok
            ? 'border-success/40 bg-success/10'
            : 'border-destructive/40 bg-destructive/10'
        "
      >
        <p class="text-sm">
          {{ lastFix.result.ok ? 'Fixed:' : "Couldn't fix:" }} {{ lastFix.title }}
        </p>
        <pre
          v-if="lastFix.result.output"
          class="mt-2 overflow-x-auto font-mono text-xs whitespace-pre-wrap text-muted-foreground select-text"
          >{{ lastFix.result.output }}</pre>
      </div>

      <!-- Findings -->
      <ul v-if="report.findings.length" class="mt-4 space-y-2">
        <li
          v-for="finding in report.findings"
          :key="finding.id"
          class="flex items-start gap-3 rounded-lg border bg-card px-5 py-4"
        >
          <span
            class="mt-1.5 size-2 shrink-0 rounded-full"
            :class="SEVERITY_META[finding.severity].dot"
            :title="finding.severity"
          />
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium">{{ finding.title }}</p>
            <p class="mt-0.5 text-sm text-muted-foreground">{{ finding.detail }}</p>
          </div>
          <Button
            v-if="finding.fixLabel"
            variant="outline"
            size="sm"
            class="shrink-0 font-mono text-xs"
            :disabled="fixing !== null"
            @click="fix(finding.id, finding.title)"
          >
            {{ fixing === finding.id ? 'Fixing…' : finding.fixLabel }}
          </Button>
        </li>
      </ul>

      <div
        v-else
        class="mt-4 flex flex-col items-center rounded-xl border border-dashed px-8 py-14 text-center"
      >
        <p class="font-mono text-2xl text-success">✓</p>
        <p class="mt-3 text-sm text-muted-foreground">
          No inconsistencies found. Scans are read-only — nothing was changed.
        </p>
      </div>
    </template>

    <p v-else-if="scanning" class="mt-6 font-mono text-xs text-muted-foreground">Running checks…</p>
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
