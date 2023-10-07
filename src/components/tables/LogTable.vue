<script setup lang="ts">
import type { Ref } from 'vue'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import type { TableColumn } from '../comp_def'
import type { Database } from '~/types/supabase.types'
import { formatDate } from '~/services/date'
import { useSupabase } from '~/services/supabase'
import { appIdToUrl } from '~/services/conversion'

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
const element: Database['public']['Tables']['stats']['Row'] & Channel = {} as any

const columns: Ref<TableColumn[]> = ref<TableColumn[]>([])
const offset = 10
const router = useRouter()
const { t } = useI18n()
const supabase = useSupabase()
const total = ref(0)
const search = ref('')
const elements = ref<(typeof element)[]>([])
const versions = ref<Channel['version'][]>([])
const isLoading = ref(false)
const currentPage = ref(1)
const filters = ref()
const currentVersionsNumber = computed(() => {
  return (currentPage.value - 1) * offset
})

function findVersion(id: number, versions: { name: string; id: number }[]) {
  return versions.find(elem => elem.id === id)
}

async function versionData() {
  try {
    const versionsIdAlreadyFetch = versions.value.map(elem => elem.id)
    const versionsIds = elements.value
      .map(elem => elem.version)
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
      elem.version = findVersion(elem.version, versions.value) || { name: 'unknown', id: 0 } as any
    })
  }
  catch (error) {
    console.error(error)
  }
}

async function getData() {
  isLoading.value = true
  try {
    const req = await supabase.functions.invoke('get_stats', {
      body: {
        appId: props.appId,
        deviceId: props.deviceId,
        search: search.value,
        order: columns.value.filter(elem => elem.sortable).map(elem => ({ key: elem.key as string, sortable: elem.sortable })),
        rangeStart: currentVersionsNumber.value,
        rangeEnd: currentVersionsNumber.value + offset - 1,
      },
    })
    const { data, count } = (await req).data
    if (!data)
      return
    elements.value.push(...data as any)
    // console.log('count', count)
    total.value = count || 0
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
    label: t('action'),
    key: 'action',
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
    label: t('version'),
    key: 'version',
    mobile: 'footer',
    sortable: false,
    displayFunction: (elem: typeof element) => elem.version.name,
  },
  {
    label: t('version-build'),
    key: 'version_build',
    mobile: 'after',
    sortable: false,
  },
]

if (!props.deviceId) {
  columns.value.push({
    label: t('device'),
    key: 'platform',
    mobile: 'after',
    sortable: false,
    displayFunction: (elem: typeof element) => `${elem.device_id} ${elem.platform}`,
  })
}

async function reload() {
  console.log('reload')
  try {
    elements.value.length = 0
    await getData()
    await versionData()
  }
  catch (error) {
    console.error(error)
  }
}
async function openOne(one: typeof element) {
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
  <Table
    v-model:filters="filters" v-model:columns="columns" v-model:current-page="currentPage" v-model:search="search"
    :total="total" :element-list="elements"
    filter-text="Filters"
    :is-loading="isLoading"
    :search-placeholder="deviceId ? t('search-by-device-id-0') : t('search-by-device-id-')"
    @reload="reload()" @reset="refreshData()"
    @row-click="openOne"
  />
</template>
