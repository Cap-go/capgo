<script setup lang="ts">
import type { TableColumn } from '../comp_def'
import type { Database } from '~/types/supabase.types'
import { h, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import { formatDate } from '~/services/date'
import { defaultApiHost, useSupabase } from '~/services/supabase'

const props = defineProps<{
  appId: string
  ids?: string[]
  versionName?: string | undefined
  showAddButton?: boolean
  channel?: unknown
}>()

const emit = defineEmits(['addDevice'])

// TODO: delete the old version check when all devices uses the new version system
type Device = Database['public']['Tables']['devices']['Row']

const { t } = useI18n()
const supabase = useSupabase()
const router = useRouter()
const total = ref(0)
const search = ref('')
const elements = ref<Device[]>([])
const isLoading = ref(true)
const currentPage = ref(1)
const nextCursor = ref<string | undefined>(undefined)
const hasMore = ref(false)
const pageStartCursor = ref<Map<number, string | null | undefined>>(new Map([[1, undefined]]))
const filters = ref({
  Override: false,
  CustomId: false,
})
const offset = 10
const columns = ref<TableColumn[]>([
  {
    label: t('device-id'),
    key: 'device_id',
    class: 'truncate max-w-10',
    mobile: true,
    head: true,
    onClick: (elem: Device) => openOne(elem),
    renderFunction: (item) => {
      const customId = item.custom_id?.trim()
      return h('div', { class: 'flex flex-col text-slate-800 dark:text-white' }, [
        h('div', { class: 'truncate font-medium' }, customId || item.device_id),
        customId
          ? h('div', { class: 'text-xs text-slate-500 dark:text-gray-400 truncate' }, item.device_id)
          : null,
      ])
    },
  },
  {
    label: t('updated-at'),
    key: 'updated_at',
    mobile: false,
    displayFunction: (elem: Device) => formatDate(elem.updated_at ?? ''),
  },
  {
    label: t('platform'),
    key: 'platform',
    mobile: true,
    head: true,
    displayFunction: (elem: Device) => `${elem.platform} ${elem.os_version}`,
  },
  {
    label: t('bundle'),
    key: 'version_name',
    mobile: true,
    head: true,
    displayFunction: (elem: Device) => elem.version_name ?? elem.version ?? 'unknown',
    onClick: (elem: Device) => openOneVersion(elem),
  },
])

async function getDevicesID() {
  let req = supabase
    .from('channel_devices')
    .select('device_id')
    .eq('app_id', props.appId)

  if (props.ids)
    req = req.in('device_id', props.ids)

  const { data } = await req

  const channelDev = data?.map(d => d.device_id) ?? []
  return [...channelDev]
}

async function countDevices() {
  const { data: currentSession } = await supabase.auth.getSession()!
  if (!currentSession.session)
    return 0
  if (props.ids && props.ids.length > 0)
    return props.ids.length

  const currentJwt = currentSession.session.access_token

  try {
    const response = await fetch(`${defaultApiHost}/private/devices`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'authorization': `Bearer ${currentJwt ?? ''}`,
      },
      body: JSON.stringify({
        count: true,
        // devicesId: props.ids?.length ? props.ids : undefined,
        appId: props.appId,
        customIdMode: filters.value.CustomId,
      }),
    })

    if (!response.ok) {
      console.log('Cannot get devices', response.status)
      return 0
    }

    const dataD = await response.json() as { count: number }
    return dataD.count
  }
  catch (err) {
    console.log('Cannot get devices', err)
    return 0
  }
}

interface DevicesResponse {
  data: Device[]
  nextCursor?: string
  hasMore: boolean
}

function clearPaginationState() {
  pageStartCursor.value = new Map([[1, undefined]])
  nextCursor.value = undefined
  hasMore.value = false
}

async function reload() {
  isLoading.value = true
  try {
    clearPaginationState()
    elements.value.length = 0
    total.value = await countDevices()
    await getData()
  }
  catch (error) {
    console.error(error)
  }
  finally {
    // getData normally resets this, but safeguard to cover early failures
    isLoading.value = false
  }
}

async function refreshData() {
  isLoading.value = true
  try {
    currentPage.value = 1
    clearPaginationState()
    elements.value.length = 0
    total.value = await countDevices()
    await getData()
  }
  catch (error) {
    console.error(error)
  }
  finally {
    // getData normally resets this, but safeguard to cover early failures
    isLoading.value = false
  }
}

async function fetchDevicesPage(cursor: string | undefined | null) {
  let ids: string[] = []
  if (filters.value.Override)
    ids = await getDevicesID()
  else if (props.ids)
    ids = props.ids

  const { data: currentSession } = await supabase.auth.getSession()!
  if (!currentSession.session)
    return
  const currentJwt = currentSession.session.access_token

  const response = await fetch(`${defaultApiHost}/private/devices`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'authorization': `Bearer ${currentJwt ?? ''}`,
    },
    body: JSON.stringify({
      appId: props.appId,
      versionName: props.versionName,
      devicesId: ids.length ? ids : undefined,
      search: search.value ? search.value : undefined,
      cursor: cursor ?? undefined,
      limit: offset,
      customIdMode: filters.value.CustomId,
    }),
  })

  if (!response.ok) {
    console.log('Cannot get devices', response.status)
    return
  }

  return await response.json() as DevicesResponse
}

async function getCursorForPage(page: number) {
  const target = Math.max(1, page)
  if (pageStartCursor.value.has(target))
    return pageStartCursor.value.get(target)

  while (!pageStartCursor.value.has(target)) {
    const knownPages = Array.from(pageStartCursor.value.keys())
    const lastKnownPage = Math.max(...knownPages)
    const cursor = pageStartCursor.value.get(lastKnownPage)
    if (cursor === null)
      return null
    const data = await fetchDevicesPage(cursor)
    if (!data) {
      pageStartCursor.value.set(lastKnownPage + 1, null)
      continue
    }
    pageStartCursor.value.set(lastKnownPage + 1, data.nextCursor ?? null)
  }

  return pageStartCursor.value.get(target)
}

async function getData() {
  isLoading.value = true
  try {
    const targetPage = Math.max(1, currentPage.value)
    const cursor = await getCursorForPage(targetPage)

    if (!cursor && targetPage > 1) {
      elements.value = []
      hasMore.value = false
      nextCursor.value = undefined
      return
    }

    const dataD = await fetchDevicesPage(cursor)
    if (!dataD) {
      hasMore.value = false
      elements.value = []
      return
    }

    await ensureVersionNames(dataD.data)
    elements.value = dataD.data
    pageStartCursor.value.set(targetPage + 1, dataD.nextCursor ?? null)
    nextCursor.value = dataD.nextCursor
    hasMore.value = dataD.hasMore
  }
  catch (error) {
    console.error(error)
  }
  finally {
    isLoading.value = false
  }
}

async function openOne(one: Device) {
  router.push(`/app/${props.appId}/device/${one.device_id}`)
}
async function openOneVersion(one: Device) {
  if (!props.appId) {
    toast.error(t('app-id-missing', 'App ID is missing'))
    return
  }

  if (one.version) {
    router.push(`/app/${props.appId}/bundle/${one.version}`)
    return
  }

  const loadingToastId = toast.loading(t('loading-version', 'Loading version…'))
  const { data: versionRecord, error } = await supabase
    .from('app_versions')
    .select('id')
    .eq('app_id', props.appId)
    .eq('name', one.version_name)
    .single()
  toast.dismiss(loadingToastId)
  if (error || !versionRecord?.id) {
    toast.error(t('cannot-find-version', 'Cannot find version'))
    return
  }
  router.push(`/app/${props.appId}/bundle/${versionRecord.id}`)
}

function handleAddDevice() {
  emit('addDevice')
}

// TODO: delete the old version check when all devices uses the new version system
async function ensureVersionNames(devices: Device[]) {
  const missingName = devices.filter(device => (!device.version_name || device.version_name === '') && typeof device.version === 'number')
  if (!missingName.length)
    return

  const versionIds = [...new Set(missingName.map(device => device.version as number))]
  if (!versionIds.length)
    return

  const { data: versionRecords, error } = await supabase
    .from('app_versions')
    .select('id, name')
    .in('id', versionIds)

  if (error || !versionRecords?.length)
    return

  const versionMap = versionRecords.reduce<Record<number, string>>((acc, record) => {
    acc[record.id] = record.name
    return acc
  }, {})

  missingName.forEach((device) => {
    const id = typeof device.version === 'number' ? device.version : null
    if (id && versionMap[id])
      device.version_name = versionMap[id]
  })
}
</script>

<template>
  <div>
    <DataTable
      v-model:filters="filters" v-model:columns="columns" v-model:current-page="currentPage" v-model:search="search"
      :total="total" :element-list="elements"
      filter-text="Filters"
      :show-add="showAddButton"
      :is-loading="isLoading"
      :search-placeholder="t('search-by-device-id')"
      @add="handleAddDevice"
      @reload="reload()"
      @reset="refreshData()"
    />
  </div>
</template>
