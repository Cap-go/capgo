<script setup lang="ts">
import { onMounted, ref } from 'vue'
import ky from 'ky'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import dayjs from 'dayjs'
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

const element: Database['public']['Tables']['devices']['Row'] & { version: Database['public']['Tables']['app_versions']['Row'] } = {} as any

const { t } = useI18n()
const supabase = useSupabase()
const router = useRouter()
const total = ref(0)
const search = ref('')
const range = ref<[Date, Date]>([dayjs().subtract(1, 'hour').toDate(), new Date()])
const elements = ref<typeof element[]>([])
const isLoading = ref(false)
const currentPage = ref(1)
const filters = ref({
  Override: false,
})
const columns = ref<TableColumn[]>([
  {
    label: t('device-id'),
    key: 'device_id',
    mobile: 'title',
    sortable: true,
    head: true,
  },
  {
    label: t('updated-at'),
    key: 'updated_at',
    mobile: 'header',
    sortable: 'desc',
    displayFunction: (elem: typeof element) => formatDate(elem.updated_at || ''),
  },
  {
    label: t('platform'),
    key: 'platform',
    mobile: 'footer',
    sortable: true,
    head: true,
    displayFunction: (elem: typeof element) => `${elem.platform} ${elem.os_version}`,
  },
  {
    label: t('bundle'),
    key: 'version',
    mobile: 'after',
    sortable: true,
    head: true,
    displayFunction: (elem: typeof element) => elem.version.name,
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
interface deviceData {
  app_id: string
  created_at: string
  custom_id: string
  device_id: string
  is_emulator: boolean | null
  is_prod: boolean | null
  os_version: string | null
  platform: Database['public']['Enums']['platform_os'] | null
  plugin_version: string
  updated_at: string
  version_id: number
  version_build: string | null
}

async function getData() {
  isLoading.value = true
  try {
    let ids: string[] = []
    if (filters.value.Override)
      ids = await getDevicesID()

    const { data: currentSession } = await supabase.auth.getSession()!
    if (!currentSession.session)
      return
    const currentJwt = currentSession.session.access_token
    console.log('defaultApiHost', defaultApiHost) //  TODO: remove the custom preprood host when publishing
    const defaultApiHostPreprod = 'https://api-preprod.capgo.app'
    const dataD = await ky
      .post(`${defaultApiHostPreprod}/private/devices`, {
        headers: {
          'Content-Type': 'application/json',
          'authorization': `Bearer ${currentJwt}` || '',
        },
        body: JSON.stringify({
          api: 'v2', // TODO: remove this when we remove the old api
          appId: props.appId,
          versionId: props.versionId,
          devicesId: ids.length ? ids : undefined,
          search: search.value ? search.value : undefined,
          order: columns.value.filter(elem => elem.sortable).map(elem => ({ key: elem.key as string, sortable: elem.sortable })),
          rangeStart: range.value ? range.value[0].getTime() : undefined,
          rangeEnd: range.value ? range.value[1].getTime() : undefined,
        }),
      })
      .then(res => res.json<deviceData[]>())
      .catch((err) => {
        console.log('Cannot get devices', err)
        return [] as deviceData[]
      })
    console.log('dataD', dataD)

    const versionPromises = dataD.map((element) => {
      return supabase
        .from('app_versions')
        .select('name')
        .eq('id', element.version_id)
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
  console.log('reload')
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
    await getData()
  }
  catch (error) {
    console.error(error)
  }
}
async function openOne(one: typeof element) {
  router.push(`/app/p/${appIdToUrl(props.appId)}/d/${one.device_id}`)
}
onMounted(async () => {
  await refreshData()
})
function newRange(r: { start: Date, end: Date }) {
  console.log('newRange', r)
  range.value = [r.start, r.end]
}
</script>

<template>
  <Table
    v-model:filters="filters" v-model:columns="columns" v-model:current-page="currentPage" v-model:search="search"
    :total="total" row-click :element-list="elements"
    filter-text="Filters"
    :is-loading="isLoading"
    :app-id="props.appId"
    :search-placeholder="t('search-by-device-id')"
    @reload="reload()" @reset="refreshData()"
    @row-click="openOne"
    @range-change="newRange($event)"
  />
</template>
