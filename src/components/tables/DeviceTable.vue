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

const element: Database['public']['Tables']['devices']['Row'] = {} as any

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
    label: t('created-at'),
    key: 'created_at',
    mobile: 'header',
    sortable: 'desc',
    displayFunction: (elem: typeof element) => formatDate(elem.created_at || ''),
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

const getDevicesID = async (elem: typeof element) => {
  const req = supabase
    .from('channel_devices')
    .select('device_id')
    .eq('app_id', props.appId)

  if (props.ids)
    req.in('device_id', props.ids)

  const { data } = await req

  const reqq = supabase
    .from('devices_override')
    .select('device_id')
    .eq('app_id', props.appId)

  if (props.ids)
    reqq.eq('device_id', props.ids)

  const { data: dataOverride } = await reqq

  const channelDev = data?.map(d => d.device_id) || []
  const overrideDev = dataOverride?.map(d => d.device_id) || []
  return [...channelDev, ...overrideDev]
}

const getData = async () => {
  isLoading.value = true
  try {
    const req = supabase
      .from('devices')
      .select('device_id,created_at,platform,os_version,version(name)', { count: 'exact' })
      .eq('app_id', props.appId)
      .range(currentVersionsNumber.value, currentVersionsNumber.value + offset - 1)

    if (props.versionId)
      req.eq('version', props.versionId)

    if (props.ids)
      req.in('device_id', props.ids)

    if (search.value)
      req.like('device_id', `%${search.value}%`)

    if (filters.value.Override) {
      const ids = await getDevicesID(element)
      req.in('device_id', ids)
    }
    if (columns.value.length) {
      columns.value.forEach((col) => {
        if (col.sortable && typeof col.sortable === 'string')
          req.order(col.key as any, { ascending: col.sortable === 'asc' })
      })
    }
    const { data, count } = await req
    if (!data)
      return
    elements.value.push(...data as any)
    total.value = count || 0
  }
  catch (error) {
    console.error(error)
  }
  isLoading.value = false
}

const reload = async () => {
  console.log('reload')
  try {
    elements.value.length = 0
    await getData()
  }
  catch (error) {
    console.error(error)
  }
}

const refreshData = async () => {
  try {
    currentPage.value = 1
    elements.value.length = 0
    await getData()
  }
  catch (error) {
    console.error(error)
  }
}
const openOne = async (one: typeof element) => {
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
