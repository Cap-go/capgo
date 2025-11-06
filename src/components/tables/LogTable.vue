<script setup lang="ts">
import type { Ref } from 'vue'
import type { TableColumn } from '../comp_def'
import dayjs from 'dayjs'
import ky from 'ky'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import { formatDate } from '~/services/date'
import { defaultApiHost, useSupabase } from '~/services/supabase'

const props = defineProps<{
  deviceId?: string
  appId?: string
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
const filters = ref()
const DOC_LOGS = 'https://capgo.app/docs/plugin/debugging/#sent-from-the-backend'

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
    const dataD = await ky
      .post(`${defaultApiHost}/private/stats`, {
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
        }),
      })
      .then(res => res.json<LogData[]>())
      .catch((err) => {
        // Ensure we read the response to avoid memory leaks
        err.response?.arrayBuffer()
        console.log('Cannot get devices', err)
        return [] as LogData[]
      })
    // console.log('dataD', dataD)
    elements.value.push(...dataD)
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
</script>

<template>
  <div>
    <TableLog
      v-model:filters="filters"
      v-model:columns="columns"
      v-model:current-page="currentPage"
      v-model:search="search"
      v-model:range="range"
      :element-list="elements"
      filter-text="Filters"
      :is-loading="isLoading"
      :app-id="props.appId ?? ''"
      :search-placeholder="deviceId ? t('search-by-device-id-0') : t('search-by-device-id-')"
      @reload="reload()" @reset="refreshData()"
    />
  </div>
</template>
