<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import {
  kBlockTitle, kDialog, kDialogButton,
  kList,
  kListButton,
  kListItem,
  kSegmented,
  kSegmentedButton,
  kToggle,
} from 'konsta/vue'
import ellipsisHorizontalCircle from '~icons/ion/ellipsis-horizontal-circle?raw'
import Spinner from '~/components/Spinner.vue'
import { existUser, useSupabase } from '~/services/supabase'
import { openVersion } from '~/services/versions'
import NewUserModal from '~/components/NewUserModal.vue'
import { formatDate } from '~/services/date'
import TitleHead from '~/components/TitleHead.vue'
import { useMainStore } from '~/stores/main'
import type { Database } from '~/types/supabase.types'
import { useDisplayStore } from '~/stores/display'
import IconSettings from '~icons/heroicons/cog-6-tooth'
import IconInformations from '~icons/heroicons/information-circle'

interface ChannelUsers {
  user_id: Database['public']['Tables']['users']['Row']
}
interface Channel {
  version: Database['public']['Tables']['app_versions']['Row']
}
const router = useRouter()
const displayStore = useDisplayStore()
const { t } = useI18n()
const route = useRoute()
const main = useMainStore()
const supabase = useSupabase()
const packageId = ref<string>('')
const id = ref<number>()
const loading = ref(true)
const channel = ref<Database['public']['Tables']['channels']['Row'] & Channel>()
const users = ref<(Database['public']['Tables']['channel_users']['Row'] & ChannelUsers)[]>()
const newUser = ref<string>()
const newUserModalOpen = ref(false)
const search = ref('')
const devices = ref<Database['public']['Tables']['channel_devices']['Row'][]>([])
const showSettings = ref(false)
const addUserModal = ref(false)

const openBundle = () => {
  if (!channel.value)
    return
  console.log('openBundle', channel.value.version.id)
  router.push(`/app/p/${route.params.p}/bundle/${channel.value.version.id}`)
}

const getUsers = async () => {
  if (!channel.value)
    return
  try {
    const { data, error } = await supabase
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
        `)
      .eq('channel_id', id.value)
      .eq('app_id', channel.value.version.app_id)
    if (error) {
      console.error('no channel users', error)
      return
    }
    users.value = data as (Database['public']['Tables']['channel_users']['Row'] & ChannelUsers)[]
  }
  catch (error) {
    console.error(error)
  }
}
const getDevices = async () => {
  if (!channel.value)
    return
  try {
    const { data: dataDevices } = await supabase
      .from('channel_devices')
      .select()
      .eq('channel_id', id.value)
      .eq('app_id', channel.value.version.app_id)
    if (dataDevices && dataDevices.length)
      devices.value = dataDevices
    else
      devices.value = []
  }
  catch (error) {
    console.error(error)
  }
}

const saveChannelChange = async (key: string, val: any) => {
  if (!id.value || !channel.value)
    return
  try {
    const update = {
      [key]: val,
    }
    const { error } = await supabase
      .from('channels')
      .update(update)
      .eq('id', id.value)
    if (error)
      console.error('no channel update', error)
  }
  catch (error) {
    console.error(error)
  }
}
const getChannel = async () => {
  if (!id.value)
    return
  try {
    const { data, error } = await supabase
      .from('channels')
      .select(`
          id,
          name,
          public,
          version (
            id,
            name,
            app_id,
            bucket_id,
            created_at
          ),
          created_at,
          allow_emulator,
          allow_dev,
          allow_device_self_set,
          disableAutoUpdateUnderNative,
          disableAutoUpdateToMajor,
          ios,
          android,
          updated_at
        `)
      .eq('id', id.value)
      .single()
    if (error) {
      console.error('no channel', error)
      return
    }
    channel.value = data as Database['public']['Tables']['channels']['Row'] & Channel
  }
  catch (error) {
    console.error(error)
  }
}
watchEffect(async () => {
  if (route.path.includes('/channel/')) {
    loading.value = true
    packageId.value = route.params.p as string
    packageId.value = packageId.value.replace(/--/g, '.')
    id.value = Number(route.params.channel as string)
    await getChannel()
    await getUsers()
    await getDevices()
    loading.value = false
  }
})

const addUser = async () => {
  // console.log('newUser', newUser.value)
  if (!channel.value || !main.auth || !id.value)
    return
  if (!main.canUseMore) {
    // show alert for upgrade plan and return
    displayStore.actionSheetOption = {
      header: t('limit-reached'),
      message: t('please-upgrade'),
      buttons: [
        {
          text: t('button.cancel'),
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
      channel_id: id.value,
      app_id: channel.value.version.app_id,
      user_id: exist,
      created_by: main.user?.id,
    })
  if (error) {
    console.error(error)
  }
  else {
    await getUsers()
    newUser.value = ''
  }
}
const makeDefault = async (val = true) => {
  displayStore.actionSheetOption = {
    header: t('account.delete_sure'),
    message: val ? t('channel.confirm-public-desc') : t('making-this-channel-'),
    buttons: [
      {
        text: val ? t('channel.make-now') : t('make-normal'),
        id: 'confirm-button',
        handler: async () => {
          if (!channel.value || !id.value)
            return
          const { error } = await supabase
            .from('channels')
            .update({ public: val })
            .eq('id', id.value)
          if (error) {
            console.error(error)
          }
          else {
            channel.value.public = val
            displayStore.messageToast.push(val ? t('defined-as-public') : t('defined-as-private'))
          }
        },
      },
      {
        text: t('button.cancel'),
        role: 'cancel',
      },
    ],
  }
  displayStore.showActionSheet = true
}
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
const deleteUser = async (usr: Database['public']['Tables']['users']['Row']) => {
  if (!channel.value || await didCancel(t('channel.user')))
    return
  const { error } = await supabase
    .from('channel_users')
    .delete()
    .eq('app_id', channel.value.version.app_id)
    .eq('user_id', usr.id)
  if (error)
    console.error(error)
  else
    await getUsers()
}

const presentActionSheet = async (usr: Database['public']['Tables']['users']['Row']) => {
  displayStore.actionSheetOption = {
    buttons: [
      {
        text: t('button.delete'),
        handler: () => {
          displayStore.showActionSheet = false
          deleteUser(usr)
        },
      },
      {
        text: t('button.cancel'),
        role: 'cancel',
        handler: () => {
          // console.log('Cancel clicked')
        },
      },
    ],
  }
  displayStore.showActionSheet = true
}

const inviteUser = async (userId: string) => {
  if (!channel.value || !id.value)
    return
  const { error } = await supabase
    .from('channel_users')
    .insert({
      channel_id: id.value,
      created_by: main.user?.id,
      app_id: channel.value?.version.app_id,
      user_id: userId,
    })
  if (error) {
    console.error(error)
  }
  else {
    newUser.value = ''
    newUserModalOpen.value = false
    await getUsers()
  }
}

const getUnknownVersion = async (): Promise<number> => {
  if (!channel.value)
    return 0
  try {
    const { data, error } = await supabase
      .from('app_versions')
      .select('id, app_id, name')
      .eq('app_id', channel.value.version.app_id)
      .eq('name', 'unknown')
      .single()
    if (error) {
      console.error('no unknow version', error)
      return 0
    }
    return data.id
  }
  catch (error) {
    console.error(error)
  }
  return 0
}

const openPannel = async () => {
  if (!channel.value || !main.auth)
    return
  displayStore.actionSheetOption = {
    buttons: [
      {
        text: t('package.unset'),
        handler: async () => {
          displayStore.showActionSheet = false
          const id = await getUnknownVersion()
          if (!id)
            return
          saveChannelChange('version', id)
        },
      },
      {
        text: t('button.cancel'),
        role: 'cancel',
        handler: () => {
          // console.log('Cancel clicked')
        },
      },
    ],
  }
  displayStore.showActionSheet = true
}
</script>

<template>
  <TitleHead :title="`${t('channel.title')} ${channel?.name}`" color="warning" :default-back="`/app/package/${route.params.p}`" :plus-icon="ellipsisHorizontalCircle" @plus-click="openPannel" />
  <div class="flex flex-col md:mx-24 pb-12  h-full p-8 overflow-y-scroll">
    <div class="">
      <div class="px-4 mx-auto w-full sm:px-6 lg:px-8 max-w-7xl">
        <div class="flex items-center justify-center">
          <div class="">
            <nav class="flex md:flex-wrap -mb-px sm:space-x-10">
              <button class="inline-flex items-center w-1/2 mt-5 text-lg font-medium text-gray-500 dark:text-gray-200 transition-all duration-200 sm:mt-0 sm:w-auto sm:border-transparent sm:border-b-2 sm:py-4 hover:text-gray-900 hover:border-gray-300 dark:hover:text-gray-500 dark:hover:border-gray-100 whitespace-nowrap group" :class="!showSettings ? 'bg-gray-200/70 dark:bg-gray-600/70 px-2 rounded-lg hover:border-0 duration-0' : ''" @click="showSettings = false">
                <IconInformations class="-ml-0.5 mr-2 text-gray-400 group-hover:text-gray-600 h-5 w-5 transition-all duration-100" />

                {{ t('channel.info') }}
              </button>

              <button class="inline-flex items-center w-1/2 mt-5 text-lg font-medium text-gray-500 dark:text-gray-200 transition-all duration-200 sm:mt-0 sm:w-auto sm:border-transparent sm:border-b-2 sm:py-4 hover:text-gray-900 hover:border-gray-300 dark:hover:text-gray-500 dark:hover:border-gray-100 whitespace-nowrap group" :class="showSettings ? 'bg-gray-200/70 dark:bg-gray-600/70 px-2 rounded-lg hover:border-0 duration-0' : ''" @click="showSettings = true">
                <IconSettings class="-ml-0.5 mr-2 text-gray-400 group-hover:text-gray-600 h-5 w-5 transition-all duration-100" />
                {{ t('channel.settings') }}
              </button>
            </nav>
          </div>
        </div>
      </div>
    </div>
    <div v-if="channel && !showSettings" id="informations" class="">
      <div class="mt-5 border-t border-gray-200">
        <dl class="sm:divide-y sm:divide-gray-200">
          <div class="py-4 flex flex-row justify-between w-full sm:py-5">
            <dt class="text-lg font-medium text-gray-700 dark:text-gray-200">
              {{ t('name') }}
            </dt>
            <dd class="mt-1 text-lg text-gray-600 dark:text-gray-200  sm:mt-0">
              {{ channel?.name }}
            </dd>
          </div>
        </dl>
      </div>
      <div class="border-t border-gray-200">
        <dl class="sm:divide-y sm:divide-gray-200">
          <div class="py-4 flex flex-row justify-between w-full sm:py-5">
            <dt class="text-lg font-medium text-gray-700 dark:text-gray-200">
              {{ t('bundle-number') }}
            </dt>
            <dd class="mt-1 text-lg text-gray-600 dark:text-gray-200  sm:mt-0">
              <button class="text-blue-700 hover:text-blue-800" @click="openBundle">
                {{ channel?.version.name }}
              </button>
            </dd>
          </div>
        </dl>
      </div>
      <div class="border-t border-gray-200">
        <dl class="sm:divide-y sm:divide-gray-200">
          <div class="py-4 flex flex-row justify-between w-full sm:py-5">
            <dt class="text-lg font-medium text-gray-700 dark:text-gray-200">
              {{ t('device.created_at') }}
            </dt>
            <dd class="mt-1 text-lg text-gray-600 dark:text-gray-200  sm:mt-0">
              {{ formatDate(channel?.created_at) }}
            </dd>
          </div>
        </dl>
      </div>
      <div class="border-t border-gray-200">
        <dl class="sm:divide-y sm:divide-gray-200">
          <div class="py-4 flex flex-row justify-between w-full sm:py-5">
            <dt class="text-lg font-medium text-gray-700 dark:text-gray-200">
              {{ t('device.last_update') }}
            </dt>
            <dd class="mt-1 text-lg text-gray-600 dark:text-gray-200  sm:mt-0">
              {{ formatDate(channel?.updated_at) }}
            </dd>
          </div>
        </dl>
      </div>
    </div>
    <div class="flex flex-col justify-center items-center w-full">
      <dl v-if="channel && showSettings" class="mt-5 border-t border-gray-200 w-full xl:w-1/2">
        <div class="py-4 flex flex-row justify-between w-full sm:py-5">
          <dt class="text-lg font-medium text-gray-700 dark:text-gray-200">
            {{ t('channel.is_public') }}
          </dt>
          <dd class="mt-1 text-lg text-gray-600 dark:text-gray-200  sm:mt-0">
            <k-toggle
              class="-my-1"
              component="div"
              :checked="channel?.public"
              @change="() => (makeDefault(!channel?.public))"
            />
          </dd>
        </div>
        <div class="py-4 flex flex-row justify-between w-full sm:py-5">
          <dt class="text-lg font-medium text-gray-700 dark:text-gray-200">
            iOS
          </dt>
          <dd class="mt-1 text-lg text-gray-600 dark:text-gray-200  sm:mt-0">
            <k-toggle
              class="-my-1"
              component="div"
              :checked="channel?.ios"
              @change="() => (saveChannelChange('ios', !channel?.ios))"
            />
          </dd>
        </div>
        <div class="py-4 flex flex-row justify-between w-full sm:py-5">
          <dt class="text-lg font-medium text-gray-700 dark:text-gray-200">
            Android
          </dt>
          <dd class="mt-1 text-lg text-gray-600 dark:text-gray-200  sm:mt-0">
            <k-toggle
              class="-my-1"
              component="div"
              :checked="channel?.android"
              @change="() => (saveChannelChange('android', !channel?.android))"
            />
          </dd>
        </div>
        <div class="py-4 flex flex-row justify-between w-full sm:py-5">
          <dt class="text-lg font-medium text-gray-700 dark:text-gray-200">
            {{ t('disable-auto-downgra') }}
          </dt>
          <dd class="mt-1 text-lg text-gray-600 dark:text-gray-200  sm:mt-0">
            <k-toggle
              class="-my-1"
              component="div"
              :checked="channel?.disableAutoUpdateUnderNative"
              @change="() => (saveChannelChange('disable_auto_downgrade', !channel?.disableAutoUpdateUnderNative))"
            />
          </dd>
        </div>
        <div class="py-4 flex flex-row justify-between w-full sm:py-5">
          <dt class="text-lg font-medium text-gray-700 dark:text-gray-200">
            {{ t('disable-auto-upgrade') }}
          </dt>
          <dd class="mt-1 text-lg text-gray-600 dark:text-gray-200  sm:mt-0">
            <k-toggle
              class="-my-1"
              component="div"
              :checked="channel?.disableAutoUpdateToMajor"
              @change="() => (saveChannelChange('disable_auto_upgrade', !channel?.disableAutoUpdateToMajor))"
            />
          </dd>
        </div>
        <div class="py-4 flex flex-row justify-between w-full sm:py-5">
          <dt class="text-lg font-medium text-gray-700 dark:text-gray-200">
            {{ t('allow-develoment-bui') }}
          </dt>
          <dd class="mt-1 text-lg text-gray-600 dark:text-gray-200  sm:mt-0">
            <k-toggle
              class="-my-1"
              component="div"
              :checked="channel?.allow_dev"
              @change="() => (saveChannelChange('allow_dev', !channel?.allow_dev))"
            />
          </dd>
        </div>
        <div class="py-4 flex flex-row justify-between w-full sm:py-5">
          <dt class="text-lg font-medium text-gray-700 dark:text-gray-200">
            {{ t('allow-emulator') }}
          </dt>
          <dd class="mt-1 text-lg text-gray-600 dark:text-gray-200  sm:mt-0">
            <k-toggle
              class="-my-1"
              component="div"
              :checked="channel?.allow_emulator"
              @change="() => (saveChannelChange('allow_emulator', !channel?.allow_emulator))"
            />
          </dd>
        </div>
        <div class="py-4 flex flex-row justify-between w-full sm:py-5">
          <dt class="text-lg font-medium text-gray-700 dark:text-gray-200">
            {{ t('allow-device-to-self') }}
          </dt>
          <dd class="mt-1 text-lg text-gray-600 dark:text-gray-200  sm:mt-0">
            <k-toggle
              class="-my-1"
              component="div"
              :checked="channel?.allow_device_self_set"
              @change="() => (saveChannelChange('allow_device_self_set', !channel?.allow_device_self_set))"
            />
          </dd>
        </div>
        <div class="py-4 flex flex-row justify-between w-full sm:py-5">
          <dt class="cursor-pointer text-lg font-medium text-red-500" @click="openPannel">
            {{ t('package.unset') }}
          </dt>
        </div>
        <div class="py-4 flex flex-row justify-between w-full sm:py-5">
          <dt class="cursor-pointer text-lg font-medium text-gray-700 dark:text-gray-200">
            {{ t('channel.users') }}
          </dt>
        </div>
        <div
          v-for="user in users"
          :key="user.id" class="py-4 pl-3 flex flex-row justify-between w-full sm:py-5" @click="presentActionSheet(user.user_id)"
        >
          <dt class="cursor-pointer text-lg font-medium text-gray-700 dark:text-gray-200">
            {{ `${user.user_id.first_name} ${user.user_id.last_name}` }}
          </dt>
        </div>
        <div class="py-4 cursor-pointer  flex flex-row w-full justify-center sm:py-5 bg-gray-200 rounded-xl" @click="addUserModal = true">
          <dt class="text-lg font-medium text-center text-gray-700">
            {{ t('channel.add') }}
          </dt>
        </div>
      </dl>
    </div>
  </div>
  <k-dialog
    :opened="addUserModal"
    class="text-lg"
    @backdropclick="() => (addUserModal = false)"
  >
    <template #title>
      {{ t('channel.invit') }}
    </template>
    <input v-model="newUser" type="email" placeholder="hello@yourcompany.com" class="k-input w-full rounded-lg text-lg text-gray-200 p-1">
    <template #buttons>
      <k-dialog-button class="text-red-800" @click="() => (addUserModal = false)">
        {{ t('button.cancel') }}
      </k-dialog-button>
      <k-dialog-button @click="() => (addUser())">
        {{ t('channel.add') }}
      </k-dialog-button>
    </template>
  </k-dialog>
  <NewUserModal :email-address="newUser" :opened="newUserModalOpen" @close="newUserModalOpen = false" @invite-user="inviteUser" />
</template>
