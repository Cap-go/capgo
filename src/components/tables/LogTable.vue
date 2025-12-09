<script setup lang="ts">
import type { Ref } from 'vue'
import type { TableColumn } from '../comp_def'
import dayjs from 'dayjs'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
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
  created_at: string
}
type Element = LogData

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
const { t } = useI18n()
const supabase = useSupabase()
const search = ref('')
const elements = ref<Element[]>([])
const isLoading = ref(false)
const currentPage = ref(1)
const range = ref<[Date, Date]>([dayjs().subtract(1, 'hour').toDate(), new Date()])
const DOC_LOGS = 'https://capgo.app/docs/plugin/debugging/#sent-from-the-backend'

// All available actions - none selected by default (shows all results)
const actionFilters = ref<Record<string, boolean>>({
  'action-ping': false,
  'action-delete': false,
  'action-reset': false,
  'action-set': false,
  'action-get': false,
  'action-set-fail': false,
  'action-update-fail': false,
  'action-download-fail': false,
  'action-windows-path-fail': false,
  'action-canonical-path-fail': false,
  'action-directory-path-fail': false,
  'action-unzip-fail': false,
  'action-low-mem-fail': false,
  'action-download-10': false,
  'action-download-20': false,
  'action-download-30': false,
  'action-download-40': false,
  'action-download-50': false,
  'action-download-60': false,
  'action-download-70': false,
  'action-download-80': false,
  'action-download-90': false,
  'action-download-complete': false,
  'action-download-manifest-start': false,
  'action-download-manifest-complete': false,
  'action-download-zip-start': false,
  'action-download-zip-complete': false,
  'action-download-manifest-file-fail': false,
  'action-download-manifest-checksum-fail': false,
  'action-download-manifest-brotli-fail': false,
  'action-decrypt-fail': false,
  'action-app-moved-to-foreground': false,
  'action-app-moved-to-background': false,
  'action-uninstall': false,
  'action-need-plan-upgrade': false,
  'action-missing-bundle': false,
  'action-no-new': false,
  'action-disable-platform-ios': false,
  'action-disable-platform-android': false,
  'action-disable-auto-update-to-major': false,
  'action-cannot-update-via-private-channel': false,
  'action-disable-auto-update-to-minor': false,
  'action-disable-auto-update-to-patch': false,
  'action-channel-misconfigured': false,
  'action-disable-auto-update-metadata': false,
  'action-disable-auto-update-under-native': false,
  'action-disable-dev-build': false,
  'action-disable-emulator': false,
  'action-cannot-get-bundle': false,
  'action-checksum-fail': false,
  'action-no-channel-or-override': false,
  'action-set-channel': false,
  'action-get-channel': false,
  'action-rate-limited': false,
  'action-disable-auto-update': false,
  'action-invalid-ip': false,
  'action-blocked-by-server-url': false,
  'action-backend-refusal': false,
})

// Map filter keys to actual action values
const filterToAction: Record<string, string> = {
  'action-ping': 'ping',
  'action-delete': 'delete',
  'action-reset': 'reset',
  'action-set': 'set',
  'action-get': 'get',
  'action-set-fail': 'set_fail',
  'action-update-fail': 'update_fail',
  'action-download-fail': 'download_fail',
  'action-windows-path-fail': 'windows_path_fail',
  'action-canonical-path-fail': 'canonical_path_fail',
  'action-directory-path-fail': 'directory_path_fail',
  'action-unzip-fail': 'unzip_fail',
  'action-low-mem-fail': 'low_mem_fail',
  'action-download-10': 'download_10',
  'action-download-20': 'download_20',
  'action-download-30': 'download_30',
  'action-download-40': 'download_40',
  'action-download-50': 'download_50',
  'action-download-60': 'download_60',
  'action-download-70': 'download_70',
  'action-download-80': 'download_80',
  'action-download-90': 'download_90',
  'action-download-complete': 'download_complete',
  'action-download-manifest-start': 'download_manifest_start',
  'action-download-manifest-complete': 'download_manifest_complete',
  'action-download-zip-start': 'download_zip_start',
  'action-download-zip-complete': 'download_zip_complete',
  'action-download-manifest-file-fail': 'download_manifest_file_fail',
  'action-download-manifest-checksum-fail': 'download_manifest_checksum_fail',
  'action-download-manifest-brotli-fail': 'download_manifest_brotli_fail',
  'action-decrypt-fail': 'decrypt_fail',
  'action-app-moved-to-foreground': 'app_moved_to_foreground',
  'action-app-moved-to-background': 'app_moved_to_background',
  'action-uninstall': 'uninstall',
  'action-need-plan-upgrade': 'needPlanUpgrade',
  'action-missing-bundle': 'missingBundle',
  'action-no-new': 'noNew',
  'action-disable-platform-ios': 'disablePlatformIos',
  'action-disable-platform-android': 'disablePlatformAndroid',
  'action-disable-auto-update-to-major': 'disableAutoUpdateToMajor',
  'action-cannot-update-via-private-channel': 'cannotUpdateViaPrivateChannel',
  'action-disable-auto-update-to-minor': 'disableAutoUpdateToMinor',
  'action-disable-auto-update-to-patch': 'disableAutoUpdateToPatch',
  'action-channel-misconfigured': 'channelMisconfigured',
  'action-disable-auto-update-metadata': 'disableAutoUpdateMetadata',
  'action-disable-auto-update-under-native': 'disableAutoUpdateUnderNative',
  'action-disable-dev-build': 'disableDevBuild',
  'action-disable-emulator': 'disableEmulator',
  'action-cannot-get-bundle': 'cannotGetBundle',
  'action-checksum-fail': 'checksum_fail',
  'action-no-channel-or-override': 'NoChannelOrOverride',
  'action-set-channel': 'setChannel',
  'action-get-channel': 'getChannel',
  'action-rate-limited': 'rateLimited',
  'action-disable-auto-update': 'disableAutoUpdate',
  'action-invalid-ip': 'InvalidIp',
  'action-blocked-by-server-url': 'blocked_by_server_url',
  'action-backend-refusal': 'backend_refusal',
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
          order: columns.value.filter(elem => elem.sortable).map(elem => ({ key: elem.key as string, sortable: elem.sortable })),
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
]

async function reload() {
  try {
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
    router.push(`/app/p/${props.appId}/bundle/${one.version}`)
  else
    toast.error(t('version-name-missing'))
}
async function openOne(one: Element) {
  if (props.deviceId || !props.appId)
    return
  router.push(`/app/p/${props.appId}/d/${one.device_id}`)
}
onMounted(async () => {
  await refreshData()
})
watch(props, async () => {
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
      :auto-reload="false"
      :app-id="props.appId ?? ''"
      :search-placeholder="deviceId ? t('search-by-device-id-0') : t('search-by-device-id-')"
      @reload="reload()" @reset="refreshData()"
    />
  </div>
</template>
