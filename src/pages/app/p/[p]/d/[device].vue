<script setup lang="ts">
import { ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { gt } from 'semver'
import { formatDate } from '~/services/date'
import { useSupabase } from '~/services/supabase'
import type { Database } from '~/types/supabase.types'
import { useMainStore } from '~/stores/main'
import { useDisplayStore } from '~/stores/display'
import IconLog from '~icons/heroicons/document'
import IconInformations from '~icons/heroicons/information-circle'
import type { Tab } from '~/components/comp_def'
import { urlToAppId } from '~/services/conversion'

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
    label: t('info'),
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
    const { data } = await supabase
      .from('app_versions')
      .select()
      .eq('app_id', packageId.value)
      .eq('deleted', false)
      .order('created_at', { ascending: false })
      .throwOnError()
    versions.value = data || versions.value
  }
  catch (_e) {
    versions.value = []
  }
}
const getChannels = async () => {
  try {
    const { data } = await supabase
      .from('channels')
      .select(`
        id,
        name,
        created_at,
        updated_at
      `)
      .eq('app_id', packageId.value)
      .throwOnError()
    channels.value = (data || []) as (Database['public']['Tables']['channels']['Row'] & Channel)[]
  }
  catch (_e) {
    channels.value = []
  }
}

const getChannelOverride = async () => {
  try {
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
      .throwOnError()
    if (error) {
      console.error('getChannelOverride', error)
      return
    }
    channelDevice.value = (data || undefined) as Database['public']['Tables']['channel_devices']['Row'] & ChannelDev
  }
  catch (_e) {
    channelDevice.value = undefined
  }
}
const getDeviceOverride = async () => {
  try {
    const { data } = await supabase
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
      .throwOnError()
    deviceOverride.value = (data || undefined) as Database['public']['Tables']['devices_override']['Row'] & Device
  }
  catch (_e) {
    deviceOverride.value = undefined
  }
}
const getDevice = async () => {
  if (!id.value)
    return
  try {
    const { data } = await supabase
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
      .throwOnError()
    device.value = data as Database['public']['Tables']['devices']['Row'] & Device
    // console.log('device', device.value)
  }
  catch (error) {
    console.error('no devices', error)
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
    header: t('alert-confirm-delete'),
    message: `${t('alert-delete-message')} ${name} ${t('from-device')} ?`,
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
  toast.error(t('custom-id-saved'))
}

const delDevVersion = async (device: string) => {
  if (await didCancel(t('device')))
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
      text: t('button-remove'),
      handler: async () => {
        device.value?.device_id && await delDevVersion(device.value?.device_id)
        toast.error(t('unlink-version'))
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
          toast.error(t('version-linked'))
          await loadData()
        }
        catch (error) {
          console.error(error)
          toast.error(t('channel-link-fail'))
        }
        isLoading.value = false
      },
    })
  }
  buttons.push({
    text: t('button-cancel'),
    role: 'cancel',
    handler: () => {
      // console.log('Cancel clicked')
    },
  })
  displayStore.actionSheetOption = {
    header: t('version-linking'),
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
  if (await didCancel(t('channel')))
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
      text: t('button-remove'),
      handler: async () => {
        device.value?.device_id && await delDevChannel(device.value?.device_id)
        toast.error(t('unlink-channel'))
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
          toast.error(t('channel-linked'))
          await loadData()
        }
        catch (error) {
          console.error(error)
          toast.error(t('channel-link-fail'))
        }
        isLoading.value = false
      },
    })
  }
  buttons.push({
    text: t('button-cancel'),
    role: 'cancel',
    handler: () => {
      // console.log('Cancel clicked')
    },
  })
  displayStore.actionSheetOption = {
    header: t('channel-linking'),
    buttons,
  }
  displayStore.showActionSheet = true
}

watchEffect(async () => {
  if (route.path.includes('/d/')) {
    packageId.value = route.params.p as string
    packageId.value = urlToAppId(packageId.value)
    id.value = route.params.device as string
    await loadData()
    displayStore.NavTitle = t('device')
    displayStore.defaultBack = `/app/package/${route.params.p}/devices`
  }
})
</script>

<template>
  <div v-if="device" class="h-full overflow-y-scroll md:py-4">
    <Tabs v-model:active-tab="ActiveTab" :tabs="tabs" />
    <div v-if="ActiveTab === 'info'" id="devices" class="flex flex-col">
      <div class="flex flex-col overflow-y-scroll shadow-lg md:mx-auto md:border md:rounded-lg md:mt-5 md:w-2/3 border-slate-200 dark:bg-gray-800 dark:border-slate-900">
        <dl class="divide-y divide-gray-500">
          <InfoRow :label="t('device-id')" :value="device.device_id" />
          <InfoRow v-if="device" v-model:value="device.custom_id" editable :label="t('custom-id')" @update:value="saveCustomId" />
          <InfoRow v-if="device.created_at" :label="t('created-at')" :value="formatDate(device.created_at)" />
          <InfoRow v-if="device.updated_at" :label="t('last-update')" :value="formatDate(device.updated_at)" />
          <InfoRow v-if="device.platform" :label="t('platform')" :value="device.platform" />
          <InfoRow v-if="device.plugin_version" :label="t('plugin-version')" :value="device.plugin_version" />
          <InfoRow v-if="device.version.name" :label="t('version')" :value="device.version.name" />
          <InfoRow v-if="device.version_build" :label="t('version-builtin')" :value="device.version_build" />
          <InfoRow v-if="device.os_version" :label="t('os-version')" :value="device.os_version" />
          <InfoRow v-if="minVersion(device.plugin_version) && device.is_emulator" :label="t('is-production-app')" :value="device.is_emulator?.toString()" />
          <InfoRow v-if="minVersion(device.plugin_version) && device.is_prod" :label="t('is-production-app')" :value="device.is_prod?.toString()" />
          <InfoRow :label="t('force-version')" :value="deviceOverride?.version?.name || t('no-version-linked')" :is-link="true" @click="updateOverride()" />
          <InfoRow :label="t('channel-link')" :value="channelDevice?.channel_id.name || t('no-channel-linked') " :is-link="true" @click="updateChannel()" />
        </dl>
      </div>
    </div>
    <div v-else-if="ActiveTab === 'logs'" id="devices" class="h-full overflow-y-scroll md:py-4">
      <div class="flex flex-col mx-auto overflow-y-scroll shadow-lg md:border md:rounded-lg md:mt-5 md:w-2/3 border-slate-200 dark:bg-gray-800 dark:border-slate-900">
        <LogTable
          class="p-3"
          :device-id="id"
          :app-id="packageId"
        />
      </div>
    </div>
  </div>
</template>
