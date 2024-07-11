<script setup lang="ts">
import { ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { gt } from 'semver'
import { toast } from 'vue-sonner'
import ky from 'ky'
import { formatDate } from '~/services/date'
import { EMPTY_UUID, defaultApiHost, useSupabase } from '~/services/supabase'
import type { Database } from '~/types/supabase.types'
import { useMainStore } from '~/stores/main'
import { useDisplayStore } from '~/stores/display'
import IconLog from '~icons/heroicons/document'
import IconInformations from '~icons/heroicons/information-circle'
import type { Tab } from '~/components/comp_def'
import { appIdToUrl, urlToAppId } from '~/services/conversion'
import type { OrganizationRole } from '~/stores/organization'
import { useOrganizationStore } from '~/stores/organization'

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
const router = useRouter()
const route = useRoute()
const supabase = useSupabase()
const packageId = ref<string>('')
const id = ref<string>()
const isLoading = ref(true)
const ActiveTab = ref('info')
const organizationStore = useOrganizationStore()

const device = ref<Database['public']['Tables']['devices']['Row'] & Device>()
const logs = ref<(Database['public']['Tables']['stats']['Row'] & Stat)[]>([])
const deviceOverride = ref<Database['public']['Tables']['devices_override']['Row'] & Device>()
const channels = ref<(Database['public']['Tables']['channels']['Row'] & Channel)[]>([])
const versions = ref<Database['public']['Tables']['app_versions']['Row'][]>([])
const channelDevice = ref<Database['public']['Tables']['channel_devices']['Row'] & ChannelDev>()
const role = ref<OrganizationRole | null>(null)
const reloadCount = ref(0)

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

async function getVersion() {
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
  catch (error) {
    console.error(error)
    versions.value = []
  }
}
async function getChannels() {
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
  catch (error) {
    console.error(error)
    channels.value = []
  }
}

async function getChannelOverride() {
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
      .eq('device_id', id.value!)
      .single()
      .throwOnError()
    if (error) {
      console.error('getChannelOverride', error)
      return
    }
    channelDevice.value = (data || undefined) as Database['public']['Tables']['channel_devices']['Row'] & ChannelDev
  }
  catch (error) {
    console.error(error)
    channelDevice.value = undefined
  }
}
async function getDeviceOverride() {
  try {
    const { data } = await supabase
      .from('devices_override')
      .select(`
      device_id,
      app_id,
      version,
      created_at,
      updated_at
    `)
      .eq('app_id', packageId.value)
      .eq('device_id', id.value!)
      .single()
      .throwOnError()

    const { data: dataVersion } = await supabase
      .from('app_versions')
      .select(`
          name
      `)
      .eq('id', data!.version)
      .single()

    const overwriteVersion = (data || undefined) as Database['public']['Tables']['devices_override']['Row'] & Device
    if (dataVersion)
      overwriteVersion.version = dataVersion! as any as typeof overwriteVersion.version
    deviceOverride.value = overwriteVersion
  }
  catch (error) {
    console.error(error)
    deviceOverride.value = undefined
  }
}
async function getDevice() {
  if (!id.value)
    return
  try {
    const { data: currentSession } = await supabase.auth.getSession()!
    if (!currentSession.session)
      return
    const currentJwt = currentSession.session.access_token
    const dataD = await ky
      .post(`${defaultApiHost}/private/devices`, {
        headers: {
          'Content-Type': 'application/json',
          'authorization': `Bearer ${currentJwt}` || '',
        },
        body: JSON.stringify({
          appId: packageId.value,
          deviceIds: [id.value],
        }),
      })
      .then(res => res.json<Database['public']['Tables']['devices']['Row'][]>())
      .catch((err) => {
        console.log('Cannot get device', err)
        return [] as Database['public']['Tables']['devices']['Row'][]
      })

    const data = dataD[0]
    const { data: dataVersion } = await supabase
      .from('app_versions')
      .select(`
          name
      `)
      .eq('id', data!.version)
      .single()

    const deviceValue = data as Database['public']['Tables']['devices']['Row'] & Device
    if (dataVersion)
      deviceValue.version = dataVersion! as any as typeof deviceValue.version
    device.value = deviceValue
    // console.log('device', device.value)
  }
  catch (error) {
    console.error('no devices', error)
  }
}

async function getOrgRole() {
  await organizationStore.awaitInitialLoad()
  role.value = await organizationStore.getCurrentRoleForApp(packageId.value)
}

function minVersion(val: string, min = '4.6.99') {
  return gt(val, min)
}

async function loadData() {
  isLoading.value = true
  logs.value = []
  await Promise.all([
    getDevice(),
    getDeviceOverride(),
    getChannelOverride(),
    getChannels(),
    getVersion(),
    getOrgRole(),
  ])
  reloadCount.value += 1
  isLoading.value = false
}

async function upsertDevVersion(device: string, v: Database['public']['Tables']['app_versions']['Row']) {
  return supabase
    .from('devices_override')
    .upsert({
      device_id: device,
      version: v.id,
      app_id: packageId.value,
      owner_org: EMPTY_UUID,
    })
}
async function didCancel(name: string) {
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

async function delDevVersion(device: string) {
  if (await didCancel(t('device')))
    return
  return supabase
    .from('devices_override')
    .delete()
    .eq('device_id', device)
    .eq('app_id', packageId.value)
}
async function updateOverride() {
  const hasPerm = organizationStore.hasPermisisonsInRole(role.value, ['admin', 'super_admin', 'write'])

  if (!hasPerm) {
    toast.error(t('no-permission'))
    return
  }

  const buttons = []
  if (deviceOverride.value) {
    buttons.push({
      text: t('button-remove'),
      handler: async () => {
        if (device.value?.device_id)
          await delDevVersion(device.value?.device_id)
        toast.success(t('unlink-version'))
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
          toast.success(t('version-linked'))
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
  displayStore.dialogOption = {
    header: t('version-linking'),
    buttons,
  }
  displayStore.showDialog = true
  return displayStore.onDialogDismiss()
}
async function upsertDevChannel(device: string, channel: Database['public']['Tables']['channels']['Row']) {
  if (!main?.user?.id)
    return
  return supabase
    .from('channel_devices')
    .upsert({
      device_id: device,
      channel_id: channel.id,
      app_id: packageId.value,
      owner_org: EMPTY_UUID,
    })
}
async function delDevChannel(device: string) {
  if (await didCancel(t('channel')))
    return
  return supabase
    .from('channel_devices')
    .delete()
    .eq('device_id', device)
    .eq('app_id', packageId.value)
}

async function updateChannel() {
  const buttons = []
  const hasPerm = organizationStore.hasPermisisonsInRole(role.value, ['admin', 'super_admin', 'write'])

  if (!hasPerm && !channelDevice.value) {
    toast.error(t('no-permission'))
    return
  }

  if (channelDevice.value) {
    if (hasPerm) {
      buttons.push({
        text: t('button-remove'),
        handler: async () => {
          if (device.value?.device_id)
            await delDevChannel(device.value?.device_id)
          toast.success(t('unlink-channel'))
          await loadData()
        },
      })
    }

    buttons.push({
      text: t('open-channel'),
      handler: async () => {
        if (device.value?.device_id)
          router.push(`/app/p/${appIdToUrl(device.value?.device_id)}/channel/${channelDevice.value?.channel_id}`)
      },
    })
  }

  if (hasPerm) {
    for (const channel of channels.value) {
      buttons.push({
        text: channel.name,
        handler: async () => {
          if (!device.value?.device_id)
            return
          isLoading.value = true
          try {
            await upsertDevChannel(device.value?.device_id, channel)
            toast.success(t('channel-linked'))
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
  }

  buttons.push({
    text: t('button-cancel'),
    role: 'cancel',
    handler: () => {
      // console.log('Cancel clicked')
    },
  })
  displayStore.dialogOption = {
    header: t('channel-linking'),
    buttons,
  }
  displayStore.showDialog = true
  return displayStore.onDialogDismiss()
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
  <div v-if="device" class="h-full md:py-4">
    <Tabs v-model:active-tab="ActiveTab" :tabs="tabs" />
    <div v-if="ActiveTab === 'info'" id="devices" class="flex flex-col">
      <div class="flex flex-col overflow-y-auto bg-white shadow-lg border-slate-200 md:mx-auto md:mt-5 md:w-2/3 md:border dark:border-slate-900 md:rounded-lg dark:bg-gray-800">
        <dl :key="reloadCount" class="divide-y divide-gray-500">
          <InfoRow :label="t('device-id')" :value="device.device_id" />
          <InfoRow v-if="device.custom_id" :label="t('custom-id')" :value="device.custom_id" />
          <InfoRow v-if="device.created_at" :label="t('created-at')" :value="formatDate(device.created_at)" />
          <InfoRow v-if="device.updated_at" :label="t('last-update')" :value="formatDate(device.updated_at)" />
          <InfoRow v-if="device.platform" :label="t('platform')" :value="device.platform" />
          <InfoRow v-if="device.plugin_version" :label="t('plugin-version')" :value="device.plugin_version" />
          <InfoRow v-if="device.version.name" :label="t('version')" :value="device.version.name" />
          <InfoRow v-if="device.version_build" :label="t('version-builtin')" :value="device.version_build" />
          <InfoRow v-if="device.os_version" :label="t('os-version')" :value="device.os_version" />
          <InfoRow v-if="minVersion(device.plugin_version) && device.is_emulator" :label="t('is-emulator')" :value="device.is_emulator?.toString()" />
          <InfoRow v-if="minVersion(device.plugin_version) && device.is_prod" :label="t('is-production-app')" :value="device.is_prod?.toString()" />
          <InfoRow id="update-version" :label="t('force-version')" :value="deviceOverride?.version?.name || t(organizationStore.hasPermisisonsInRole(role, ['admin', 'super_admin', 'write']) ? 'no-version-linked' : 'no-version-linked-no-perm')" :is-link="true" @click="updateOverride()" />
          <InfoRow id="update-channel" :label="t('channel-link')" :value="channelDevice?.channel_id.name || t(organizationStore.hasPermisisonsInRole(role, ['admin', 'super_admin', 'write']) ? 'no-channel-linked' : 'no-channel-linked-no-perm')" :is-link="true" @click="updateChannel()" />
        </dl>
      </div>
    </div>
    <div v-else-if="ActiveTab === 'logs'" id="devices" class="h-full md:py-4">
      <div class="flex flex-col mx-auto overflow-y-auto bg-white shadow-lg border-slate-200 md:mt-5 md:w-2/3 md:border dark:border-slate-900 md:rounded-lg dark:bg-gray-800">
        <LogTable
          class="p-3"
          :device-id="id"
          :app-id="packageId"
        />
      </div>
    </div>
  </div>
</template>
