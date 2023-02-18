<script setup lang="ts">
import type { Ref } from 'vue'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TableColumn } from '../comp_def'
import type { Database } from '~/types/supabase.types'
import { formatDate } from '~/services/date'
import { useSupabase } from '~/services/supabase'

const props = defineProps<{
  deviceId?: string
  appId?: string
}>()

interface Channel {
  version: {
    name: string
    created_at: string
  }
}
const element: Database['public']['Tables']['stats']['Row'] & Channel = {} as any

const columns: Ref<TableColumn[]> = ref<TableColumn[]>([])
const offset = 10
const { t } = useI18n()
const supabase = useSupabase()
const total = ref(0)
const search = ref('')
const elements = ref<(typeof element)[]>([])
const isLoading = ref(false)
const currentPage = ref(1)
const filters = ref()
const currentVersionsNumber = computed(() => {
  return (currentPage.value - 1) * offset
})

const getData = async () => {
  isLoading.value = true
  try {
    const req = supabase
      .from('stats')
      .select(`
        device_id,
        action,
        platform,
        version_build,
        version (
            name
        ),
        created_at,
        updated_at
      `)
      .eq('app_id', props.appId)
      .range(currentVersionsNumber.value, currentVersionsNumber.value + offset - 1)

    if (props.deviceId)
      req.eq('device_id', props.deviceId)

    if (search.value)
      req.like('action', `%${search.value}%`)

    if (columns.value.length) {
      columns.value.forEach((col) => {
        if (col.sortable && typeof col.sortable === 'string')
          req.order(col.key as any, { ascending: col.sortable === 'asc' })
      })
    }
    const { data: dataVersions, count } = await req
    if (!dataVersions)
      return
    elements.value.push(...dataVersions as any)
    // console.log('count', count)
    total.value = count || 0
  }
  catch (error) {
    console.error(error)
  }
  isLoading.value = false
}
const refreshData = async () => {
  console.log('refreshData')
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
    label: t('action'),
    key: 'action',
    mobile: 'title',
    sortable: true,
    head: true,
  },
  {
    label: t('device.created_at'),
    key: 'created_at',
    mobile: 'header',
    sortable: 'desc',
    displayFunction: (elem: typeof element) => formatDate(elem.created_at || ''),
  },
  {
    label: t('device.version'),
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
    :search-placeholder="t('search-by-action')"
    @reload="reload()" @reset="refreshData()"
  />
</template>
