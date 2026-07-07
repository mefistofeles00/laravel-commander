<script setup lang="ts">
import { computed, ref } from 'vue'
import { Eye, EyeOff } from 'lucide-vue-next'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'

const props = defineProps<{
  envKey: string
  modelValue: string
  /** Original on-disk value; used to show the changed indicator. */
  original: string
  /** Key exists in .env but not in .env.example. */
  extra: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const SELECT_CHOICES: Record<string, string[]> = {
  DB_CONNECTION: ['sqlite', 'mysql', 'mariadb', 'pgsql', 'sqlsrv'],
  APP_ENV: ['local', 'development', 'staging', 'production', 'testing'],
  LOG_LEVEL: ['debug', 'info', 'notice', 'warning', 'error', 'critical', 'alert', 'emergency'],
  MAIL_MAILER: ['smtp', 'ses', 'postmark', 'resend', 'log', 'array', 'failover'],
  QUEUE_CONNECTION: ['sync', 'database', 'redis', 'beanstalkd', 'sqs'],
  CACHE_STORE: ['file', 'database', 'redis', 'memcached', 'dynamodb', 'array'],
  SESSION_DRIVER: ['file', 'cookie', 'database', 'redis', 'memcached', 'array']
}

const SECRET_RE = /(_?KEY|SECRET|PASSWORD|TOKEN)$/

type Kind = 'boolean' | 'select' | 'secret' | 'text'

const kind = computed<Kind>(() => {
  if (['true', 'false'].includes(props.modelValue.toLowerCase()) && props.modelValue !== '') {
    return 'boolean'
  }
  if (SELECT_CHOICES[props.envKey]) return 'select'
  if (SECRET_RE.test(props.envKey)) return 'secret'
  return 'text'
})

const selectChoices = computed(() => {
  const base = SELECT_CHOICES[props.envKey] ?? []
  return props.modelValue && !base.includes(props.modelValue) ? [props.modelValue, ...base] : base
})

const boolValue = computed({
  get: () => props.modelValue.toLowerCase() === 'true',
  set: (checked: boolean) => emit('update:modelValue', checked ? 'true' : 'false')
})

const revealed = ref(false)
const changed = computed(() => props.modelValue !== props.original)
</script>

<template>
  <div class="flex items-center gap-3 px-4 py-2.5">
    <span
      class="size-1.5 shrink-0 rounded-full"
      :class="changed ? 'bg-primary' : 'bg-transparent'"
      :title="changed ? 'Unsaved change' : undefined"
    />
    <label class="w-56 shrink-0 truncate font-mono text-xs" :for="`env-${envKey}`" :title="envKey">
      {{ envKey }}
    </label>

    <div class="flex min-w-0 flex-1 items-center gap-2">
      <template v-if="kind === 'boolean'">
        <Switch :id="`env-${envKey}`" v-model="boolValue" />
        <span class="font-mono text-xs text-muted-foreground">{{ modelValue }}</span>
      </template>

      <select
        v-else-if="kind === 'select'"
        :id="`env-${envKey}`"
        class="h-8 w-full max-w-64 rounded-md border bg-transparent px-2 font-mono text-xs focus-visible:ring-[2px] focus-visible:ring-ring/50 focus-visible:outline-none"
        :value="modelValue"
        @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
      >
        <option v-for="choice in selectChoices" :key="choice" :value="choice">{{ choice }}</option>
      </select>

      <template v-else-if="kind === 'secret'">
        <Input
          :id="`env-${envKey}`"
          :type="revealed ? 'text' : 'password'"
          class="h-8 font-mono !text-xs"
          :model-value="modelValue"
          @update:model-value="emit('update:modelValue', String($event))"
        />
        <button
          class="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
          :title="revealed ? 'Hide value' : 'Show value'"
          @click="revealed = !revealed"
        >
          <component :is="revealed ? EyeOff : Eye" class="size-4" />
        </button>
      </template>

      <Input
        v-else
        :id="`env-${envKey}`"
        class="h-8 font-mono !text-xs"
        :model-value="modelValue"
        @update:model-value="emit('update:modelValue', String($event))"
      />
    </div>

    <span
      v-if="extra"
      class="shrink-0 font-mono text-[10px] text-warning"
      title="This key is not in .env.example"
    >
      not in example
    </span>
  </div>
</template>
