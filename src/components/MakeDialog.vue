<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import type { ArtisanOptionValues } from '@shared/types'

interface GeneratorFlag {
  option: string
  label: string
}

interface Generator {
  command: string
  label: string
  namePlaceholder: string
  flags: GeneratorFlag[]
  /** Predicted files, given the name and active flags. Approximate by design. */
  files: (name: string, flags: Set<string>) => string[]
}

const snake = (name: string): string =>
  name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')

const GENERATORS: Generator[] = [
  {
    command: 'make:model',
    label: 'Model',
    namePlaceholder: 'Invoice',
    flags: [
      { option: 'migration', label: 'Migration' },
      { option: 'factory', label: 'Factory' },
      { option: 'seed', label: 'Seeder' },
      { option: 'controller', label: 'Controller' },
      { option: 'api', label: 'API controller (with --controller)' },
      { option: 'policy', label: 'Policy' }
    ],
    files: (name, flags) => {
      const out = [`app/Models/${name}.php`]
      if (flags.has('migration')) out.push(`database/migrations/…_create_${snake(name)}s_table.php`)
      if (flags.has('factory')) out.push(`database/factories/${name}Factory.php`)
      if (flags.has('seed')) out.push(`database/seeders/${name}Seeder.php`)
      if (flags.has('controller')) out.push(`app/Http/Controllers/${name}Controller.php`)
      if (flags.has('policy')) out.push(`app/Policies/${name}Policy.php`)
      return out
    }
  },
  {
    command: 'make:controller',
    label: 'Controller',
    namePlaceholder: 'InvoiceController',
    flags: [
      { option: 'api', label: 'API (no create/edit)' },
      { option: 'resource', label: 'Resource methods' },
      { option: 'invokable', label: 'Invokable (single action)' }
    ],
    files: (name) => [`app/Http/Controllers/${name}.php`]
  },
  {
    command: 'make:migration',
    label: 'Migration',
    namePlaceholder: 'create_invoices_table',
    flags: [],
    files: (name) => [`database/migrations/…_${snake(name)}.php`]
  },
  {
    command: 'make:request',
    label: 'Form request',
    namePlaceholder: 'StoreInvoiceRequest',
    flags: [],
    files: (name) => [`app/Http/Requests/${name}.php`]
  },
  {
    command: 'make:job',
    label: 'Job',
    namePlaceholder: 'ProcessInvoice',
    flags: [{ option: 'sync', label: 'Synchronous (no queue)' }],
    files: (name) => [`app/Jobs/${name}.php`]
  },
  {
    command: 'make:command',
    label: 'Console command',
    namePlaceholder: 'SendInvoiceReminders',
    flags: [],
    files: (name) => [`app/Console/Commands/${name}.php`]
  },
  {
    command: 'make:seeder',
    label: 'Seeder',
    namePlaceholder: 'InvoiceSeeder',
    flags: [],
    files: (name) => [`database/seeders/${name}.php`]
  },
  {
    command: 'make:middleware',
    label: 'Middleware',
    namePlaceholder: 'EnsureInvoiceIsPaid',
    flags: [],
    files: (name) => [`app/Http/Middleware/${name}.php`]
  }
]

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{
  close: []
  create: [command: string, cliArgs: string[], options: ArtisanOptionValues]
}>()

const selectedCommand = ref(GENERATORS[0].command)
const name = ref('')
const flagValues = ref<Record<string, boolean>>({})

const generator = computed(
  () => GENERATORS.find((g) => g.command === selectedCommand.value) ?? GENERATORS[0]
)

const activeFlags = computed(
  () => new Set(Object.keys(flagValues.value).filter((key) => flagValues.value[key]))
)

const predictedFiles = computed(() =>
  name.value.trim() ? generator.value.files(name.value.trim(), activeFlags.value) : []
)

watch(selectedCommand, () => {
  flagValues.value = {}
})

watch(
  () => props.open,
  (open) => {
    if (open) {
      name.value = ''
      flagValues.value = {}
    }
  }
)

function create(): void {
  if (!name.value.trim()) return
  const options: ArtisanOptionValues = {}
  for (const flag of activeFlags.value) options[flag] = true
  emit('create', generator.value.command, [name.value.trim()], options)
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      @click.self="emit('close')"
      @keydown.esc="emit('close')"
    >
      <div class="w-[480px] rounded-xl border bg-popover p-5 shadow-xl">
        <h3 class="font-mono text-sm font-semibold">
          <span class="text-primary">❯</span> php artisan {{ generator.command }}
        </h3>

        <div class="mt-4 flex gap-2">
          <select
            v-model="selectedCommand"
            class="h-8 rounded-md border bg-transparent px-2 font-mono text-xs focus-visible:ring-[2px] focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <option v-for="g in GENERATORS" :key="g.command" :value="g.command">
              {{ g.label }}
            </option>
          </select>
          <Input
            v-model="name"
            :placeholder="generator.namePlaceholder"
            class="h-8 flex-1 font-mono !text-xs"
            autofocus
            @keydown.enter="create"
          />
        </div>

        <div v-if="generator.flags.length" class="mt-4 space-y-2">
          <div v-for="flag in generator.flags" :key="flag.option" class="flex items-center gap-3">
            <Switch
              :id="`flag-${flag.option}`"
              :model-value="flagValues[flag.option] === true"
              @update:model-value="flagValues[flag.option] = $event"
            />
            <label class="font-mono text-xs" :for="`flag-${flag.option}`">
              --{{ flag.option }}
              <span class="text-muted-foreground">· {{ flag.label }}</span>
            </label>
          </div>
        </div>

        <div v-if="predictedFiles.length" class="mt-4 rounded-md border bg-card px-3 py-2">
          <p class="text-[10px] tracking-wider text-muted-foreground uppercase">Will create</p>
          <ul class="mt-1 space-y-0.5">
            <li v-for="file in predictedFiles" :key="file" class="font-mono text-xs">
              {{ file }}
            </li>
          </ul>
        </div>

        <div class="mt-5 flex justify-end gap-2">
          <Button variant="ghost" size="sm" @click="emit('close')">Cancel</Button>
          <Button size="sm" :disabled="!name.trim()" @click="create">Create</Button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
