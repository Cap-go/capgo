<script setup lang="ts">
import IconLog from '~icons/heroicons/document'
import IconInformations from '~icons/heroicons/information-circle'
import ky from 'ky'
import { useI18n } from 'petite-vue-i18n'
import { gt } from 'semver'
import { ref, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import type { Tab } from '~/components/comp_def'
import { appIdToUrl, urlToAppId } from '~/services/conversion'
import { formatDate } from '~/services/date'
import { defaultApiHost, useSupabase } from '~/services/supabase'
import { useDisplayStore } from '~/stores/display'
import { useMainStore } from '~/stores/main'
import type { OrganizationRole } from '~/stores/organization'
import { useOrganizationStore } from '~/stores/organization'
import type { Database } from '~/types/supabase.types'

interface Device {
  version: Database['public']['Tables']['app_versions']['Row']
}
interface Channel {
  version: Database['public']['Tables']['app_versions']['Row']
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
const channelDevice = ref<Database['public']['Tables']['channels']['Row']>()
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
    versions.value = data || []
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
          id,
          version (
            name,
            id
          )
        ),
        created_at,
        updated_at
      `)
      .eq('app_id', packageId.value)
      .eq('device_id', id.value as string)
      .single()
      .throwOnError()
    if (error) {
      console.error('getChannelOverride', error)
      return
    }
    channelDevice.value = data.channel_id as any as Database['public']['Tables']['channels']['Row']
  }
  catch {
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
      .eq('device_id', id.value!.toLocaleLowerCase())
      .single()
      .throwOnError()
    if (!data?.version) {
      return
    }

    const { data: dataVersion } = await supabase
      .from('app_versions')
      .select(`
          id,
          name
      `)
      .eq('id', data!.version)
      .single()

    const overwriteVersion = (data || undefined) as Database['public']['Tables']['devices_override']['Row'] & Device
    if (dataVersion)
      overwriteVersion.version = dataVersion! as any as typeof overwriteVersion.version
    deviceOverride.value = overwriteVersion
  }
  catch {
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
          'authorization': `Bearer ${currentJwt || ''}`,
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
    if (!data?.version) {
      return
    }
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

async function upsertDevVersion(device: string, versionId: number) {
  const currentGid = organizationStore.currentOrganization?.gid
  return supabase
    .from('devices_override')
    .upsert({
      device_id: device.toLocaleLowerCase(),
      version: versionId,
      app_id: packageId.value,
      owner_org: currentGid as string,
    })
    .throwOnError()
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
        role: 'danger',
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
    .eq('device_id', device.toLocaleLowerCase())
    .eq('app_id', packageId.value)
}
async function updateVersionOverride(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  const hasPerm = organizationStore.hasPermisisonsInRole(role.value, ['admin', 'super_admin', 'write'])

  if (!hasPerm) {
    toast.error(t('no-permission'))
    return
  }

  if (deviceOverride.value && value === 'none') {
    if (device.value?.device_id)
      await delDevVersion(device.value?.device_id)
    toast.success(t('unlink-version'))
    await loadData()
  }
  else if (value !== 'none') {
    if (!device.value?.device_id) {
      toast.error(t('version-link-fail'))
      return
    }
    try {
      upsertDevVersion(device.value?.device_id, Number(value))
        .then(async () => {
          toast.success(t('version-linked'))
          return loadData()
        })
        .catch(async (error) => {
          console.error(error)
          toast.error(t('version-link-fail'))
        })
    }
    catch (error) {
      console.error(error)
      toast.error(t('version-link-fail'))
    }
  }
  else {
    toast.error(t('version-link-fail'))
  }
}

async function upsertDevChannel(device: string, channelId: number) {
  const currentGid = organizationStore.currentOrganization?.gid
  if (!main?.user?.id || !currentGid)
    return
  return supabase
    .from('channel_devices')
    .upsert({
      device_id: device.toLocaleLowerCase(),
      channel_id: channelId,
      app_id: packageId.value,
      owner_org: currentGid,
    }, { onConflict: 'app_id,device_id' })
    .throwOnError()
}

async function delDevChannel(device: string) {
  if (await didCancel(t('channel')))
    return
  return supabase
    .from('channel_devices')
    .delete()
    .eq('device_id', device.toLocaleLowerCase())
    .eq('app_id', packageId.value)
}

async function updateChannelOverride(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  console.log('updateChannel', value)
  const hasPerm = organizationStore.hasPermisisonsInRole(role.value, ['admin', 'super_admin', 'write'])

  if (!hasPerm) {
    toast.error(t('no-permission'))
    return
  }

  if (channelDevice.value && value === 'none') {
    if (device.value?.device_id)
      await delDevChannel(device.value?.device_id)
    toast.success(t('unlink-channel'))
    await loadData()
  }
  else if (value !== 'none') {
    if (!device.value?.device_id) {
      toast.error(t('channel-link-fail'))
      return
    }

    try {
      await upsertDevChannel(device.value?.device_id, Number(value))
        .then(async () => {
          toast.success(t('channel-linked'))
          return loadData()
        })
        .catch(async (error) => {
          console.error(error)
          toast.error(t('channel-link-fail'))
        })
    }
    catch (error) {
      console.error(error)
      toast.error(t('channel-link-fail'))
    }
  }
  else {
    toast.error(t('channel-link-fail'))
  }
}

watchEffect(async () => {
  if (route.path.includes('/d/')) {
    packageId.value = route.params.p as string
    packageId.value = urlToAppId(packageId.value)
    id.value = route.params.device as string
    id.value = id.value!.toLocaleLowerCase()
    await loadData()
    displayStore.NavTitle = t('device')
    displayStore.defaultBack = `/app/package/${route.params.p}/devices`
  }
})

function openVersion() {
  if (packageId.value && deviceOverride.value?.version?.id)
    router.push(`/app/p/${appIdToUrl(packageId.value)}/bundle/${deviceOverride.value.version.id}`)
}
function openChannel() {
  if (packageId.value && channelDevice.value?.id)
    router.push(`/app/p/${appIdToUrl(packageId.value)}/channel/${channelDevice.value.id}`)
}
</script>

<template>
  <div v-if="device" class="h-full md:py-4">
    <Tabs v-model:active-tab="ActiveTab" :tabs="tabs" />
    <div v-if="ActiveTab === 'info'" id="devices" class="flex flex-col">
      <div v-if="device.plugin_version === '0.0.0'" class="my-2 bg-[#ef4444] text-center text-white w-fit ml-auto mr-auto border-8 rounded-2xl border-[#ef4444]">
        {{ t('device-injected') }}
        <br>
        {{ t('device-injected-2') }}
      </div>
      <div class="flex flex-col overflow-y-auto bg-white shadow-lg border-slate-300 md:mx-auto md:mt-5 md:w-2/3 md:border dark:border-slate-900 md:rounded-lg dark:bg-gray-800">
        <dl :key="reloadCount" class="divide-y dark:divide-slate-200 dark:divide-slate-500">
          <InfoRow :label="t('device-id')" :value="device.device_id" />
          <InfoRow v-if="device.custom_id" :label="t('custom-id')" :value="device.custom_id" />
          <InfoRow v-if="device.updated_at" :label="t('last-update')" :value="formatDate(device.updated_at)" />
          <InfoRow v-if="device.platform" :label="t('platform')" :value="device.platform" />
          <InfoRow v-if="device.plugin_version" :label="t('plugin-version')" :value="device.plugin_version" />
          <InfoRow v-if="device.version.name" :label="t('version')" :value="device.version.name" />
          <InfoRow v-if="device.version_build" :label="t('version-builtin')" :value="device.version_build" />
          <InfoRow v-if="device.os_version" :label="t('os-version')" :value="device.os_version" />
          <InfoRow v-if="minVersion(device.plugin_version) && device.is_emulator" :label="t('is-emulator')" :value="device.is_emulator?.toString()" />
          <InfoRow v-if="minVersion(device.plugin_version) && device.is_prod" :label="t('is-production-app')" :value="device.is_prod?.toString()" />
          <InfoRow :is-link="true" :label="t('force-version')" :value="deviceOverride?.version?.name || ''" @click="openVersion()">
            <select :value="deviceOverride?.version?.id || 'none'" class="dark:text-[#fdfdfd] dark:bg-[#4b5462] rounded-lg border-4 dark:border-[#4b5462]" @click.stop @change="updateVersionOverride">
              <option value="none">
                {{ t('none') }}
              </option>
              <option v-for="vs in versions" :key="vs.id" :value="vs.id">
                {{ vs.name }}
              </option>
            </select>
          </InfoRow>
          <InfoRow :is-link="true" :label="t('channel-link')" :value="channelDevice?.name || ''" @click="openChannel()">
            <select :value="channelDevice?.id || 'none'" class="dark:text-[#fdfdfd] dark:bg-[#4b5462] rounded-lg border-4 dark:border-[#4b5462]" @click.stop @change="updateChannelOverride">
              <option value="none">
                {{ t('none') }}
              </option>
              <option v-for="ch in channels" :key="ch.id" :value="ch.id">
                {{ ch.name }}
              </option>
            </select>
          </InfoRow>
        </dl>
      </div>
    </div>
    <div v-else-if="ActiveTab === 'logs'" id="devices" class="h-full md:py-4">
      <div class="flex flex-col mx-auto overflow-y-auto bg-white shadow-lg border-slate-300 md:mt-5 md:w-2/3 md:border dark:border-slate-900 md:rounded-lg dark:bg-gray-800">
        <LogTable
          class="p-3"
          :device-id="id"
          :app-id="packageId"
        />
      </div>
    </div>
  </div>
</template>
