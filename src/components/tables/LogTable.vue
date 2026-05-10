<script setup lang="ts">
import type { Ref } from 'vue'
import type { TableColumn } from '../comp_def'
import dayjs from 'dayjs'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import { formatDate } from '~/services/date'
import { defaultApiHost, useSupabase } from '~/services/supabase'

const props = defineProps<{
  deviceId?: string
  appId?: string
  actions?: string[]
}>()

interface LogData {
  app_id: string
  device_id: string
  action: string
  version_name: string
  version?: number
  metadata?: Record<string, string> | string | null
  created_at: string
}
type Element = LogData

function getActiveOrder(columns: TableColumn[]) {
  return columns
    .filter(col => typeof col.sortable === 'string')
    .map(col => ({ key: col.key, sortable: col.sortable }))
}

interface ParsedVersionName {
  version: string
  filename: string | null
  isFileSpecific: boolean
}

function parseVersionName(versionName: string): ParsedVersionName {
  const colonIndex = versionName.indexOf(':')
  if (colonIndex > 0) {
    return {
      version: versionName.substring(0, colonIndex),
      filename: versionName.substring(colonIndex + 1),
      isFileSpecific: true,
    }
  }
  return {
    version: versionName,
    filename: null,
    isFileSpecific: false,
  }
}
const columns: Ref<TableColumn[]> = ref<TableColumn[]>([])
const router = useRouter()
const route = useRoute()
const { t } = useI18n()
const supabase = useSupabase()
const search = ref('')
const elements = ref<Element[]>([])
const isLoading = ref(false)
const isExporting = ref(false)
const currentPage = ref(1)

// Initialize date range from query parameters if provided, otherwise default to last hour
function initializeDateRange(): [Date, Date] {
  const startParam = route.query.start
  const endParam = route.query.end

  if (startParam && endParam && typeof startParam === 'string' && typeof endParam === 'string') {
    try {
      const startDate = new Date(startParam)
      const endDate = new Date(endParam)

      // Validate dates
      if (!Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime())) {
        return [startDate, endDate]
      }
    }
    catch (error) {
      console.warn('Invalid date parameters in URL:', error)
    }
  }

  return [dayjs().subtract(1, 'hour').toDate(), new Date()]
}

const range = ref<[Date, Date]>(initializeDateRange())
const DOC_LOGS = 'https://capgo.app/docs/plugin/debugging/#sent-from-the-backend'

function normalizeMetadata(metadata: LogData['metadata']): Record<string, string> | null {
  if (!metadata)
    return null
  if (typeof metadata === 'string') {
    try {
      const parsed = JSON.parse(metadata)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
        return parsed as Record<string, string>
    }
    catch {
      return null
    }
    return null
  }
  return metadata
}

function formatMetadata(elem: Element): string {
  const metadata = normalizeMetadata(elem.metadata)
  if (!metadata)
    return '-'

  const entries = Object.entries(metadata)
  if (!entries.length)
    return '-'

  const preview = entries.slice(0, 3).map(([key, value]) => `${key}: ${value}`).join(', ')
  return entries.length > 3 ? `${preview}, +${entries.length - 3}` : preview
}

async function copyMetadata(elem: Element) {
  const metadata = normalizeMetadata(elem.metadata)
  if (!metadata)
    return

  try {
    await navigator.clipboard.writeText(JSON.stringify(metadata, null, 2))
    toast.success(t('copied-to-clipboard'))
  }
  catch (error) {
    console.error(error)
    toast.error(t('copy-fail'))
  }
}

const statsActionFilters = [
  ['action-ping', 'ping'],
  ['action-delete', 'delete'],
  ['action-reset', 'reset'],
  ['action-set', 'set'],
  ['action-get', 'get'],
  ['action-set-fail', 'set_fail'],
  ['action-update-fail', 'update_fail'],
  ['action-download-fail', 'download_fail'],
  ['action-windows-path-fail', 'windows_path_fail'],
  ['action-canonical-path-fail', 'canonical_path_fail'],
  ['action-directory-path-fail', 'directory_path_fail'],
  ['action-unzip-fail', 'unzip_fail'],
  ['action-low-mem-fail', 'low_mem_fail'],
  ['action-download-0', 'download_0'],
  ['action-download-10', 'download_10'],
  ['action-download-20', 'download_20'],
  ['action-download-30', 'download_30'],
  ['action-download-40', 'download_40'],
  ['action-download-50', 'download_50'],
  ['action-download-60', 'download_60'],
  ['action-download-70', 'download_70'],
  ['action-download-80', 'download_80'],
  ['action-download-90', 'download_90'],
  ['action-download-complete', 'download_complete'],
  ['action-download-manifest-start', 'download_manifest_start'],
  ['action-download-manifest-complete', 'download_manifest_complete'],
  ['action-download-zip-start', 'download_zip_start'],
  ['action-download-zip-complete', 'download_zip_complete'],
  ['action-download-manifest-file-fail', 'download_manifest_file_fail'],
  ['action-download-manifest-checksum-fail', 'download_manifest_checksum_fail'],
  ['action-download-manifest-brotli-fail', 'download_manifest_brotli_fail'],
  ['action-decrypt-fail', 'decrypt_fail'],
  ['action-app-moved-to-foreground', 'app_moved_to_foreground'],
  ['action-app-moved-to-background', 'app_moved_to_background'],
  ['action-app-crash', 'app_crash'],
  ['action-app-crash-native', 'app_crash_native'],
  ['action-app-anr', 'app_anr'],
  ['action-app-killed-low-memory', 'app_killed_low_memory'],
  ['action-app-killed-excessive-resource-usage', 'app_killed_excessive_resource_usage'],
  ['action-app-initialization-failure', 'app_initialization_failure'],
  ['action-app-memory-warning', 'app_memory_warning'],
  ['action-webview-javascript-error', 'webview_javascript_error'],
  ['action-webview-unhandled-rejection', 'webview_unhandled_rejection'],
  ['action-webview-resource-error', 'webview_resource_error'],
  ['action-webview-security-policy-violation', 'webview_security_policy_violation'],
  ['action-webview-unclean-restart', 'webview_unclean_restart'],
  ['action-webview-render-process-gone', 'webview_render_process_gone'],
  ['action-webview-content-process-terminated', 'webview_content_process_terminated'],
  ['action-uninstall', 'uninstall'],
  ['action-need-plan-upgrade', 'needPlanUpgrade'],
  ['action-missing-bundle', 'missingBundle'],
  ['action-no-new', 'noNew'],
  ['action-disable-platform-ios', 'disablePlatformIos'],
  ['action-disable-platform-android', 'disablePlatformAndroid'],
  ['action-disable-platform-electron', 'disablePlatformElectron'],
  ['action-disable-auto-update-to-major', 'disableAutoUpdateToMajor'],
  ['action-cannot-update-via-private-channel', 'cannotUpdateViaPrivateChannel'],
  ['action-disable-auto-update-to-minor', 'disableAutoUpdateToMinor'],
  ['action-disable-auto-update-to-patch', 'disableAutoUpdateToPatch'],
  ['action-channel-misconfigured', 'channelMisconfigured'],
  ['action-disable-auto-update-metadata', 'disableAutoUpdateMetadata'],
  ['action-disable-auto-update-under-native', 'disableAutoUpdateUnderNative'],
  ['action-disable-dev-build', 'disableDevBuild'],
  ['action-disable-prod-build', 'disableProdBuild'],
  ['action-disable-emulator', 'disableEmulator'],
  ['action-disable-device', 'disableDevice'],
  ['action-cannot-get-bundle', 'cannotGetBundle'],
  ['action-checksum-fail', 'checksum_fail'],
  ['action-key-mismatch', 'keyMismatch'],
  ['action-no-channel-or-override', 'NoChannelOrOverride'],
  ['action-set-channel', 'setChannel'],
  ['action-get-channel', 'getChannel'],
  ['action-rate-limited', 'rateLimited'],
  ['action-disable-auto-update', 'disableAutoUpdate'],
  ['action-invalid-ip', 'InvalidIp'],
  ['action-blocked-by-server-url', 'blocked_by_server_url'],
  ['action-backend-refusal', 'backend_refusal'],
  ['action-custom-id-blocked', 'customIdBlocked'],
] as const

const actionFilters = ref<Record<string, boolean>>(
  Object.fromEntries(statsActionFilters.map(([filterKey]) => [filterKey, false])),
)

const filterToAction: Record<string, string> = Object.fromEntries(statsActionFilters)

// Create reverse mapping from action values to filter keys
const actionToFilter: Record<string, string> = {}
Object.entries(filterToAction).forEach(([filterKey, actionValue]) => {
  actionToFilter[actionValue] = filterKey
})

function formatAction(elem: Element): string {
  const filterKey = actionToFilter[elem.action]
  return filterKey ? t(filterKey) : elem.action
}

// Initialize action filters from URL query parameter
function initializeActionFilters(): void {
  const actionParam = route.query.action
  if (actionParam && typeof actionParam === 'string') {
    // Find the filter key for this action
    const filterKey = actionToFilter[actionParam]
    if (filterKey && actionFilters.value[filterKey] !== undefined) {
      actionFilters.value[filterKey] = true
    }
  }
}

// Compute active actions based on filters
const activeActions = computed(() => {
  const actions: string[] = []
  for (const [filterKey, enabled] of Object.entries(actionFilters.value)) {
    if (enabled && filterToAction[filterKey]) {
      actions.push(filterToAction[filterKey])
    }
  }
  // If props.actions is provided, use those instead (for backward compatibility)
  if (props.actions?.length) {
    return props.actions
  }
  // If no filters are selected, return undefined to get all actions
  return actions.length > 0 ? actions : undefined
})

const paginatedRange = computed(() => {
  const rangeStart = range.value ? range.value[0].getTime() : undefined
  const rangeEnd = range.value ? range.value[1].getTime() : undefined

  if (rangeStart && rangeEnd) {
    const timeDifference = rangeEnd - rangeStart
    const pageTimeOffset = timeDifference * (currentPage.value - 1)

    return {
      rangeStart: rangeStart + pageTimeOffset,
      rangeEnd: rangeEnd + pageTimeOffset,
    }
  }

  return {
    rangeStart,
    rangeEnd,
  }
})

async function getData() {
  isLoading.value = true
  try {
    const { data: currentSession } = await supabase.auth.getSession()!
    if (!currentSession.session)
      return
    const currentJwt = currentSession.session.access_token
    // console.log('paginatedRange.value', paginatedRange.value, currentPage.value)

    try {
      const response = await fetch(`${defaultApiHost}/private/stats`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'authorization': `Bearer ${currentJwt ?? ''}`,
        },
        body: JSON.stringify({
          appId: props.appId,
          devicesId: props.deviceId ? [props.deviceId] : undefined,
          search: search.value ? search.value : undefined,
          order: getActiveOrder(columns.value),
          rangeStart: paginatedRange.value.rangeStart,
          rangeEnd: paginatedRange.value.rangeEnd,
          actions: activeActions.value,
        }),
      })

      if (!response.ok) {
        console.log('Cannot get stats', response.status)
        return
      }

      const dataD = await response.json() as LogData[]
      // console.log('dataD', dataD)
      elements.value.push(...dataD)
    }
    catch (err) {
      console.log('Cannot get devices', err)
    }
  }
  catch (error) {
    console.error(error)
  }
  isLoading.value = false
}

function downloadText(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

async function exportCsv() {
  if (isExporting.value)
    return
  isExporting.value = true
  const loadingToastId = toast.loading(t('exporting-logs'))
  try {
    const { data: currentSession } = await supabase.auth.getSession()!
    if (!currentSession.session) {
      toast.dismiss(loadingToastId)
      toast.error(t('not-logged-in'))
      return
    }
    const currentJwt = currentSession.session.access_token

    const response = await fetch(`${defaultApiHost}/private/stats/export`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'authorization': `Bearer ${currentJwt ?? ''}`,
      },
      body: JSON.stringify({
        appId: props.appId,
        devicesId: props.deviceId ? [props.deviceId] : undefined,
        search: search.value ? search.value : undefined,
        order: getActiveOrder(columns.value),
        rangeStart: range.value?.[0]?.toISOString(),
        rangeEnd: range.value?.[1]?.toISOString(),
        actions: activeActions.value,
        format: 'csv',
        limit: 10_000,
      }),
    })

    if (!response.ok) {
      const err = (await response.json().catch(() => ({}))) as { message?: string }
      toast.dismiss(loadingToastId)
      toast.error(err?.message || t('export-failed'))
      return
    }

    const data = await response.json() as { csv: string, filename: string, contentType: string }
    if (!data.csv || !data.filename) {
      toast.dismiss(loadingToastId)
      toast.error(t('export-failed'))
      return
    }

    downloadText(data.filename, data.csv, data.contentType || 'text/csv; charset=utf-8')
    toast.dismiss(loadingToastId)
    toast.success(t('export-ready'))
  }
  catch (error) {
    console.error(error)
    toast.dismiss(loadingToastId)
    toast.error(t('export-failed'))
  }
  finally {
    isExporting.value = false
  }
}
async function refreshData() {
  // console.log('refreshData')
  try {
    currentPage.value = 1
    elements.value.length = 0
    await getData()
  }
  catch (error) {
    console.error(error)
  }
}

columns.value = [
  {
    label: t('created-at'),
    key: 'created_at',
    mobile: true,
    class: 'truncate max-w-8',
    sortable: 'desc',
    displayFunction: (elem: Element) => formatDate(elem.created_at ?? ''),
  },
  {
    label: t('device-id'),
    key: 'device_id',
    class: 'truncate max-w-8',
    mobile: true,
    sortable: true,
    head: true,
    onClick: (elem: Element) => openOne(elem),
  },
  {
    label: t('action'),
    key: 'action',
    mobile: true,
    class: 'truncate max-w-8',
    sortable: true,
    head: true,
    displayFunction: (elem: Element) => formatAction(elem),
    onClick: () => window.open(DOC_LOGS, '_blank', 'noopener,noreferrer'),
  },
  {
    label: t('version'),
    key: 'version_name',
    class: 'truncate max-w-8',
    mobile: false,
    sortable: false,
    displayFunction: (elem: Element) => {
      const parsed = parseVersionName(elem.version_name)
      return parsed.isFileSpecific
        ? `${parsed.version} (${parsed.filename})`
        : parsed.version
    },
    onClick: (elem: Element) => openOneVersion(elem),
  },
  {
    label: t('metadata'),
    key: 'metadata',
    class: 'truncate max-w-48',
    mobile: false,
    sortable: false,
    displayFunction: (elem: Element) => formatMetadata(elem),
    onClick: (elem: Element) => copyMetadata(elem),
  },
]

async function reload() {
  try {
    currentPage.value = 1
    elements.value.length = 0
    await getData()
  }
  catch (error) {
    console.error(error)
  }
}
async function openOneVersion(one: Element) {
  if (props.deviceId || !props.appId)
    return
  if (!one.version) {
    const loadingToastId = toast.loading(t('loading-version'))
    // Extract version from composite format if present (e.g., "1.2.3:main.js" -> "1.2.3")
    const parsed = parseVersionName(one.version_name)
    const versionName = parsed.version

    const { data: versionRecord, error } = await supabase
      .from('app_versions')
      .select('id')
      .eq('app_id', props.appId)
      .eq('name', versionName)
      .single()
    if (error || !versionRecord?.id) {
      toast.dismiss(loadingToastId)
      toast.error(t('cannot-find-version'))
      return
    }
    one.version = versionRecord.id
    toast.dismiss(loadingToastId)
  }
  if (one.version)
    router.push(`/app/${props.appId}/bundle/${one.version}`)
  else
    toast.error(t('version-name-missing'))
}
async function openOne(one: Element) {
  if (props.deviceId || !props.appId)
    return
  router.push(`/app/${props.appId}/device/${one.device_id}`)
}
onMounted(async () => {
  initializeActionFilters()
  await refreshData()
})
watch(columns, async () => {
  await refreshData()
}, { deep: true })
watch(search, async () => {
  await refreshData()
})
watch(() => props.appId, async () => {
  await refreshData()
})
watch(() => props.deviceId, async () => {
  await refreshData()
})
watch(() => props.actions, async () => {
  await refreshData()
})
watch(actionFilters, async () => {
  await refreshData()
}, { deep: true })
watch(range, async () => {
  await refreshData()
})
</script>

<template>
  <div>
    <TableLog
      v-model:filters="actionFilters"
      v-model:columns="columns"
      v-model:current-page="currentPage"
      v-model:search="search"
      v-model:range="range"
      :element-list="elements"
      filter-text="filter-actions"
      :is-loading="isLoading"
      :exportable="true"
      :export-loading="isExporting"
      :auto-reload="false"
      :app-id="props.appId ?? ''"
      :search-placeholder="deviceId ? t('search-by-device-id-0') : t('search-by-device-id-')"
      @reload="reload()" @reset="refreshData()" @export="exportCsv()"
    />
  </div>
</template>
