<script setup lang="ts">
import type { Ref } from 'vue'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import {
  kDialog,
  kDialogButton,
  kFab,
} from 'konsta/vue'
import type { TableColumn } from '../comp_def'
import { formatDate } from '~/services/date'
import { existUser, useSupabase } from '~/services/supabase'
import { useDisplayStore } from '~/stores/display'
import IconTrash from '~icons/heroicons/trash?raw'
import type { Database } from '~/types/supabase.types'
import IconPlus from '~icons/heroicons/plus?width=1em&height=1em'
import { useMainStore } from '~/stores/main'

const props = defineProps<{
  appId: string
  allowAdd?: boolean
  channelId?: number
}>()

interface ChannelUsers {
  user_id: Database['public']['Tables']['users']['Row']
}
const element: Database['public']['Tables']['channel_users']['Row'] & ChannelUsers = {} as any

const columns: Ref<TableColumn[]> = ref<TableColumn[]>([])
const displayStore = useDisplayStore()
const supabase = useSupabase()
const main = useMainStore()
const { t } = useI18n()
const router = useRouter()
const total = ref(0)
const search = ref('')
const elements = ref<Element[]>([])
const isLoading = ref(false)
const addUserModal = ref(false)
const newUser = ref<string>()
const newUserModalOpen = ref(false)
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

const addUser = async () => {
  // console.log('newUser', newUser.value)
  if (!props.channelId || !main.auth)
    return
  if (!main.canUseMore) {
    // show alert for upgrade plan and return
    displayStore.actionSheetOption = {
      header: t('limit-reached'),
      message: t('please-upgrade'),
      buttons: [
        {
          text: t('button-cancel'),
          role: 'cancel',
        },
        {
          text: t('upgrade-now'),
          id: 'confirm-button',
          handler: () => {
            router.push('/dashboard/settings/plans')
          },
        },
      ],
    }
    displayStore.showActionSheet = true
    return
  }
  // exist_user
  const exist = await existUser(newUser.value || '')
  if (!exist) {
    newUserModalOpen.value = true
    return
  }

  const { error } = await supabase
    .from('channel_users')
    .insert({
      channel_id: props.channelId,
      app_id: props.appId,
      user_id: exist,
      created_by: main.user?.id,
    })
  if (error) {
    console.error(error)
  }
  else {
    await refreshData()
    newUser.value = ''
  }
}

const inviteUser = async (userId: string) => {
  if (!props.channelId)
    return
  const { error } = await supabase
    .from('channel_users')
    .insert({
      channel_id: props.channelId,
      app_id: props.appId,
      created_by: main.user?.id,
      user_id: userId,
    })
  if (error) {
    console.error(error)
  }
  else {
    newUser.value = ''
    newUserModalOpen.value = false
    await refreshData()
  }
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
    <k-dialog
      :opened="addUserModal"
      class="text-lg"
      @backdropclick="() => (addUserModal = false)"
    >
      <template #title>
        {{ t('channel-invit') }}
      </template>
      <input v-model="newUser" type="email" placeholder="hello@yourcompany.com" class="w-full p-1 text-lg text-gray-200 rounded-lg k-input">
      <template #buttons>
        <k-dialog-button class="text-red-800" @click="() => (addUserModal = false)">
          {{ t('button-cancel') }}
        </k-dialog-button>
        <k-dialog-button @click="addUser()">
          {{ t('add') }}
        </k-dialog-button>
      </template>
    </k-dialog>
    <NewUserModal :email-address="newUser" :opened="newUserModalOpen" @close="newUserModalOpen = false" @invite-user="inviteUser" />
  </div>
</template>
