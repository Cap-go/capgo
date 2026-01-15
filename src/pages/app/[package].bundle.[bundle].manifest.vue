<script setup lang="ts">
import type { TableColumn } from '~/components/comp_def'
import type { Database } from '~/types/supabase.types'
import { FormKit } from '@formkit/vue'
import { useDebounceFn } from '@vueuse/core'
import { computed, h, ref, watch, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import IconDown from '~icons/ic/round-keyboard-arrow-down'
import IconSearch from '~icons/ic/round-search?raw'
import IconAlertCircle from '~icons/lucide/alert-circle'
import { bytesToMbText } from '~/services/conversion'
import { formatLocalDate } from '~/services/date'
import { useSupabase } from '~/services/supabase'
import { useDisplayStore } from '~/stores/display'

type ManifestEntry = Database['public']['Tables']['manifest']['Row']

type VersionRow = Pick<Database['public']['Tables']['app_versions']['Row'], 'id' | 'name' | 'created_at' | 'manifest_count' | 'app_id'>

const route = useRoute('/app/[package].bundle.[bundle].manifest')
const router = useRouter()
const displayStore = useDisplayStore()
const { t } = useI18n()
const supabase = useSupabase()
const packageId = ref<string>('')
const id = ref<number>(0)
const loading = ref(true)
const tableLoading = ref(false)
const compareSearchLoading = ref(false)
const version = ref<Database['public']['Tables']['app_versions']['Row']>()
const manifestEntries = ref<ManifestEntry[]>([])
const latestCompareVersions = ref<VersionRow[]>([])
const compareSearchResults = ref<VersionRow[]>([])
const compareSearch = ref('')
const compareVersionId = ref<number | null>(null)
const selectedCompareVersion = ref<VersionRow | null>(null)
const compareManifestEntries = ref<ManifestEntry[]>([])
const compareManifestCache = ref<Record<number, ManifestEntry[]>>({})
const search = ref('')
const currentPage = ref(1)
const MANIFEST_PAGE_SIZE = 1000
const compareRequestId = ref(0)
const compareSearchRequestId = ref(0)

function hideHash(hash: string) {
  if (!hash)
    return ''
  if (hash.length <= 12)
    return hash
  return `${hash.slice(0, 6)}...${hash.slice(-6)}`
}

const columns = ref<TableColumn[]>([
  {
    label: t('name'),
    key: 'file_name',
    mobile: true,
    head: true,
    class: 'max-w-[20rem]',
    renderFunction: (item: ManifestEntry) => h('span', {
      class: 'block truncate text-slate-800 dark:text-white',
      title: item.file_name,
    }, item.file_name),
  },
  {
    label: t('size'),
    key: 'file_size',
    mobile: false,
    displayFunction: (item: ManifestEntry) => {
      if (typeof item.file_size === 'number' && item.file_size > 0)
        return bytesToMbText(item.file_size)
      return t('metadata-not-found')
    },
  },
  {
    label: t('checksum'),
    key: 'file_hash',
    mobile: false,
    class: 'max-w-[16rem]',
    renderFunction: (item: ManifestEntry) => h('span', {
      class: 'block truncate font-mono text-xs text-slate-600 dark:text-slate-300',
      title: item.file_hash,
    }, hideHash(item.file_hash)),
  },
])

const compareVersion = computed(() => {
  if (selectedCompareVersion.value)
    return selectedCompareVersion.value
  if (!compareVersionId.value)
    return null
  return (
    compareSearchResults.value.find(v => v.id === compareVersionId.value)
    ?? latestCompareVersions.value.find(v => v.id === compareVersionId.value)
    ?? null
  )
})

const compareOptions = computed(() => {
  if (compareSearch.value.trim())
    return compareSearchResults.value
  return latestCompareVersions.value
})

const diffEntries = computed(() => {
  if (!compareVersionId.value)
    return manifestEntries.value
  const compareMap = new Map(compareManifestEntries.value.map(entry => [entry.file_name, entry.file_hash]))
  return manifestEntries.value.filter(entry => compareMap.get(entry.file_name) !== entry.file_hash)
})

const summaryEntries = computed(() => (compareVersionId.value ? diffEntries.value : manifestEntries.value))
const searchLower = computed(() => search.value.trim().toLowerCase())

const displayEntries = computed(() => {
  if (!searchLower.value)
    return summaryEntries.value
  return summaryEntries.value.filter(entry => entry.file_name.toLowerCase().includes(searchLower.value) || entry.file_hash.toLowerCase().includes(searchLower.value))
})

const total = computed(() => displayEntries.value.length)

const summarySizeLabel = computed(() => {
  if (summaryEntries.value.length === 0)
    return bytesToMbText(0)
  let totalSize = 0
  let hasSize = false
  for (const entry of summaryEntries.value) {
    if (typeof entry.file_size === 'number' && entry.file_size > 0) {
      totalSize += entry.file_size
      hasSize = true
    }
  }
  return hasSize ? bytesToMbText(totalSize) : t('metadata-not-found')
})

const compareStatusMessage = computed(() => {
  if (!manifestEntries.value.length)
    return ''
  if (compareVersionId.value && tableLoading.value)
    return t('loading')
  if (!compareVersionId.value)
    return t('manifest-status-full')
  const compareName = compareVersion.value?.name ?? t('unknown')
  if (compareManifestEntries.value.length === 0)
    return t('manifest-status-compare-empty', { bundle: compareName })
  if (diffEntries.value.length === 0)
    return t('manifest-diff-empty')
  return t('manifest-status-diff', { bundle: compareName, count: diffEntries.value.length })
})

const compareOptionsLabel = computed(() => {
  if (compareSearch.value.trim())
    return t('manifest-compare-results')
  return t('manifest-compare-latest')
})

async function fetchManifestEntries(versionId: number) {
  const allEntries: ManifestEntry[] = []
  let offset = 0
  while (true) {
    const { data, error } = await supabase
      .from('manifest')
      .select('id, file_name, file_hash, file_size, s3_path, app_version_id')
      .eq('app_version_id', versionId)
      .order('file_name', { ascending: true })
      .range(offset, offset + MANIFEST_PAGE_SIZE - 1)

    if (error) {
      console.error('Failed to load manifest', error)
      return []
    }

    const batch = data ?? []
    allEntries.push(...batch)

    if (batch.length < MANIFEST_PAGE_SIZE)
      break

    offset += MANIFEST_PAGE_SIZE
  }

  return allEntries
}

async function getVersion() {
  if (!id.value)
    return

  try {
    const { data, error } = await supabase
      .from('app_versions')
      .select()
      .eq('app_id', packageId.value)
      .eq('id', id.value)
      .single()

    if (error) {
      console.error('no version', error)
      return
    }

    version.value = data

    if (version.value?.name)
      displayStore.setBundleName(String(version.value.id), version.value.name)
    displayStore.NavTitle = version.value?.name ?? t('bundle')
  }
  catch (error) {
    console.error(error)
  }
}

async function loadManifest() {
  if (!id.value)
    return
  manifestEntries.value = await fetchManifestEntries(id.value)
}

async function loadLatestCompareVersions() {
  if (!packageId.value)
    return
  const { data, error } = await supabase
    .from('app_versions')
    .select('id, name, created_at, manifest_count, app_id')
    .eq('app_id', packageId.value)
    .gt('manifest_count', 0)
    .neq('id', id.value)
    .order('created_at', { ascending: false })
    .limit(5)

  if (error) {
    console.error('Failed to load latest compare versions', error)
    return
  }

  latestCompareVersions.value = data ?? []
}

async function reloadManifest() {
  if (!id.value)
    return
  tableLoading.value = true
  await Promise.all([loadManifest(), loadLatestCompareVersions()])
  if (compareVersionId.value) {
    const cached = compareManifestCache.value[compareVersionId.value]
    compareManifestEntries.value = cached ?? await fetchManifestEntries(compareVersionId.value)
    if (!cached)
      compareManifestCache.value[compareVersionId.value] = compareManifestEntries.value
  }
  tableLoading.value = false
}

function resetCompareSelection() {
  compareVersionId.value = null
  selectedCompareVersion.value = null
  compareSearch.value = ''
  compareSearchResults.value = []
  compareManifestEntries.value = []
  tableLoading.value = false
}

function selectCompareVersion(option: VersionRow | null) {
  compareSearch.value = ''
  compareSearchResults.value = []
  if (!option) {
    resetCompareSelection()
    return
  }
  selectedCompareVersion.value = option
  compareVersionId.value = option.id
}

async function searchCompareVersions(term: string) {
  if (!packageId.value || !term.trim()) {
    compareSearchResults.value = []
    compareSearchLoading.value = false
    return
  }

  const requestId = ++compareSearchRequestId.value
  compareSearchLoading.value = true
  const baseQuery = supabase
    .from('app_versions')
    .select('id, name, created_at, manifest_count, app_id')
    .eq('app_id', packageId.value)
    .gt('manifest_count', 0)
    .neq('id', id.value)

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

watch(compareVersionId, async (value) => {
  const requestId = ++compareRequestId.value
  currentPage.value = 1
  if (!value) {
    compareManifestEntries.value = []
    tableLoading.value = false
    return
  }

  const cached = compareManifestCache.value[value]
  if (cached) {
    compareManifestEntries.value = cached
    tableLoading.value = false
    return
  }

  tableLoading.value = true
  const entries = await fetchManifestEntries(value)
  if (requestId !== compareRequestId.value)
    return
  compareManifestCache.value[value] = entries
  compareManifestEntries.value = entries
  tableLoading.value = false
})

watchEffect(async () => {
  if (route.path.includes('/bundle/') && route.path.includes('/manifest')) {
    loading.value = true
    packageId.value = route.params.package as string
    id.value = Number(route.params.bundle as string)
    resetCompareSelection()
    await Promise.all([getVersion(), loadManifest(), loadLatestCompareVersions()])
    loading.value = false
    if (!version.value?.name)
      displayStore.NavTitle = t('bundle')
    displayStore.defaultBack = `/app/${packageId.value}/bundles`
  }
})
</script>

<template>
  <div>
    <div v-if="loading" class="flex flex-col justify-center items-center min-h-[50vh]">
      <Spinner size="w-40 h-40" />
    </div>
    <div v-else-if="version">
      <div class="w-full h-full px-0 pt-0 mx-auto mb-8 overflow-y-auto sm:px-6 md:pt-8 lg:px-8 max-w-9xl max-h-fit">
        <div class="flex flex-col overflow-hidden overflow-y-auto bg-white border shadow-lg md:rounded-lg dark:bg-gray-800 border-slate-300 dark:border-slate-900">
          <div class="px-4 py-5 border-b border-slate-200 dark:border-slate-700 sm:px-6">
            <h3 class="text-lg font-medium leading-6 text-gray-900 dark:text-gray-100">
              {{ t('manifest') }}
            </h3>
          </div>

          <div v-if="manifestEntries.length === 0" class="flex flex-col items-center justify-center px-4 py-12">
            <IconAlertCircle class="w-16 h-16 mb-4 text-amber-500" />
            <h4 class="text-lg font-medium text-gray-900 dark:text-gray-100">
              {{ t('no-manifest-bundle') }}
            </h4>
          </div>

          <template v-else>
            <div class="px-4 pt-4 pb-3 border-b border-slate-200 dark:border-slate-700">
              <div class="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div class="w-full md:max-w-sm">
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {{ t('manifest-compare-label') }}
                  </label>
                  <div class="flex items-center gap-2 mt-2">
                    <div class="w-full d-dropdown">
                      <button
                        tabindex="0"
                        class="inline-flex w-full items-center justify-between rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-700 shadow-sm transition hover:border-slate-400 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                        :disabled="loading"
                      >
                        <span class="truncate">
                          {{ compareVersion?.name ?? t('manifest-compare-none') }}
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
                            :placeholder="t('search-by-name-or-bundle-id')"
                            :classes="{ outer: 'mb-0! w-full' }"
                          />
                        </div>
                        <div class="max-h-64 overflow-y-auto">
                          <button
                            type="button"
                            class="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                            @click="selectCompareVersion(null)"
                          >
                            {{ t('manifest-compare-none') }}
                          </button>
                          <div class="px-3 pt-3 text-xs uppercase tracking-wide text-slate-400">
                            {{ compareOptionsLabel }}
                          </div>
                          <button
                            v-for="option in compareOptions"
                            :key="option.id"
                            type="button"
                            class="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                            @click="selectCompareVersion(option)"
                          >
                            <span class="truncate">{{ option.name }}</span>
                            <span class="ml-2 text-xs text-slate-400">{{ option.created_at ? formatLocalDate(option.created_at) : t('unknown') }}</span>
                          </button>
                          <div v-if="compareSearchLoading" class="px-3 py-2 text-xs text-slate-400">
                            {{ t('loading') }}
                          </div>
                          <div v-else-if="compareSearch && compareOptions.length === 0" class="px-3 py-2 text-xs text-slate-400">
                            {{ t('no-versions-found') }}
                          </div>
                        </div>
                      </div>
                    </div>
                    <Spinner v-if="tableLoading" size="w-5 h-5" />
                  </div>
                </div>

                <div class="grid w-full grid-cols-2 gap-4 text-right md:w-auto md:text-left">
                  <div class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                    <div class="uppercase tracking-wide">
                      {{ t('manifest-summary-files') }}
                    </div>
                    <div class="text-lg font-semibold text-slate-900 dark:text-white">
                      {{ summaryEntries.length }}
                    </div>
                  </div>
                  <div class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                    <div class="uppercase tracking-wide">
                      {{ t('size') }}
                    </div>
                    <div class="text-lg font-semibold text-slate-900 dark:text-white">
                      {{ summarySizeLabel }}
                    </div>
                  </div>
                </div>
              </div>
              <p v-if="compareStatusMessage" class="mt-2 text-xs text-slate-500 dark:text-slate-400">
                {{ compareStatusMessage }}
              </p>
              <p v-if="compareVersion" class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {{ t('manifest-download-estimate-note') }}
              </p>
            </div>

            <div class="px-2 pb-2 relative">
              <Table
                v-model:search="search" v-model:current-page="currentPage" v-model:columns="columns"
                :total="total" :element-list="displayEntries"
                :is-loading="tableLoading"
                :search-placeholder="t('search-by-name')"
                @reload="reloadManifest"
                @reset="reloadManifest"
              />
              <div
                v-if="tableLoading"
                class="absolute inset-0 flex items-center justify-center bg-white/70 dark:bg-slate-900/70"
              >
                <Spinner size="w-10 h-10" />
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>
    <div v-else class="flex flex-col justify-center items-center min-h-[50vh]">
      <IconAlertCircle class="w-16 h-16 mb-4 text-destructive" />
      <h2 class="text-xl font-semibold text-foreground">
        {{ t('bundle-not-found') }}
      </h2>
      <p class="mt-2 text-muted-foreground">
        {{ t('bundle-not-found-description') }}
      </p>
      <button class="mt-4 text-white d-btn d-btn-primary" @click="router.push(`/app/${packageId}/bundles`)">
        {{ t('back-to-bundles') }}
      </button>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: app
</route>
