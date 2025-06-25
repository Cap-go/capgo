<script setup lang="ts">
import type { Ref } from 'vue'
import type { TableColumn } from '../comp_def'
import dayjs from 'dayjs'
import ky from 'ky'
import { useI18n } from 'petite-vue-i18n'
import { onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { appIdToUrl } from '~/services/conversion'
import { formatDate } from '~/services/date'
import { defaultApiHost, useSupabase } from '~/services/supabase'

const props = defineProps<{
  deviceId?: string
  appId?: string
}>()

interface Channel {
  version: {
    name: string
    id: number
  }
}
interface LogData {
  app_id: string
  device_id: string
  action: string
  version_id: number
  version?: number
  created_at: string
}
type Element = LogData & Channel
const columns: Ref<TableColumn[]> = ref<TableColumn[]>([])
const router = useRouter()
const { t } = useI18n()
const supabase = useSupabase()
const search = ref('')
const elements = ref<Element[]>([])
const versions = ref<Channel['version'][]>([])
const isLoading = ref(false)
const currentPage = ref(1)
const range = ref<[Date, Date]>([dayjs().subtract(3, 'minute').toDate(), new Date()])
const filters = ref()
const DOC_LOGS = 'https://capgo.app/docs/plugin/debugging/#sent-from-the-backend'

// const actionLinks = {
//   update: '/app/p/{{appId}}/update',
//   download: '/app/p/{{appId}}/download',
//   error: '/app/p/{{appId}}/error',
// }

function findVersion(id: number, versions: { name: string, id: number }[]) {
  return versions.find(elem => elem.id === id)
}

async function versionData() {
  try {
    const versionsIdAlreadyFetch = versions.value.map(elem => elem.id)
    const versionsIds = elements.value
      .map(elem => elem.version_id)
      .filter(e => !versionsIdAlreadyFetch.includes(e))
    // console.log('versionsIds', versionsIds)
    if (!versionsIds.length)
      return
    const { data: res } = await supabase
      .from('app_versions')
      .select(`
        name,
        id
      `)
      .in('id', versionsIds)
    if (!res?.length)
      return
    versions.value.push(...res)
    elements.value.forEach((elem) => {
      elem.version = findVersion(elem.version_id, versions.value) || { name: 'unknown', id: 0 } as any
    })
  }
  catch (error) {
    console.error(error)
  }
}

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
        console.log('Cannot get devices', err)
        return [] as LogData[]
      })
    // console.log('dataD', dataD)
    elements.value.push(...dataD as any)
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
    versions.value.length = 0
    await getData()
    await versionData()
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
    onClick: () => window.open(DOC_LOGS, '_blank'),
  },
  {
    label: t('version'),
    key: 'version',
    class: 'truncate max-w-8',
    mobile: false,
    sortable: false,
    displayFunction: (elem: Element) => elem.version?.name,
    onClick: (elem: Element) => openOneVersion(elem),
  },
]

async function reload() {
  try {
    elements.value.length = 0
    await getData()
    await versionData()
  }
  catch (error) {
    console.error(error)
  }
}
async function openOneVersion(one: Element) {
  if (props.deviceId || !props.appId)
    return
  router.push(`/app/p/${appIdToUrl(props.appId)}/bundle/${one.version?.id}`)
}
async function openOne(one: Element) {
  if (props.deviceId || !props.appId)
    return
  router.push(`/app/p/${appIdToUrl(props.appId)}/d/${one.device_id}`)
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
