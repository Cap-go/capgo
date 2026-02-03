<script setup lang="ts">
import type { Database } from '~/types/supabase.types'
import { FormKit } from '@formkit/vue'
import { useDebounceFn } from '@vueuse/core'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import IconDown from '~icons/ic/round-keyboard-arrow-down'
import IconSearch from '~icons/ic/round-search?raw'
import { formatLocalDate } from '~/services/date'
import { useSupabase } from '~/services/supabase'

type VersionRow = Pick<Database['public']['Tables']['app_versions']['Row'], 'id' | 'name' | 'created_at' | 'manifest_count' | 'app_id'>
type DeployHistoryRow = Pick<Database['public']['Tables']['deploy_history']['Row'], 'channel_id' | 'version_id' | 'created_at' | 'deployed_at'>

const props = withDefaults(defineProps<{
  appId: string
  currentVersionId: number
  modelValue?: VersionRow | null
  label: string
  noneLabel: string
  latestLabel: string
  resultsLabel: string
  searchPlaceholder: string
  noResultsLabel: string
  disabled?: boolean
  showSpinner?: boolean
}>(), {
  modelValue: null,
  disabled: false,
  showSpinner: false,
})

const emit = defineEmits<{
  (event: 'update:modelValue', value: VersionRow | null): void
}>()

const { t } = useI18n()
const supabase = useSupabase()

const latestCompareVersions = ref<VersionRow[]>([])
const preferredCompareVersions = ref<VersionRow[]>([])
const compareSearchResults = ref<VersionRow[]>([])
const compareSearch = ref('')
const compareSearchLoading = ref(false)
const compareSearchRequestId = ref(0)
let preferredCompareRequestId = 0

const compareOptions = computed(() => {
  if (compareSearch.value.trim())
    return compareSearchResults.value
  const preferredIds = new Set(preferredCompareVersions.value.map(version => version.id))
  return [
    ...preferredCompareVersions.value,
    ...latestCompareVersions.value.filter(version => !preferredIds.has(version.id)),
  ]
})

const compareOptionsLabel = computed(() => {
  if (compareSearch.value.trim())
    return props.resultsLabel
  return props.latestLabel
})

function resetSearchState() {
  compareSearch.value = ''
  compareSearchRequestId.value += 1
  compareSearchResults.value = []
  compareSearchLoading.value = false
}

function selectCompareVersion(option: VersionRow | null) {
  resetSearchState()
  emit('update:modelValue', option)
}

async function loadLatestCompareVersions() {
  if (!props.appId || !props.currentVersionId) {
    latestCompareVersions.value = []
    return
  }
  const { data, error } = await supabase
    .from('app_versions')
    .select('id, name, created_at, manifest_count, app_id')
    .eq('app_id', props.appId)
    .gt('manifest_count', 0)
    .neq('id', props.currentVersionId)
    .order('created_at', { ascending: false })
    .limit(5)

  if (error) {
    console.error('Failed to load latest compare versions', error)
    return
  }

  latestCompareVersions.value = data ?? []
}

async function loadPreferredCompareVersions() {
  const requestId = ++preferredCompareRequestId
  preferredCompareVersions.value = []
  if (!props.appId || !props.currentVersionId)
    return

  const channelIds = new Set<number>()
  const deployedAtByChannel = new Map<number, string | null>()

  const { data: currentChannels, error: currentChannelsError } = await supabase
    .from('channels')
    .select('id')
    .eq('app_id', props.appId)
    .eq('version', props.currentVersionId)

  if (requestId !== preferredCompareRequestId)
    return

  if (currentChannelsError) {
    console.error('Failed to load current channels', currentChannelsError)
  }
  else {
    for (const channel of currentChannels ?? [])
      channelIds.add(channel.id)
  }

  const { data: deployHistory, error: deployHistoryError } = await supabase
    .from('deploy_history')
    .select('channel_id, version_id, created_at, deployed_at')
    .eq('app_id', props.appId)
    .eq('version_id', props.currentVersionId)
    .order('created_at', { ascending: false })

  if (requestId !== preferredCompareRequestId)
    return

  if (deployHistoryError) {
    console.error('Failed to load deploy history for bundle', deployHistoryError)
  }
  else {
    for (const entry of deployHistory ?? []) {
      const entryTime = entry.created_at ?? entry.deployed_at ?? null
      if (!channelIds.has(entry.channel_id))
        channelIds.add(entry.channel_id)
      if (!deployedAtByChannel.has(entry.channel_id))
        deployedAtByChannel.set(entry.channel_id, entryTime)
    }
  }

  if (channelIds.size === 0)
    return

  const preferredHistory: Array<{ versionId: number, deployedAt: string | null }> = []
  for (const channelId of channelIds) {
    const cutoff = deployedAtByChannel.get(channelId)
    let query = supabase
      .from('deploy_history')
      .select('version_id, created_at, deployed_at')
      .eq('app_id', props.appId)
      .eq('channel_id', channelId)
      .neq('version_id', props.currentVersionId)

    if (cutoff)
      query = query.lt('created_at', cutoff)

    const { data, error } = await query
      .order('created_at', { ascending: false })
      .limit(1)

    if (requestId !== preferredCompareRequestId)
      return

    if (error) {
      console.error('Failed to load previous deploy history', error)
      continue
    }

    const entry = (data ?? [])[0] as DeployHistoryRow | undefined
    if (!entry)
      continue
    preferredHistory.push({
      versionId: entry.version_id,
      deployedAt: entry.created_at ?? entry.deployed_at ?? null,
    })
  }

  if (!preferredHistory.length)
    return

  const uniqueIds = [...new Set(preferredHistory.map(entry => entry.versionId))]
  const { data: versions, error } = await supabase
    .from('app_versions')
    .select('id, name, created_at, manifest_count, app_id')
    .eq('app_id', props.appId)
    .gt('manifest_count', 0)
    .in('id', uniqueIds)

  if (requestId !== preferredCompareRequestId)
    return

  if (error) {
    console.error('Failed to load preferred compare versions', error)
    return
  }

  const versionMap = new Map((versions ?? []).map(version => [version.id, version]))
  const sorted = preferredHistory
    .filter(entry => versionMap.has(entry.versionId))
    .sort((a, b) => (b.deployedAt ?? '').localeCompare(a.deployedAt ?? ''))

  preferredCompareVersions.value = sorted
    .map(entry => versionMap.get(entry.versionId))
    .filter((version): version is VersionRow => Boolean(version))
}

async function searchCompareVersions(term: string) {
  if (!props.appId || !term.trim()) {
    compareSearchResults.value = []
    compareSearchLoading.value = false
    return
  }

  const requestId = ++compareSearchRequestId.value
  compareSearchLoading.value = true
  const baseQuery = supabase
    .from('app_versions')
    .select('id, name, created_at, manifest_count, app_id')
    .eq('app_id', props.appId)
    .gt('manifest_count', 0)
    .neq('id', props.currentVersionId)

  const numericId = Number(term)
  const query = Number.isNaN(numericId)
    ? baseQuery.ilike('name', `%${term}%`)
    : baseQuery.or(`name.ilike.%${term}%,id.eq.${numericId}`)

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(5)

  if (requestId !== compareSearchRequestId.value)
    return

  if (error) {
    console.error('Failed to search compare versions', error)
    compareSearchResults.value = []
  }
  else {
    compareSearchResults.value = data ?? []
  }
  compareSearchLoading.value = false
}

const debouncedCompareSearch = useDebounceFn((term: string) => {
  searchCompareVersions(term)
}, 400)

watch(compareSearch, (term) => {
  if (!term.trim()) {
    compareSearchRequestId.value += 1
    compareSearchResults.value = []
    compareSearchLoading.value = false
    return
  }
  debouncedCompareSearch(term)
})

watch(
  () => [props.appId, props.currentVersionId],
  async () => {
    resetSearchState()
    if (!props.appId || !props.currentVersionId) {
      latestCompareVersions.value = []
      preferredCompareVersions.value = []
      return
    }
    await Promise.all([loadLatestCompareVersions(), loadPreferredCompareVersions()])
  },
  { immediate: true },
)
</script>

<template>
  <div class="w-full md:max-w-sm">
    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
      {{ label }}
    </label>
    <div class="flex items-center gap-2 mt-2">
      <div class="w-full d-dropdown">
        <button
          tabindex="0"
          class="inline-flex w-full min-w-0 items-center justify-between rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-700 shadow-sm transition hover:border-slate-400 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
          :disabled="disabled"
        >
          <span class="truncate min-w-0">
            {{ modelValue?.name ?? noneLabel }}
          </span>
          <IconDown class="w-4 h-4 shrink-0 text-slate-400" />
        </button>
        <div
          tabindex="0"
          class="mt-1 w-full d-dropdown-content d-menu rounded-lg border border-slate-200 bg-white p-2 shadow-lg z-20 dark:border-slate-700 dark:bg-slate-900"
        >
          <div class="p-2">
            <FormKit
              v-model="compareSearch"
              :prefix-icon="IconSearch"
              :placeholder="searchPlaceholder"
              :classes="{ outer: 'mb-0! w-full' }"
            />
          </div>
          <div class="max-h-64 overflow-y-auto">
            <button
              type="button"
              class="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
              @click="selectCompareVersion(null)"
            >
              {{ noneLabel }}
            </button>
            <div class="px-3 pt-3 text-xs uppercase tracking-wide text-slate-400">
              {{ compareOptionsLabel }}
            </div>
            <button
              v-for="option in compareOptions"
              :key="option.id"
              type="button"
              class="flex w-full min-w-0 items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
              @click="selectCompareVersion(option)"
            >
              <span class="truncate min-w-0">{{ option.name }}</span>
              <span class="ml-2 shrink-0 text-xs text-slate-400">{{ option.created_at ? formatLocalDate(option.created_at) : t('unknown') }}</span>
            </button>
            <div v-if="compareSearchLoading" class="px-3 py-2 text-xs text-slate-400">
              {{ t('loading') }}
            </div>
            <div v-else-if="compareSearch && compareOptions.length === 0" class="px-3 py-2 text-xs text-slate-400">
              {{ noResultsLabel }}
            </div>
          </div>
        </div>
      </div>
      <Spinner v-if="showSpinner" size="w-5 h-5" />
    </div>
  </div>
</template>
