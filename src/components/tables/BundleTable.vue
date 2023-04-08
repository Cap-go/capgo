<script setup lang="ts">
import type { Ref } from 'vue'
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import type { TableColumn } from '../comp_def'
import type { Database } from '~/types/supabase.types'
import { formatDate } from '~/services/date'
import { useSupabase } from '~/services/supabase'
import { appIdToUrl, bytesToMbText } from '~/services/conversion'
import IconTrash from '~icons/heroicons/trash?raw'
import { useDisplayStore } from '~/stores/display'

const props = defineProps<{
  appId: string
}>()

const element: Database['public']['Tables']['app_versions']['Row'] & Database['public']['Tables']['app_versions_meta']['Row'] = {} as any

const columns: Ref<TableColumn[]> = ref<TableColumn[]>([])
const offset = 10
const { t } = useI18n()
const displayStore = useDisplayStore()
const supabase = useSupabase()
const router = useRouter()
const total = ref(0)
const search = ref('')
const elements = ref<(typeof element)[]>([])
const isLoading = ref(false)
const currentPage = ref(1)
const filters = ref({
  'external-storage': false,
  'encrypted': false,
})
const currentVersionsNumber = computed(() => {
  return (currentPage.value - 1) * offset
})
async function didCancel(name: string) {
  displayStore.dialogOption = {
    header: t('alert-confirm-delete'),
    message: `${t('alert-not-reverse-message')} ${t('alert-delete-message')} ${name}?`,
    buttons: [
      {
        text: t('button-cancel'),
        role: 'cancel',
      },
      {
        text: t('button-delete'),
        id: 'confirm-button',
      },
    ],
  }
  displayStore.showDialog = true
  return displayStore.onDialogDismiss()
}
async function enhenceVersionElems(dataVersions: Database['public']['Tables']['app_versions']['Row'][]) {
  const { data: dataVersionsMeta } = await supabase
    .from('app_versions_meta')
    .select()
    .in('id', dataVersions.map(({ id }) => id))
  const newVersions = dataVersions.map(({ id, ...rest }) => {
    const version = dataVersionsMeta ? dataVersionsMeta.find(({ id: idMeta }) => idMeta === id) : { size: 0, checksum: '' }
    return { id, ...rest, ...version } as typeof element
  })
  return newVersions
}
async function getData() {
  isLoading.value = true
  try {
    const req = supabase
      .from('app_versions')
      .select('*', { count: 'exact' })
      .eq('app_id', props.appId)
      .eq('deleted', false)
      .range(currentVersionsNumber.value, currentVersionsNumber.value + offset - 1)

    if (search.value)
      req.like('name', `%${search.value}%`)

    if (filters.value['external-storage'])
      req.neq('external_url', null)
    if (filters.value.encrypted)
      req.neq('session_key', null)
    if (columns.value.length) {
      columns.value.forEach((col) => {
        if (col.sortable && typeof col.sortable === 'string')
          req.order(col.key as any, { ascending: col.sortable === 'asc' })
      })
    }
    const { data: dataVersions, count } = await req
    if (!dataVersions)
      return
    elements.value.push(...(await enhenceVersionElems(dataVersions)))
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
    await getData()
  }
  catch (error) {
    console.error(error)
  }
}
async function deleteOne(one: typeof element) {
  // console.log('deleteBundle', bundle)
  if (await didCancel(t('version')))
    return
  try {
    const { data: channelFound, error: errorChannel } = await supabase
      .from('channels')
      .select()
      .eq('app_id', one.app_id)
      .eq('version', one.id)
    if ((channelFound && channelFound.length) || errorChannel) {
      toast.error(`${t('version')} ${one.app_id}@${one.name} ${t('bundle-is-linked-channel')}`)
      return
    }
    const { data: deviceFound, error: errorDevice } = await supabase
      .from('devices_override')
      .select()
      .eq('app_id', one.app_id)
      .eq('version', one.id)
    if ((deviceFound && deviceFound.length) || errorDevice) {
      toast.error(`${t('version')} ${one.app_id}@${one.name} ${t('bundle-is-linked-device')}`)
      return
    }
    const { error: delAppError } = await supabase
      .from('app_versions')
      .update({ deleted: true })
      .eq('app_id', one.app_id)
      .eq('id', one.id)
    if (delAppError) {
      toast.error(t('cannot-delete-bundle'))
    }
    else {
      toast.success(t('bundle-deleted'))
      await refreshData()
    }
  }
  catch (error) {
    toast.error(t('cannot-delete-bundle'))
  }
}

columns.value = [
  {
    label: t('name'),
    key: 'name',
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
    label: t('size'),
    mobile: 'footer',
    key: 'size',
    sortable: true,
    displayFunction: (elem: typeof element) => {
      if (elem.size)
        return bytesToMbText(elem.size)
      else if (elem.external_url)
        return t('stored-externally')
      else
        return t('size-not-found')
    },
  },
  {
    label: t('action'),
    key: 'action',
    mobile: 'after',
    icon: IconTrash,
    class: 'text-red-500',
    onClick: deleteOne,
  },
]

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

async function openOne(one: typeof element) {
  router.push(`/app/p/${appIdToUrl(props.appId)}/bundle/${one.id}`)
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
    :total="total" row-click :element-list="elements"
    filter-text="filters"
    :is-loading="isLoading"
    :search-placeholder="t('search-bundle-id')"
    @reload="reload()" @reset="refreshData()"
    @row-click="openOne"
  />
</template>
