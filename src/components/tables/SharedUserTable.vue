<script setup lang="ts">
import type { Ref } from 'vue'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  kFab,
} from 'konsta/vue'
import type { TableColumn } from '../comp_def'
import { formatDate } from '~/services/date'
import { useSupabase } from '~/services/supabase'
import { useDisplayStore } from '~/stores/display'
import IconTrash from '~icons/heroicons/trash?raw'
import type { Database } from '~/types/supabase.types'
import IconPlus from '~icons/heroicons/plus?width=1em&height=1em'

const props = defineProps<{
  appId: string
  channelId: number
  allowAdd?: boolean
}>()

interface ChannelUsers {
  user_id: Database['public']['Tables']['users']['Row']
}
const element: Database['public']['Tables']['channel_users']['Row'] & ChannelUsers = {} as any

const columns: Ref<TableColumn[]> = ref<TableColumn[]>([])
const displayStore = useDisplayStore()
const supabase = useSupabase()
const { t } = useI18n()
const total = ref(0)
const search = ref('')
const elements = ref<Element[]>([])
const isLoading = ref(false)
const addUserModal = ref(false)
const currentPage = ref(1)
const offset = 10
const currentVersionsNumber = computed(() => {
  return (currentPage.value - 1) * offset
})
const didCancel = async (name: string) => {
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

const getData = async () => {
  isLoading.value = true
  try {
    const req = supabase
      .from('channel_users')
      .select(`
          id,
          channel_id,
          user_id (
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
const deleteOne = async (one: typeof element) => {
  if (await didCancel(t('user')))
    return
  const { error } = await supabase
    .from('channel_users')
    .delete()
    .eq('app_id', props.appId)
    .eq('user_id', one.id)
  if (error)
    console.error(error)
  else
    await refreshData()
}

const deleteUser = async (usr: Database['public']['Tables']['users']['Row']) => {
  if (await didCancel(t('user')))
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

const onClick = async (usr: Database['public']['Tables']['users']['Row']) => {
  displayStore.actionSheetOption = {
    buttons: [
      {
        text: t('button-delete'),
        handler: () => {
          displayStore.showActionSheet = false
          deleteUser(usr)
        },
      },
      {
        text: t('button-cancel'),
        role: 'cancel',
        handler: () => {
          // console.log('Cancel clicked')
        },
      },
    ],
  }
  displayStore.showActionSheet = true
}

columns.value = [
  {
    label: t('email'),
    key: 'email',
    mobile: 'title',
    sortable: true,
    displayFunction: (elem: typeof element) => elem.user_id.email,
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
    label: t('name'),
    key: 'platform',
    mobile: 'footer',
    sortable: true,
    head: true,
    displayFunction: (elem: typeof element) => `${elem.user_id.first_name} ${elem.user_id.last_name}`,
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

onMounted(async () => {
  await refreshData()
})
</script>

<template>
  <div>
    <Table
      v-model:columns="columns" v-model:current-page="currentPage" v-model:search="search"
      :total="total" row-click :element-list="elements"
      filter-text="Filters"
      :is-loading="isLoading"
      :search-placeholder="t('search-user')"
      @row-click="onClick"
      @reload="reload()" @reset="refreshData()"
    />
    <k-fab v-if="allowAdd && channelId" class="fixed z-20 right-4-safe bottom-20-safe md:right-4-safe md:bottom-4-safe secondary" @click="addUserModal = true">
      <template #icon>
        <component :is="IconPlus" />
      </template>
    </k-fab>
    <NewUserModal :opened="addUserModal" :app-id="appId" :channel-id="channelId" @close="addUserModal = false; refreshData()" />
  </div>
</template>
