<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import type { TableColumn } from '../comp_def'
import type { Database } from '~/types/supabase.types'
import { formatDate } from '~/services/date'
import { useSupabase } from '~/services/supabase'
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
const elements = ref<typeof element[]>([])
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

async function getData() {
  isLoading.value = true
  try {
    let ids: string[] = []
    if (filters.value.Override)
      ids = await getDevicesID()

    const req = await supabase.functions.invoke('private/devices', {
      body: {
        // appId: string, versionId?: string, deviceIds?: string[], search?: string, order?: Order[], rangeStart?: number, rangeEnd?: number
        appId: props.appId,
        versionId: props.versionId,
        devicesId: ids.length ? ids : undefined,
        search: search.value ? search.value : undefined,
        order: columns.value.filter(elem => elem.sortable).map(elem => ({ key: elem.key as string, sortable: elem.sortable })),
        rangeStart: currentVersionsNumber.value,
        rangeEnd: currentVersionsNumber.value + offset - 1,
      },
    })
    const { data, count } = (await req).data
    if (!data)
      return

    const versionPromises = data.map((element) => {
      return supabase
        .from('app_versions')
        .select('name')
        .eq('id', element.version)
        .single()
    })

    // Cast so that we can set version from the other request
    const finalData = data as any as Database['public']['Tables']['devices']['Row'] & { version: Database['public']['Tables']['app_versions']['Row'] }[]

    // This is faster then awaiting in a big loop
    const versionData = await Promise.all(versionPromises)
    versionData.forEach((version, index) => {
      if (version.error)
        finalData[index].version = { name: 'unknown' } as any
      else
        finalData[index].version = version.data as any
    })

    elements.value.push(...finalData as any)
    total.value = count || 0
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
</script>

<template>
  <Table
    v-model:filters="filters" v-model:columns="columns" v-model:current-page="currentPage" v-model:search="search"
    :total="total" row-click :element-list="elements"
    filter-text="Filters"
    :is-loading="isLoading"
    :search-placeholder="t('search-by-device-id')"
    @reload="reload()" @reset="refreshData()"
    @row-click="openOne"
  />
</template>
