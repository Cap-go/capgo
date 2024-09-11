<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'petite-vue-i18n'
import ky from 'ky'
import type { TableColumn } from '../comp_def'
import type { Database } from '~/types/supabase.types'
import { formatDate } from '~/services/date'
import { defaultApiHost, useSupabase } from '~/services/supabase'
import { appIdToUrl } from '~/services/conversion'

const props = defineProps<{
  appId: string
  ids?: string[]
  versionId?: number | undefined
}>()

type Element = Database['public']['Tables']['devices']['Row'] & { version: Database['public']['Tables']['app_versions']['Row'] }

const { t } = useI18n()
const supabase = useSupabase()
const router = useRouter()
const total = ref(0)
const search = ref('')
const elements = ref<Element[]>([])
const isLoading = ref(false)
const currentPage = ref(1)
const filters = ref({
  Override: false,
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
  },
  {
    label: t('updated-at'),
    key: 'updated_at',
    mobile: false,
    sortable: 'desc',
    displayFunction: (elem: Element) => formatDate(elem.updated_at || ''),
  },
  {
    label: t('platform'),
    key: 'platform',
    mobile: true,
    sortable: true,
    head: true,
    displayFunction: (elem: Element) => `${elem.platform} ${elem.os_version}`,
  },
  {
    label: t('bundle'),
    key: 'version',
    mobile: true,
    sortable: true,
    head: true,
    displayFunction: (elem: Element) => elem.version.name,
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

  let reqq = supabase
    .from('devices_override')
    .select('device_id')
    .eq('app_id', props.appId)

  if (props.ids)
    reqq = reqq.eq('device_id', props.ids)

  const { data: dataOverride } = await reqq

  const channelDev = data?.map(d => d.device_id) || []
  const overrideDev = dataOverride?.map(d => d.device_id) || []
  return [...channelDev, ...overrideDev]
}

interface DeviceData {
  app_id: string
  device_id: string
  version: number
  created_at: string
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
        'authorization': `Bearer ${currentJwt || ''}`,
      },
      body: JSON.stringify({
        count: true,
        // devicesId: props.ids?.length ? props.ids : undefined,
        appId: props.appId,
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
          'authorization': `Bearer ${currentJwt || ''}`,
        },
        body: JSON.stringify({
          appId: props.appId,
          versionId: props.versionId,
          devicesId: ids.length ? ids : undefined,
          search: search.value ? search.value : undefined,
          order: columns.value.filter(elem => elem.sortable).map(elem => ({ key: elem.key as string, sortable: elem.sortable })),
          rangeStart: currentVersionsNumber.value,
          rangeEnd: currentVersionsNumber.value + offset - 1,
        }),
      })
      .then(res => res.json<DeviceData[]>())
      .catch((err) => {
        console.log('Cannot get devices', err)
        return [] as DeviceData[]
      })
    // console.log('dataD', dataD)

    const versionPromises = dataD.map((element) => {
      return supabase
        .from('app_versions')
        .select('name')
        .eq('id', element.version)
        .single()
    })

    // Cast so that we can set version from the other request
    const finalData = dataD as any as Database['public']['Tables']['devices']['Row'] & { version: Database['public']['Tables']['app_versions']['Row'] }[]

    // This is faster then awaiting in a big loop
    const versionData = await Promise.all(versionPromises)
    versionData.forEach((version, index) => {
      if (version.error)
        finalData[index].version = { name: 'unknown' } as any
      else
        finalData[index].version = version.data as any
    })

    elements.value.push(...finalData as any)
  }
  catch (error) {
    console.error(error)
  }
  isLoading.value = false
}

async function reload() {
  // console.log('reload')
  try {
    elements.value.length = 0
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
async function openOne(one: Element) {
  router.push(`/app/p/${appIdToUrl(props.appId)}/d/${one.device_id}`)
}

onMounted(async () => {
  await refreshData()
})
</script>

<template>
  <Table
    v-model:filters="filters" v-model:columns="columns" v-model:current-page="currentPage" v-model:search="search"
    :total="total" row-click :element-list="elements"
    filter-text="Filters"
    :plus-button="true"
    :is-loading="isLoading"
    :search-placeholder="t('search-by-device-id')"
    class="p-3" @reload="reload()"
    @reset="refreshData()"
    @row-click="openOne"
  />
  <AddDeviceOverwriteButton :app-id="props.appId" />
</template>
