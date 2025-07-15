<script setup lang="ts">
import type { Tab } from '~/components/comp_def'
import type { OrganizationRole } from '~/stores/organization'
import type { Database } from '~/types/supabase.types'
import { greaterThan, parse } from '@std/semver'
import { onClickOutside } from '@vueuse/core'
import ky from 'ky'
import { useI18n } from 'petite-vue-i18n'
import { ref, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import IconLog from '~icons/heroicons/document'
import IconInformations from '~icons/heroicons/information-circle'
import IconAlertCircle from '~icons/lucide/alert-circle'
import IconDown from '~icons/material-symbols/keyboard-arrow-down-rounded'
import { appIdToUrl, urlToAppId } from '~/services/conversion'
import { formatDate } from '~/services/date'
import { defaultApiHost, useSupabase } from '~/services/supabase'
import { useDialogV2Store } from '~/stores/dialogv2'
import { useDisplayStore } from '~/stores/display'
import { useMainStore } from '~/stores/main'
import { useOrganizationStore } from '~/stores/organization'

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
const dialogStore = useDialogV2Store()
const { t } = useI18n()
const main = useMainStore()
const router = useRouter()
const route = useRoute('/app/p/[package].d.[device]')
const supabase = useSupabase()
const packageId = ref<string>('')
const id = ref<string>()
const isLoading = ref(true)
const ActiveTab = ref(route.query.tab?.toString() || 'info')

watchEffect(() => {
  router.replace({ query: { ...route.query, tab: ActiveTab.value } })
})

const organizationStore = useOrganizationStore()

const device = ref<Database['public']['Tables']['devices']['Row'] & Device>()
const logs = ref<(Database['public']['Tables']['stats']['Row'] & Stat)[]>([])
const channels = ref<(Database['public']['Tables']['channels']['Row'] & Channel)[]>([])
const versions = ref<Database['public']['Tables']['app_versions']['Row'][]>([])
const channelDevice = ref<Database['public']['Tables']['channels']['Row']>()
const role = ref<OrganizationRole | null>(null)
const reloadCount = ref(0)

const revertToNativeVersion = ref<Database['public']['Functions']['check_revert_to_builtin_version']['Returns'] | null>(null)

// Channel dropdown state
const channelDropdown = ref<HTMLDetailsElement>()

onClickOutside(channelDropdown, () => closeChannelDropdown())

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
      .neq('storage_provider', 'revert_to_builtin')
      .order('created_at', { ascending: false })
      .throwOnError()
    versions.value = data ?? []
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
    channels.value = (data ?? []) as (Database['public']['Tables']['channels']['Row'] & Channel)[]
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
          'authorization': `Bearer ${currentJwt ?? ''}`,
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
  return greaterThan(parse(val), parse(min))
}

async function loadRevertToNativeVersion() {
  if (revertToNativeVersion.value !== null) {
    return
  }
  const { data: revertVersionId, error } = await supabase
    .rpc('check_revert_to_builtin_version', { appid: packageId.value })

  if (error) {
    console.error('lazy load revertVersionId fail', error)
    return
  }

  revertToNativeVersion.value = revertVersionId
}

async function loadData() {
  isLoading.value = true
  logs.value = []
  await Promise.all([
    getDevice(),
    getChannelOverride(),
    getChannels(),
    getVersion(),
    getOrgRole(),
    loadRevertToNativeVersion(),
  ])
  reloadCount.value += 1
  isLoading.value = false
}

async function didCancel(name: string) {
  dialogStore.openDialog({
    title: t('alert-confirm-delete'),
    description: `${t('alert-delete-message')} ${name} ${t('from-device')} ?`,
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
  })
  return dialogStore.onDialogDismiss()
}

async function upsertDevChannel(device: string, channelId: number) {
  const currentGid = organizationStore.currentOrganization?.gid
  if (!main?.user?.id || !currentGid)
    return
  return supabase
    .from('channel_devices')
    .upsert({
      device_id: device.toLowerCase(),
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
    .eq('device_id', device.toLowerCase())
    .eq('app_id', packageId.value)
}

function closeChannelDropdown() {
  if (channelDropdown.value) {
    channelDropdown.value.removeAttribute('open')
  }
}

function getChannelLabel(channelId: number | string | null) {
  if (!channelId || channelId === 'none') {
    return t('none')
  }
  const channel = channels.value.find(ch => ch.id === Number(channelId))
  return channel?.name || t('none')
}

async function onSelectChannel(value: string) {
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

  closeChannelDropdown()
}

watchEffect(async () => {
  if (route.path.includes('/d/')) {
    packageId.value = route.params.package as string
    packageId.value = urlToAppId(packageId.value)
    id.value = route.params.device as string
    id.value = id.value!.toLowerCase()
    await loadData()
    displayStore.NavTitle = t('device')
    displayStore.defaultBack = `/app/p/${route.params.package}/devices`
  }
})

function openChannel() {
  if (packageId.value && channelDevice.value?.id)
    router.push(`/app/p/${appIdToUrl(packageId.value)}/channel/${channelDevice.value.id}`)
}
</script>

<template>
  <div>
    <div v-if="isLoading" class="flex flex-col items-center justify-center min-h-[50vh]">
      <Spinner size="w-40 h-40" />
    </div>
    <div v-else-if="device">
      <Tabs v-model:active-tab="ActiveTab" :tabs="tabs" />
      <div v-if="ActiveTab === 'info'" id="devices" class="flex flex-col">
        <div v-if="device.plugin_version === '0.0.0'" class="my-2 bg-[#ef4444] text-center text-white w-fit ml-auto mr-auto border-8 rounded-2xl border-[#ef4444]">
          {{ t('device-injected') }}
          <br>
          {{ t('device-injected-2') }}
        </div>
        <div class="flex flex-col overflow-visible bg-white shadow-lg border-slate-300 md:mx-auto md:mt-5 md:w-2/3 md:border dark:border-slate-900 md:rounded-lg dark:bg-gray-800">
          <dl :key="reloadCount" class="divide-y dark:divide-slate-500 divide-slate-200">
            <InfoRow :label="t('device-id')">
              {{ device.device_id }}
            </InfoRow>
            <InfoRow v-if="device.custom_id" :label="t('custom-id')">
              {{ device.custom_id }}
            </InfoRow>
            <InfoRow v-if="device.updated_at" :label="t('last-update')">
              {{ formatDate(device.updated_at) }}
            </InfoRow>
            <InfoRow v-if="device.platform" :label="t('platform')">
              {{ device.platform }}
            </InfoRow>
            <InfoRow v-if="device.plugin_version" :label="t('plugin-version')">
              {{ device.plugin_version }}
            </InfoRow>
            <InfoRow v-if="device.version.name" :label="t('version')">
              {{ device.version.name }}
            </InfoRow>
            <InfoRow v-if="device.version_build" :label="t('version-builtin')">
              {{ device.version_build }}
            </InfoRow>
            <InfoRow v-if="device.os_version" :label="t('os-version')">
              {{ device.os_version }}
            </InfoRow>
            <InfoRow v-if="minVersion(device.plugin_version) && device.is_emulator" :label="t('is-emulator')">
              {{ device.is_emulator?.toString() }}
            </InfoRow>
            <InfoRow v-if="minVersion(device.plugin_version) && device.is_prod" :label="t('is-production-app')">
              {{ device.is_prod?.toString() }}
            </InfoRow>
            <InfoRow :label="t('channel-link')" :value="channelDevice?.name ?? ''" @click="openChannel()">
              <details ref="channelDropdown" class="d-dropdown d-dropdown-end relative" @click.stop>
                <summary class="d-btn d-btn-outline d-btn-sm">
                  <span>{{ getChannelLabel(channelDevice?.id || 'none') }}</span>
                  <IconDown class="w-4 h-4 ml-1 fill-current" />
                </summary>
                <ul class="d-dropdown-content bg-base-200 rounded-box z-50 w-48 p-2 shadow-lg absolute right-0 top-full mt-1">
                  <li class="block px-1 rounded-lg hover:bg-gray-600">
                    <a
                      class="block px-3 py-2 hover:bg-gray-600 text-white"
                      @click="onSelectChannel('none')"
                    >
                      {{ t('none') }}
                    </a>
                  </li>
                  <li v-for="ch in channels" :key="ch.id" class="block px-1 rounded-lg hover:bg-gray-600">
                    <a
                      class="block px-3 py-2 hover:bg-gray-600 text-white"
                      @click="onSelectChannel(ch.id.toString())"
                    >
                      {{ ch.name }}
                    </a>
                  </li>
                </ul>
              </details>
            </InfoRow>
          </dl>
        </div>
      </div>
      <div v-else-if="ActiveTab === 'logs'" id="devices">
        <div class="flex flex-col mx-auto overflow-y-auto bg-white shadow-lg border-slate-300 md:mt-5 md:w-2/3 md:border dark:border-slate-900 md:rounded-lg dark:bg-gray-800">
          <LogTable
            class="p-3"
            :device-id="id"
            :app-id="packageId"
          />
        </div>
      </div>
    </div>
    <div v-else class="flex flex-col items-center justify-center min-h-[50vh]">
      <IconAlertCircle class="w-16 h-16 text-destructive mb-4" />
      <h2 class="text-xl font-semibold text-foreground">
        {{ t('device-not-found') }}
      </h2>
      <p class="text-muted-foreground mt-2">
        {{ t('device-not-found-description') }}
      </p>
      <button class="mt-4 d-btn d-btn-primary" @click="router.push(`/app/p/${appIdToUrl(packageId)}/devices`)">
        {{ t('back-to-devices') }}
      </button>
    </div>
  </div>
</template>
