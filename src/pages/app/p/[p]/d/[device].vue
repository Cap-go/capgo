<script setup lang="ts">
import { ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { gt } from 'semver'
import { formatDate } from '~/services/date'
import { useSupabase } from '~/services/supabase'
import TitleHead from '~/components/TitleHead.vue'
import type { Database } from '~/types/supabase.types'
import { useMainStore } from '~/stores/main'
import { useDisplayStore } from '~/stores/display'
import IconLog from '~icons/heroicons/document'
import IconInformations from '~icons/heroicons/information-circle'
import type { Tab } from '~/components/comp_def'

interface Device {
  version: Database['public']['Tables']['app_versions']['Row']
}
interface Channel {
  version: Database['public']['Tables']['app_versions']['Row']
}
interface ChannelDev {
  channel_id: Database['public']['Tables']['channels']['Row'] & Channel
}

interface Stat {
  version: {
    name: string
  }
}
const displayStore = useDisplayStore()
const { t } = useI18n()
const main = useMainStore()
const route = useRoute()
const supabase = useSupabase()
const packageId = ref<string>('')
const id = ref<string>()
const isLoading = ref(true)
const ActiveTab = ref('info')

const device = ref<Database['public']['Tables']['devices']['Row'] & Device>()
const logs = ref<(Database['public']['Tables']['stats']['Row'] & Stat)[]>([])
const deviceOverride = ref<Database['public']['Tables']['devices_override']['Row'] & Device>()
const channels = ref<(Database['public']['Tables']['channels']['Row'] & Channel)[]>([])
const versions = ref<Database['public']['Tables']['app_versions']['Row'][]>([])
const channelDevice = ref<Database['public']['Tables']['channel_devices']['Row'] & ChannelDev>()

const tabs: Tab[] = [
  {
    label: t('channel.info'),
    icon: IconInformations,
    key: 'info',
  },
  {
    label: t('logs'),
    icon: IconLog,
    key: 'logs',
  },
]

const getVersion = async () => {
  try {
    const { data, error } = await supabase
      .from('app_versions')
      .select()
      .eq('app_id', packageId.value)
      .eq('deleted', false)
      .order('created_at', { ascending: false })
    if (error) {
      console.error('getVersion', error)
      return
    }
    versions.value = data || versions.value
  }
  catch (error) {
    console.error(error)
  }
}
const getChannels = async () => {
  try {
    const { data, error } = await supabase
      .from('channels')
      .select(`
        id,
        name,
        created_at,
        updated_at
      `)
      .eq('app_id', packageId.value)
    if (error) {
      console.error('getChannels', error)
      return
    }
    channels.value = (data || []) as (Database['public']['Tables']['channels']['Row'] & Channel)[]
  }
  catch (error) {
    console.error(error)
  }
}

const getChannelOverride = async () => {
  const { data, error } = await supabase
    .from('channel_devices')
    .select(`
      device_id,
      app_id,
      channel_id (
        name,
        version (
          name
        )
      ),
      created_at,
      updated_at
    `)
    .eq('app_id', packageId.value)
    .eq('device_id', id.value)
    .single()
  if (error) {
    console.error('getChannelOverride', error)
    return
  }
  channelDevice.value = (data || undefined) as Database['public']['Tables']['channel_devices']['Row'] & ChannelDev
}
const getDeviceOverride = async () => {
  const { data, error } = await supabase
    .from('devices_override')
    .select(`
      device_id,
      app_id,
      version (
          name
      ),
      created_at,
      updated_at
    `)
    .eq('app_id', packageId.value)
    .eq('device_id', id.value)
    .single()
  if (error) {
    console.error('getDeviceOverride', error)
    return
  }
  deviceOverride.value = (data || undefined) as Database['public']['Tables']['devices_override']['Row'] & Device
}
const getDevice = async () => {
  if (!id.value)
    return
  try {
    const { data, error } = await supabase
      .from('devices')
      .select(`
          device_id,
          app_id,
          platform,
          os_version,
          custom_id,
          version (
            name,
            app_id,
            bucket_id,
            created_at
          ),
          is_prod,
          is_emulator,
          version_build,
          created_at,
          plugin_version,
          updated_at
        `)
      .eq('device_id', id.value)
      .single()
    if (data && !error)
      device.value = data as Database['public']['Tables']['devices']['Row'] & Device
    else
      console.error('no devices', error)
    // console.log('device', device.value)
  }
  catch (error) {
    console.error(error)
  }
}

const minVersion = (val: string, min = '4.6.99') => {
  return gt(val, min)
}

const loadData = async () => {
  isLoading.value = true
  logs.value = []
  await Promise.all([
    getDevice(),
    getDeviceOverride(),
    getChannelOverride(),
    getChannels(),
    getVersion(),
  ])
  isLoading.value = false
}

const upsertDevVersion = async (device: string, v: Database['public']['Tables']['app_versions']['Row']) => {
  return supabase
    .from('devices_override')
    .upsert({
      device_id: device,
      version: v.id,
      app_id: packageId.value,
      created_by: main.user?.id,
    })
}
const didCancel = async (name: string) => {
  displayStore.dialogOption = {
    header: t('alert.confirm-delete'),
    message: `${t('alert.delete-message')} ${name} ${t('from-device')} ?`,
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

const saveCustomId = async () => {
  console.log('saveCustomId', device.value?.custom_id)
  if (!device.value?.device_id)
    return
  await supabase
    .from('devices')
    .update({
      custom_id: device.value?.custom_id,
    })
    .eq('device_id', id.value)
  displayStore.messageToast.push(t('custom-id-saved'))
}

const delDevVersion = async (device: string) => {
  if (await didCancel(t('channel.device')))
    return
  return supabase
    .from('devices_override')
    .delete()
    .eq('device_id', device)
    .eq('app_id', packageId.value)
}
const updateOverride = async () => {
  const buttons = []
  if (deviceOverride.value) {
    buttons.push({
      text: t('button.remove'),
      handler: async () => {
        device.value?.device_id && delDevVersion(device.value?.device_id)
        displayStore.messageToast.push(t('device.unlink_version'))
        await loadData()
      },
    })
  }
  for (const version of versions.value) {
    buttons.push({
      text: version.name,
      handler: async () => {
        if (!device.value?.device_id)
          return
        isLoading.value = true
        try {
          await upsertDevVersion(device.value?.device_id, version)
          displayStore.messageToast.push(t('device.link_version'))
          await loadData()
        }
        catch (error) {
          console.error(error)
          displayStore.messageToast.push(t('device.link_fail'))
        }
        isLoading.value = false
      },
    })
  }
  buttons.push({
    text: t('button.cancel'),
    role: 'cancel',
    handler: () => {
      // console.log('Cancel clicked')
    },
  })
  displayStore.actionSheetOption = {
    header: t('package.link_version'),
    buttons,
  }
  displayStore.showActionSheet = true
}
const upsertDevChannel = async (device: string, channel: Database['public']['Tables']['channels']['Row']) => {
  if (!main?.user?.id)
    return
  return supabase
    .from('channel_devices')
    .upsert({
      device_id: device,
      channel_id: channel.id,
      app_id: packageId.value,
      created_by: main.user.id,
    })
}
const delDevChannel = async (device: string) => {
  if (await didCancel(t('channel.title')))
    return
  return supabase
    .from('channel_devices')
    .delete()
    .eq('device_id', device)
    .eq('app_id', packageId.value)
}

const updateChannel = async () => {
  const buttons = []
  if (channelDevice.value) {
    buttons.push({
      text: t('button.remove'),
      handler: async () => {
        device.value?.device_id && delDevChannel(device.value?.device_id)
        displayStore.messageToast.push(t('device.unlink_channel'))
        await loadData()
      },
    })
  }
  for (const channel of channels.value) {
    buttons.push({
      text: channel.name,
      handler: async () => {
        if (!device.value?.device_id)
          return
        isLoading.value = true
        try {
          await upsertDevChannel(device.value?.device_id, channel)
          displayStore.messageToast.push(t('device.link_channel'))
          await loadData()
        }
        catch (error) {
          console.error(error)
          displayStore.messageToast.push(t('device.link_fail'))
        }
        isLoading.value = false
      },
    })
  }
  buttons.push({
    text: t('button.cancel'),
    role: 'cancel',
    handler: () => {
      // console.log('Cancel clicked')
    },
  })
  displayStore.actionSheetOption = {
    header: t('package.link_channel'),
    buttons,
  }
  displayStore.showActionSheet = true
}

watchEffect(async () => {
  if (route.path.includes('/d/')) {
    packageId.value = route.params.p as string
    packageId.value = packageId.value.replace(/--/g, '.')
    id.value = route.params.device as string
    await loadData()
  }
})
</script>

<template>
  <div>
    <TitleHead :title="t('device.title')" :default-back="`/app/package/${route.params.p}/devices`" />
    <div v-if="device" class="h-full overflow-y-scroll md:py-4">
      <Tabs v-model:active-tab="ActiveTab" :tabs="tabs" />
      <div v-if="ActiveTab === 'info'" id="devices" class="flex flex-col">
        <div class="flex flex-col overflow-y-scroll shadow-lg md:mx-auto md:border md:rounded-lg md:mt-5 md:w-2/3 border-slate-200 dark:bg-gray-800 dark:border-slate-900">
          <dl class="divide-y divide-gray-500">
            <InfoRow :label="t('device-id')" :value="device.device_id" />
            <InfoRow v-if="device" v-model:value="device.custom_id" editable :label="t('custom-id')" @update:value="saveCustomId" />
            <InfoRow v-if="device.created_at" :label="t('device.created_at')" :value="formatDate(device.created_at)" />
            <InfoRow v-if="device.updated_at" :label="t('device.last_update')" :value="formatDate(device.updated_at)" />
            <InfoRow v-if="device.platform" :label="t('device.platform')" :value="device.platform" />
            <InfoRow v-if="device.plugin_version" :label="t('device.plugin_version')" :value="device.plugin_version" />
            <InfoRow v-if="device.version.name" :label="t('device.version')" :value="device.version.name" />
            <InfoRow v-if="device.version_build" :label="t('version-builtin')" :value="device.version_build" />
            <InfoRow v-if="device.os_version" :label="t('device.os_version')" :value="device.os_version" />
            <InfoRow v-if="minVersion(device.plugin_version) && device.os_version" :label="t('is-emulator')" :value="device.os_version?.toString()" />
            <InfoRow v-if="minVersion(device.plugin_version) && device.is_emulator" :label="t('is-production-app')" :value="device.is_emulator?.toString()" />
            <InfoRow v-if="minVersion(device.plugin_version) && device.is_prod" :label="t('is-production-app')" :value="device.is_prod?.toString()" />
            <InfoRow :label="t('device.force_version')" :value="deviceOverride?.version?.name || t('device.no_override')" :is-link="true" @click="updateOverride()" />
            <InfoRow :label="t('device.channel')" :value="channelDevice?.channel_id.name || t('device.no_channel') " :is-link="true" @click="updateChannel()" />
          </dl>
        </div>
      </div>
      <div v-else-if="ActiveTab === 'logs'" id="devices" class="flex flex-col">
        <div class="flex flex-col mx-auto overflow-y-scroll shadow-lg md:border md:rounded-lg md:mt-5 md:w-2/3 border-slate-200 dark:bg-gray-800 dark:border-slate-900">
          <LogTable
            class="p-3"
            :device-id="id"
            :app-id="packageId"
          />
        </div>
      </div>
    </div>
  </div>
</template>
