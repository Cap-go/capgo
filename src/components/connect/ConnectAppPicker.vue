<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import IconCheck from '~icons/heroicons/check'
import IconSearch from '~icons/heroicons/magnifying-glass'

export interface ConnectApp {
  id: string
  app_id: string
  name: string | null
  /** Signed icon URL (ready to use as <img src>), or null/empty when none. */
  icon?: string | null
  /** Owning organization (UUID) — used to build per-app bindings across orgs. */
  ownerOrg: string
  /** Owning organization name — shown on the row when a key spans multiple orgs. */
  ownerOrgName?: string
}

const props = defineProps<{
  apps: ConnectApp[]
  modelValue: string[]
  /** Show each app's organization (when the key spans more than one org). */
  showOrg?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string[]): void
}>()

const { t } = useI18n()
const search = ref('')
const failedIcons = ref<Set<string>>(new Set())

const selectedSet = computed(() => new Set(props.modelValue))

const filteredApps = computed(() => {
  const query = search.value.trim().toLowerCase()
  if (!query)
    return props.apps
  return props.apps.filter(app =>
    (app.name ?? '').toLowerCase().includes(query)
    || app.app_id.toLowerCase().includes(query),
  )
})

const allSelected = computed(() => props.apps.length > 0 && props.modelValue.length === props.apps.length)

function isSelected(id: string): boolean {
  return selectedSet.value.has(id)
}

function toggle(id: string): void {
  const next = new Set(props.modelValue)
  if (next.has(id))
    next.delete(id)
  else
    next.add(id)
  emit('update:modelValue', [...next])
}

function toggleAll(): void {
  if (allSelected.value)
    emit('update:modelValue', [])
  else
    emit('update:modelValue', props.apps.map(app => app.id))
}

function showIcon(app: ConnectApp): boolean {
  return Boolean(app.icon) && !failedIcons.value.has(app.id)
}

function onIconError(id: string): void {
  failedIcons.value = new Set(failedIcons.value).add(id)
}
</script>

<template>
  <div>
    <div class="mb-1.5 flex items-end justify-between gap-2">
      <label class="block text-sm font-medium text-slate-700 dark:text-slate-200">
        {{ t('connect-app-access') }}
      </label>
      <button
        type="button"
        class="text-xs font-semibold text-azure-500 hover:underline"
        @click="toggleAll"
      >
        {{ allSelected ? t('connect-clear-all') : t('connect-select-all') }}
      </button>
    </div>
    <p class="mb-2 text-xs text-slate-400 dark:text-slate-500">
      {{ t('connect-app-access-hint') }}
    </p>

    <div class="rounded-2xl border border-slate-200 bg-white/70 p-2 dark:border-slate-700 dark:bg-slate-800/50">
      <div class="relative mb-2">
        <IconSearch class="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <input
          v-model="search"
          type="text"
          :aria-label="t('connect-search-apps')"
          :placeholder="t('connect-search-apps')"
          class="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 outline-none focus:border-azure-500 focus:ring-2 focus:ring-azure-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        >
      </div>

      <div class="max-h-64 space-y-1.5 overflow-y-auto pr-1">
        <button
          v-for="app in filteredApps"
          :key="app.id"
          type="button"
          class="flex w-full items-center gap-3 rounded-xl border bg-white px-3 py-2.5 text-left transition-colors dark:bg-slate-900"
          :class="isSelected(app.id)
            ? 'border-azure-500 bg-azure-500/5'
            : 'border-slate-200 hover:bg-azure-500/5 dark:border-slate-700'"
          @click="toggle(app.id)"
        >
          <span
            class="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border"
            :class="isSelected(app.id)
              ? 'border-azure-500 bg-azure-500 text-white'
              : 'border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-800'"
          >
            <IconCheck v-if="isSelected(app.id)" class="h-3.5 w-3.5" />
          </span>
          <img
            v-if="showIcon(app)"
            :src="app.icon!"
            :alt="`App icon ${app.name ?? app.app_id}`"
            class="h-9 w-9 shrink-0 rounded-sm object-cover d-mask d-mask-squircle"
            @error="onIconError(app.id)"
          >
          <div
            v-else
            class="flex h-9 w-9 shrink-0 items-center justify-center bg-gray-700 text-sm font-medium text-gray-300 d-mask d-mask-squircle"
          >
            {{ (app.name ?? app.app_id).slice(0, 2).toUpperCase() || 'AP' }}
          </div>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm font-medium text-slate-800 dark:text-slate-100">
              {{ app.name ?? app.app_id }}
            </span>
            <span class="block truncate font-mono text-xs text-slate-400">
              {{ app.app_id }}<template v-if="showOrg && app.ownerOrgName"> · {{ app.ownerOrgName }}</template>
            </span>
          </span>
          <span
            class="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[0.65rem] font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-800"
          >
            app_admin
          </span>
        </button>

        <p v-if="filteredApps.length === 0" class="px-3 py-6 text-center text-sm text-slate-400">
          {{ t('connect-no-apps-match') }}
        </p>
      </div>
    </div>

    <p class="mt-2 text-xs text-slate-400 dark:text-slate-500">
      {{ t('connect-apps-selected', { count: modelValue.length, total: apps.length }) }}
    </p>
  </div>
</template>
