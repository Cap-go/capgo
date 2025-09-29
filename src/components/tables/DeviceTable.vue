<script setup lang="ts">
import type { TableColumn } from '../comp_def'
import type { Database } from '~/types/supabase.types'
import ky from 'ky'
import { computed, h, ref } from 'vue'
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

// TODO: delete the old version check when all deivces uses the new version system
type Device = Database['public']['Tables']['devices']['Row'] & {
  version?: number | { id?: number | null, name?: string | null } | null
}

const { t } = useI18n()
const supabase = useSupabase()
const router = useRouter()
const total = ref(0)
const search = ref('')
const elements = ref<Device[]>([])
const isLoading = ref(false)
const currentPage = ref(1)
const filters = ref({
  Override: false,
  CustomId: false,
})
const offset = 10
const currentVersionsNumber = computed(() => {
  return (currentPage.value - 1) * offset
})
const columns = ref<TableColumn[]>([
  {
    label: t('device-id'),
    key: 'device_id',
    class: 'truncate max-w-10',
    mobile: true,
    sortable: true,
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
    sortable: 'desc',
    displayFunction: (elem: Device) => formatDate(elem.updated_at ?? ''),
  },
  {
    label: t('platform'),
    key: 'platform',
    mobile: true,
    sortable: true,
    head: true,
    displayFunction: (elem: Device) => `${elem.platform} ${elem.os_version}`,
  },
  {
    label: t('bundle'),
    key: 'version_name',
    mobile: true,
    sortable: true,
    head: true,
    displayFunction: (elem: Device) => getVersionLabel(elem) || 'unknown',
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
  const dataD = await ky
    .post(`${defaultApiHost}/private/devices`, {
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
    .then(res => res.json<{ count: number }>())
    .catch((err) => {
      console.log('Cannot get devices', err)
      return { count: 0 }
    })
  return dataD.count
}

async function getData() {
  isLoading.value = true
  try {
    let ids: string[] = []
    if (filters.value.Override)
      ids = await getDevicesID()
    else if (props.ids)
      ids = props.ids

    const { data: currentSession } = await supabase.auth.getSession()!
    if (!currentSession.session)
      return
    const currentJwt = currentSession.session.access_token
    const dataD = await ky
      .post(`${defaultApiHost}/private/devices`, {
        headers: {
          'Content-Type': 'application/json',
          'authorization': `Bearer ${currentJwt ?? ''}`,
        },
        body: JSON.stringify({
          appId: props.appId,
          versionName: props.versionName,
          devicesId: ids.length ? ids : undefined,
          search: search.value ? search.value : undefined,
          order: columns.value.filter(elem => elem.sortable).map(elem => ({ key: elem.key as string, sortable: elem.sortable })),
          rangeStart: currentVersionsNumber.value,
          rangeEnd: currentVersionsNumber.value + offset - 1,
          customIdMode: filters.value.CustomId,
        }),
      })
      .then(res => res.json<Device[]>())
      .catch((err) => {
        console.log('Cannot get devices', err)
        return [] as Device[]
      })
    // console.log('dataD', dataD)

    await ensureVersionNames(dataD)

    elements.value.push(...dataD)
  }
  catch (error) {
    console.error(error)
  }
  isLoading.value = false
}

async function reload() {
  try {
    elements.value.length = 0
    total.value = await countDevices()
    await getData()
  }
  catch (error) {
    console.error(error)
  }
}

async function refreshData() {
  try {
    currentPage.value = 1
    elements.value.length = 0
    total.value = await countDevices()
    await getData()
  }
  catch (error) {
    console.error(error)
  }
}
async function openOne(one: Device) {
  router.push(`/app/p/${props.appId}/d/${one.device_id}`)
}
async function openOneVersion(one: Device) {
  if (!props.appId) {
    toast.error(t('app-id-missing', 'App ID is missing'))
    return
  }
  const numericVersionId = typeof one.version === 'number'
    ? one.version
    : (typeof one.version === 'object' && one.version !== null && typeof (one.version as any).id === 'number'
        ? (one.version as any).id as number
        : null)

  if (numericVersionId) {
    router.push(`/app/p/${props.appId}/bundle/${numericVersionId}`)
    return
  }

  const versionName = getVersionLabel(one)
  if (!versionName || versionName === 'unknown') {
    toast.error(t('version-name-missing', 'Version name is missing'))
    return
  }
  // TODO: delete the old version check when all deivces uses the new version system
  if (one.version && typeof one.version === 'object' && one.version?.id) {
    router.push(`/app/p/${props.appId}/bundle/${one.version.id}`)
    return
  }
  if (one.version && typeof one.version === 'number') {
    router.push(`/app/p/${props.appId}/bundle/${one.version}`)
    return
  }
  const loadingToastId = toast.loading(t('loading-version', 'Loading version…'))
  const { data: versionRecord, error } = await supabase
    .from('app_versions')
    .select('id')
    .eq('app_id', props.appId)
    .eq('name', versionName)
    .maybeSingle()
  toast.dismiss(loadingToastId)
  if (error || !versionRecord?.id) {
    toast.error(t('cannot-find-version', 'Cannot find version'))
    return
  }
  router.push(`/app/p/${props.appId}/bundle/${versionRecord.id}`)
}

function handleAddDevice() {
  emit('addDevice')
}

// TODO: delete the old version check when all deivces uses the new version system
function getVersionLabel(device: Device): string {
  if (device.version_name && device.version_name !== '')
    return device.version_name
  if (typeof device.version === 'object' && device.version !== null && typeof (device.version as any).name === 'string')
    return (device.version as any).name as string
  if (typeof device.version === 'number')
    return String(device.version)
  if (typeof device.version === 'string')
    return device.version
  return ''
}

// TODO: delete the old version check when all deivces uses the new version system
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
    <Table
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
