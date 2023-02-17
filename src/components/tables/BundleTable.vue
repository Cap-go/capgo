<script setup lang="ts">
import type { Ref } from 'vue'
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import type { TableColumn } from '../comp_def'
import type { Database } from '~/types/supabase.types'
import { formatDate } from '~/services/date'
import { useSupabase } from '~/services/supabase'
import { bytesToMbText } from '~/services/conversion'
import IconTrash from '~icons/heroicons/trash?raw'
import { useDisplayStore } from '~/stores/display'

const props = defineProps<{
  appId: string
}>()

const columns: Ref<TableColumn[]> = ref<TableColumn[]>([])
const offset = 10
const { t } = useI18n()
const displayStore = useDisplayStore()
const supabase = useSupabase()
const router = useRouter()
const total = ref(0)
const search = ref('')
const elements = ref<(Database['public']['Tables']['app_versions']['Row'] & Database['public']['Tables']['app_versions_meta']['Row'])[]>([])
const isLoading = ref(false)
const currentPage = ref(1)
const filters = ref({
  'External storage': false,
})
const currentVersionsNumber = computed(() => {
  return (currentPage.value - 1) * offset
})
const didCancel = async (name: string) => {
  displayStore.dialogOption = {
    header: t('alert.confirm-delete'),
    message: `${t('alert.not-reverse-message')} ${t('alert.delete-message')} ${name}?`,
    buttons: [
      {
        text: t('button.cancel'),
        role: 'cancel',
      },
      {
        text: t('button.delete'),
        id: 'confirm-button',
      },
    ],
  }
  displayStore.showDialog = true
  return displayStore.onDialogDismiss()
}
const enhenceVersionElems = async (dataVersions: Database['public']['Tables']['app_versions']['Row'][]) => {
  const { data: dataVersionsMeta } = await supabase
    .from('app_versions_meta')
    .select()
    .in('id', dataVersions.map(({ id }) => id))
  const newVersions = dataVersions.map(({ id, ...rest }) => {
    const version = dataVersionsMeta ? dataVersionsMeta.find(({ id: idMeta }) => idMeta === id) : { size: 0, checksum: '' }
    return { id, ...rest, ...version } as (Database['public']['Tables']['app_versions']['Row'] & Database['public']['Tables']['app_versions_meta']['Row'])
  })
  return newVersions
}
const getData = async () => {
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

    if (filters.value['External storage'])
      req.neq('external_url', null)
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
const deleteOne = async (bundle: Database['public']['Tables']['app_versions']['Row']) => {
  // console.log('deleteBundle', bundle)
  if (await didCancel(t('device.version')))
    return
  try {
    const { data: channelFound, error: errorChannel } = await supabase
      .from('channels')
      .select()
      .eq('app_id', bundle.app_id)
      .eq('version', bundle.id)
    if ((channelFound && channelFound.length) || errorChannel) {
      displayStore.messageToast.push(`${t('device.version')} ${bundle.app_id}@${bundle.name} ${t('pckage.version.is-used-in-channel')}`)
      return
    }
    const { data: deviceFound, error: errorDevice } = await supabase
      .from('devices_override')
      .select()
      .eq('app_id', bundle.app_id)
      .eq('version', bundle.id)
    if ((deviceFound && deviceFound.length) || errorDevice) {
      displayStore.messageToast.push(`${t('device.version')} ${bundle.app_id}@${bundle.name} ${t('package.version.is-used-in-device')}`)
      return
    }
    const { error: delError } = await supabase
      .storage
      .from('apps')
      .remove([`${bundle.user_id}/${bundle.app_id}/versions/${bundle.bucket_id}`])
    const { error: delAppError } = await supabase
      .from('app_versions')
      .update({ deleted: true })
      .eq('app_id', bundle.app_id)
      .eq('id', bundle.id)
    if (delAppError || delError) {
      displayStore.messageToast.push(t('package.cannot-delete-version'))
    }
    else {
      displayStore.messageToast.push(t('package.version-deleted'))
      await refreshData()
    }
  }
  catch (error) {
    displayStore.messageToast.push(t('package.cannot-delete-version'))
  }
}

columns.value = [
  {
    label: 'Name',
    key: 'name',
    mobile: 'title',
    sortable: true,
    head: true,
  },
  {
    label: 'Created at',
    key: 'created_at',
    mobile: 'header',
    sortable: 'desc',
    displayFunction: (elem: Database['public']['Tables']['app_versions']['Row'] & Database['public']['Tables']['app_versions_meta']['Row']) => formatDate(elem.created_at || ''),
  },
  {
    label: 'Size',
    mobile: 'footer',
    key: 'size',
    sortable: true,
    displayFunction: (elem: Database['public']['Tables']['app_versions']['Row'] & Database['public']['Tables']['app_versions_meta']['Row']) => {
      if (elem.size)
        return bytesToMbText(elem.size)
      else if (elem.external_url)
        return t('package.externally')
      else
        return t('package.size_not_found')
    },
  },
  {
    label: 'Action',
    key: 'action',
    mobile: 'after',
    icon: IconTrash,
    class: 'text-red-500',
    onClick: deleteOne,
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

const openOne = async (bundle: Database['public']['Tables']['app_versions']['Row']) => {
  router.push(`/app/p/${props.appId.replace(/\./g, '--')}/bundle/${bundle.id}`)
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
    filter-text="Filters"
    :is-loading="isLoading"
    :search-placeholder="t('search-bundle')"
    @reload="reload()" @reset="refreshData()"
    @row-click="openOne"
  />
</template>
