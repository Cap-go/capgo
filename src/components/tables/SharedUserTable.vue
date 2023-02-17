<script setup lang="ts">
import type { Ref } from 'vue'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TableColumn } from '../comp_def'
// import type { Database } from '~/types/supabase.types'
import { formatDate } from '~/services/date'
import { getST, useSupabase } from '~/services/supabase'
import { useDisplayStore } from '~/stores/display'
import IconTrash from '~icons/heroicons/trash'

const props = defineProps<{
  appId: string
  channelId?: number | undefined
}>()

// interface ChannelUsers {
//   user_id: Database['public']['Tables']['users']['Row']
// }

// interface ChannelUsers extends Database['public']['Tables']['channel_users']['Row'] {

// user_id: Database['public']['Tables']['users']['Row']

// }

// const select = `
//           id,
//           channel_id,
//           users (
//             id,
//             email,
//             first_name,
//             last_name
//           ),
//           created_at
//         `
// getST('channel_users', select)
// const element = await getST('channel_users', select)

const columns: Ref<TableColumn[]> = ref<TableColumn[]>([])
const displayStore = useDisplayStore()
const supabase = useSupabase()
const { t } = useI18n()
const total = ref(0)
const search = ref('')
const elements = ref<Element[]>([])
const isLoading = ref(false)
const currentPage = ref(1)
const offset = 10
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

const getData = async () => {
  isLoading.value = true
  try {
    const req = supabase
      .from('channel_users')
      .select(`
          id,
          channel_id,
          users (
            id,
            email,
            first_name,
            last_name
          ),
          created_at
        `, { count: 'exact' })
      .eq('app_id', props.appId)
      .range(currentVersionsNumber.value, currentVersionsNumber.value + offset - 1)
      .throwOnError()

    if (props.channelId)
      req.eq('channel_id', props.channelId)

    if (search.value)
      req.like('name', `%${search.value}%`)

    if (columns.value.length) {
      columns.value.forEach((col) => {
        if (col.sortable && typeof col.sortable === 'string')
          req.order(col.key as any, { ascending: col.sortable === 'asc' })
      })
    }
    const { data, count } = await req
    data[0].

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
const deleteOne = async (usr: typeof element) => {
  if (await didCancel(t('channel.user')))
    return
  const { error } = await supabase
    .from('channel_users')
    .delete()
    .eq('app_id', props.appId)
    .eq('user_id', usr.id)
  if (error)
    console.error(error)
  else
    await refreshData()
}

columns.value = [
  {
    label: 'Email',
    key: 'device_id',
    mobile: 'title',
    sortable: true,
    head: true,
  },
  {
    label: 'Created at',
    key: 'created_at',
    mobile: 'header',
    sortable: 'desc',
    displayFunction: (elem: typeof element) => formatDate(elem.created_at || ''),
  },
  {
    label: 'Name',
    key: 'platform',
    mobile: 'header',
    sortable: true,
    head: true,
    displayFunction: (elem: typeof element) => `${elem.user_id.first_name} ${elem.user_id.last_name}`,
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

onMounted(async () => {
  await refreshData()
})
</script>

<template>
  <Table
    v-model:columns="columns" v-model:current-page="currentPage" v-model:search="search"
    :total="total" row-click :element-list="elements"
    filter-text="Filters"
    :is-loading="isLoading"
    :search-placeholder="t('search-user')"
    @reload="reload()" @reset="refreshData()"
  />
</template>
