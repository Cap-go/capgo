<script setup lang="ts">
import { ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import {
  kList, kListItem,
  kToggle,
} from 'konsta/vue'
import { useSupabase } from '~/services/supabase'
import { formatDate } from '~/services/date'
import { useMainStore } from '~/stores/main'
import type { Database } from '~/types/supabase.types'
import { useDisplayStore } from '~/stores/display'
import IconSettings from '~icons/heroicons/cog-6-tooth'
import IconInformations from '~icons/heroicons/information-circle'
import IconUsers from '~icons/heroicons/users-solid'
import IconDevice from '~icons/heroicons/device-phone-mobile'
import type { Tab } from '~/components/comp_def'
import { urlToAppId } from '~/services/conversion'

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
const id = ref<number>(0)
const loading = ref(true)
const deviceIds = ref<string[]>([])
const channel = ref<Database['public']['Tables']['channels']['Row'] & Channel>()
const ActiveTab = ref('info')

const tabs: Tab[] = [
  {
    label: t('info'),
    icon: IconInformations,
    key: 'info',
  },
  {
    label: t('users'),
    icon: IconUsers,
    key: 'users',
  },
  {
    label: t('devices'),
    icon: IconDevice,
    key: 'devices',
  },
  {
    label: t('settings'),
    icon: IconSettings,
    key: 'settings',
  },
]
const openBundle = () => {
  if (!channel.value)
    return
  console.log('openBundle', channel.value.version.id)
  router.push(`/app/p/${route.params.p}/bundle/${channel.value.version.id}`)
}

const getDeviceIds = async () => {
  if (!channel.value)
    return
  try {
    const { data: dataDevices } = await supabase
      .from('channel_devices')
      .select('device_id')
      .eq('channel_id', id.value)
      .eq('app_id', channel.value.version.app_id)
    if (dataDevices && dataDevices.length)
      deviceIds.value = dataDevices.map(d => d.device_id)
    else
      deviceIds.value = []
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

const reload = async () => {
  await getChannel()
  await getDeviceIds()
}

const saveChannelChange = async (key: string, val: any) => {
  console.log('saveChannelChange', key, val)
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
    reload()
    if (error)
      console.error('no channel update', error)
  }
  catch (error) {
    console.error(error)
  }
}

watchEffect(async () => {
  if (route.path.includes('/channel/')) {
    loading.value = true
    packageId.value = route.params.p as string
    packageId.value = urlToAppId(packageId.value)
    id.value = Number(route.params.channel as string)
    await getChannel()
    await getDeviceIds()
    loading.value = false
    displayStore.NavTitle = t('channel')
    displayStore.defaultBack = `/app/package/${route.params.p}/channels`
  }
})

const makeDefault = async (val = true) => {
  displayStore.actionSheetOption = {
    header: t('are-u-sure'),
    message: val ? t('confirm-public-desc') : t('making-this-channel-'),
    buttons: [
      {
        text: val ? t('channel-make-now') : t('make-normal'),
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
        text: t('button-cancel'),
        role: 'cancel',
      },
    ],
  }
  displayStore.showActionSheet = true
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
        text: t('unlink-bundle'),
        handler: async () => {
          displayStore.showActionSheet = false
          const id = await getUnknownVersion()
          if (!id)
            return
          saveChannelChange('version', id)
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
</script>

<template>
  <div>
    <Tabs v-model:active-tab="ActiveTab" :tabs="tabs" />
    <div v-if="channel && ActiveTab === 'info'" class="flex flex-col">
      <div class="flex flex-col overflow-y-scroll shadow-lg md:mx-auto md:border md:rounded-lg md:mt-5 md:w-2/3 border-slate-200 dark:bg-gray-800 dark:border-slate-900">
        <dl class="divide-y divide-gray-500">
          <InfoRow :label="t('name')" :value="channel.name" />
          <!-- Bundle Number -->
          <InfoRow :label="t('bundle-number')" :value="channel.version.name" :is-link="true" @click="openBundle" />
          <!-- Created At -->
          <InfoRow :label="t('created-at')" :value="formatDate(channel.created_at)" />
          <!-- Last Update -->
          <InfoRow :label="t('last-update')" :value="formatDate(channel.updated_at)" />
        </dl>
      </div>
    </div>
    <div v-if="channel && ActiveTab === 'settings'" class="flex flex-col">
      <div class="flex flex-col overflow-y-scroll shadow-lg md:mx-auto md:border md:rounded-lg md:mt-5 md:w-2/3 border-slate-200 dark:bg-gray-800 dark:border-slate-900">
        <dl class="divide-y divide-gray-500">
          <k-list class="w-full mt-5 list-none border-t border-gray-200">
            <k-list-item label :title="t('channel-is-public')" class="text-lg font-medium text-gray-700 dark:text-gray-200">
              <template #after>
                <k-toggle
                  class="-my-1 k-color-success"
                  component="div"
                  :checked="channel?.public"
                  @change="() => (makeDefault(!channel?.public))"
                />
              </template>
            </k-list-item>
            <k-list-item label title="iOS" class="text-lg font-medium text-gray-700 dark:text-gray-200">
              <template #after>
                <k-toggle
                  class="-my-1 k-color-success"
                  component="div"
                  :checked="channel?.ios"
                  @change="saveChannelChange('ios', !channel?.ios)"
                />
              </template>
            </k-list-item>
            <k-list-item label title="Android" class="text-lg font-medium text-gray-700 dark:text-gray-200">
              <template #after>
                <k-toggle
                  class="-my-1 k-color-success"
                  component="div"
                  :checked="channel?.android"
                  @change="saveChannelChange('android', !channel?.android)"
                />
              </template>
            </k-list-item>
            <k-list-item label :title="t('disable-auto-downgra')" class="text-lg font-medium text-gray-700 dark:text-gray-200">
              <template #after>
                <k-toggle
                  class="-my-1 k-color-success"
                  component="div"
                  :checked="channel?.disableAutoUpdateUnderNative"
                  @change="saveChannelChange('disable_auto_downgrade', !channel?.disableAutoUpdateUnderNative)"
                />
              </template>
            </k-list-item>
            <k-list-item label :title="t('disable-auto-upgrade')" class="text-lg font-medium text-gray-700 dark:text-gray-200">
              <template #after>
                <k-toggle
                  class="-my-1 k-color-success"
                  component="div"
                  :checked="channel?.disableAutoUpdateToMajor"
                  @change="saveChannelChange('disable_auto_upgrade', !channel?.disableAutoUpdateToMajor)"
                />
              </template>
            </k-list-item>
            <k-list-item label :title="t('allow-develoment-bui')" class="text-lg font-medium text-gray-700 dark:text-gray-200">
              <template #after>
                <k-toggle
                  class="-my-1 k-color-success"
                  component="div"
                  :checked="channel?.allow_dev"
                  @change="saveChannelChange('allow_dev', !channel?.allow_dev)"
                />
              </template>
            </k-list-item>
            <k-list-item label :title="t('allow-emulator')" class="text-xl font-medium text-gray-700 dark:text-gray-200">
              <template #after>
                <k-toggle
                  class="-my-1 k-color-success"
                  component="div"
                  :checked="channel?.allow_emulator"
                  @change="saveChannelChange('allow_emulator', !channel?.allow_emulator)"
                />
              </template>
            </k-list-item>
            <k-list-item label :title="t('allow-device-to-self')" class="text-lg font-medium text-gray-700 dark:text-gray-200">
              <template #after>
                <k-toggle
                  class="-my-1 k-color-success"
                  component="div"
                  :checked="channel?.allow_device_self_set"
                  @change="saveChannelChange('allow_device_self_set', !channel?.allow_device_self_set)"
                />
              </template>
            </k-list-item>
            <k-list-item label :title="t('unlink-bundle')" class="text-lg font-medium text-red-500" link @click="openPannel" />
          </k-list>
        </dl>
      </div>
    </div>
    <div v-if="channel && ActiveTab === 'users'" class="flex flex-col">
      <div class="flex flex-col overflow-y-scroll shadow-lg md:mx-auto md:border md:rounded-lg md:mt-5 md:w-2/3 border-slate-200 dark:bg-gray-800 dark:border-slate-900">
        <SharedUserTable allow-add class="p-3" :app-id="channel.version.app_id" :channel-id="id" />
      </div>
    </div>
    <div v-if="channel && ActiveTab === 'devices'" class="flex flex-col">
      <div class="flex flex-col overflow-y-scroll shadow-lg md:mx-auto md:border md:rounded-lg md:mt-5 md:w-2/3 border-slate-200 dark:bg-gray-800 dark:border-slate-900">
        <DeviceTable class="p-3" :app-id="channel.version.app_id" :channel-id="id" :ids="deviceIds" />
      </div>
    </div>
  </div>
</template>
