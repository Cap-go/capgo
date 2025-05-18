<script setup lang="ts">
import type { Tab } from '~/components/comp_def'
import type { OrganizationRole } from '~/stores/organization'
import type { Database } from '~/types/supabase.types'
import { useI18n } from 'petite-vue-i18n'
import { ref, watch, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import IconRedirect from '~icons/heroicons/arrow-right-on-rectangle'
import IconHistory from '~icons/heroicons/clock'
import Settings from '~icons/heroicons/cog-8-tooth'
import IconDevice from '~icons/heroicons/device-phone-mobile'
import IconInformations from '~icons/heroicons/information-circle'
import IconNext from '~icons/ic/round-keyboard-arrow-right'
import plusOutline from '~icons/ion/add-outline?width=2em&height=2em'
import IconAlertCircle from '~icons/lucide/alert-circle'
import { appIdToUrl, urlToAppId } from '~/services/conversion'
import { formatDate } from '~/services/date'
import { useSupabase } from '~/services/supabase'
import { useDisplayStore } from '~/stores/display'
import { useMainStore } from '~/stores/main'
import { useOrganizationStore } from '~/stores/organization'

interface Channel {
  version: Database['public']['Tables']['app_versions']['Row']
  second_version: Database['public']['Tables']['app_versions']['Row']
  app_id: Database['public']['Tables']['apps']['Row']
}
const router = useRouter()
const displayStore = useDisplayStore()
const organizationStore = useOrganizationStore()
const { t } = useI18n()
const route = useRoute('/app/p/[package].channel.[channel]')
const main = useMainStore()
const supabase = useSupabase()
const packageId = ref<string>('')
const id = ref<number>(0)
const loading = ref(true)
const deviceIds = ref<string[]>([])
const channel = ref<Database['public']['Tables']['channels']['Row'] & Channel>()
const ActiveTab = ref(route.query.tab?.toString() || 'info')

watchEffect(() => {
  router.replace({ query: { ...route.query, tab: ActiveTab.value } })
})

function countLowercaseLetters(str: string) {
  const matches = str.match(/[a-z]/g)
  return matches ? matches.length : 0
}

function countCapitalLetters(str: string) {
  const matches = str.match(/[A-Z]/g)
  return matches ? matches.length : 0
}

const deviceIdRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function AddDevice() {
  displayStore.dialogOption = {
    header: t('type-device-id'),
    message: `${t('type-device-id-msg')}`,
    buttonCenter: true,
    headerStyle: 'w-full text-center',
    textStyle: 'w-full text-center',
    preventAccidentalClose: true,
    input: true,
    size: 'max-w-xl',
    buttons: [
      {
        text: t('button-cancel'),
        role: 'cancel',
      },
      {
        text: t('continue'),
        id: 'confirm-button',
        preventClose: true,
        handler: async () => {
          await customDeviceOverwritePart3()
        },
      },
    ],
  }
  displayStore.showDialog = true
}

async function customDeviceOverwritePart3() {
  const input = displayStore.dialogInputText
  const deviceId = input

  if (!deviceIdRegex.test(input)) {
    toast.error(t('invalid-uuid'))
    return
  }

  const bigLetters = countCapitalLetters(input)
  const smallLetters = countLowercaseLetters(input)

  if (bigLetters === smallLetters) {
    toast.error(t('cannot-determine-platform'))
    return
  }
  const platform = bigLetters > smallLetters ? 'ios' : 'android'

  await customDeviceOverwritePart4(deviceId, platform)
}

async function customDeviceOverwritePart4(
  deviceId: string,
  platform: 'ios' | 'android',
) {
  displayStore.dialogOption = {
    buttonCenter: true,
    headerStyle: 'w-full text-center',
    textStyle: 'w-full text-center',
    preventAccidentalClose: true,
    header: t('confirm-overwrite'),
    message: `${t('confirm-overwrite-msg').replace('$1', deviceId).replace('$2', channel.value?.name || '').replace('$3', channel.value?.version.name || '')}`,
    size: 'max-w-xl',
    buttons: [
      {
        text: t('yes'),
        role: 'yes',
        handler: async () => {
          await customDeviceOverwritePart5(deviceId, platform)
        },
      },
      {
        text: t('no'),
        role: 'cancel',
      },
    ],
  }
  displayStore.showDialog = true
}

async function customDeviceOverwritePart5(
  deviceId: string,
  platform: 'ios' | 'android',
) {
  const { error: addDeviceError } = await supabase.functions.invoke('private/create_device', {
    body: {
      device_id: deviceId,
      app_id: route.params.package as string,
      platform,
      version: Number(route.params.channel),
    },
  })

  if (addDeviceError) {
    console.error('addDeviceError', addDeviceError)
    toast.error(t('cannot-create-empty-device'))
    return
  }

  const { error: overwriteError } = await supabase.from('channel_devices')
    .insert({
      app_id: route.params.package as string,
      channel_id: Number(route.params.channel),
      device_id: deviceId.toLowerCase(),
      owner_org: channel.value?.owner_org || '',
    })

  if (overwriteError) {
    console.error('overwriteError', overwriteError)
    toast.error(t('cannot-create-overwrite'))
  }

  reload()
}

// Function to open link in a new tab
function openLink(url?: string): void {
  if (url) {
    // Using window from global scope
    const win = window.open(url, '_blank')
    // Add some security with noopener
    if (win)
      win.opener = null
  }
}

const role = ref<OrganizationRole | null>(null)
watch(channel, async (channel) => {
  if (!channel) {
    role.value = null
    return
  }

  await organizationStore.awaitInitialLoad()
  role.value = await organizationStore.getCurrentRoleForApp(channel.app_id)
  console.log(role.value)
})

const tabs: Tab[] = [
  {
    label: 'info',
    icon: IconInformations,
    key: 'info',
  },
  {
    label: 'channel-forced-devices',
    icon: IconDevice,
    key: 'devices',
  },
  {
    label: 'deploy-history',
    icon: IconHistory,
    key: 'history',
  },
]
function openBundle() {
  if (!channel.value || channel.value.version.storage_provider === 'revert_to_builtin')
    return
  if (channel.value.version.name === 'unknown')
    return
  console.log('openBundle', channel.value.version.id)
  router.push(`/app/p/${route.params.package}/bundle/${channel.value.version.id}`)
}

async function getDeviceIds() {
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

async function getChannel() {
  if (!id.value)
    return
  try {
    const { data, error } = await supabase
      .from('channels')
      .select(`
          id,
          name,
          version (
            id,
            name,
            app_id,
            created_at,
            min_update_version,
            storage_provider,
            link,
            comment
          ),
          created_at,
          app_id (
            id,
            default_channel_android,
            default_channel_ios
          ),
          allow_emulator,
          allow_dev,
          allow_device_self_set,
          disable_auto_update_under_native,
          disable_auto_update,
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

    channel.value = data as unknown as Database['public']['Tables']['channels']['Row'] & Channel
  }
  catch (error) {
    console.error(error)
  }
}

async function reload() {
  await getChannel()
  await getDeviceIds()
}

async function saveChannelChange(key: string, val: any) {
  if (!organizationStore.hasPermisisonsInRole(role.value, ['admin', 'super_admin'])) {
    toast.error(t('no-permission'))
    return
  }

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
    if (error) {
      toast.error(t('error-update-channel'))
      console.error('no channel update', error)
    }
  }
  catch (error) {
    console.error(error)
  }
}

watchEffect(async () => {
  if (route.path.includes('/channel/')) {
    loading.value = true
    packageId.value = route.params.package as string
    packageId.value = urlToAppId(packageId.value)
    id.value = Number(route.params.channel as string)
    await getChannel()
    await getDeviceIds()
    loading.value = false
    displayStore.NavTitle = t('channel')
    displayStore.defaultBack = `/app/p/${route.params.package}/channels`
  }
})

async function getUnknownVersion(): Promise<number> {
  if (!channel.value)
    return 0
  try {
    const { data, error } = await supabase
      .from('app_versions')
      .select('id, app_id, name')
      .eq('app_id', channel.value.app_id.app_id)
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

async function openPannel() {
  if (!channel.value || !main.auth)
    return
  if (!organizationStore.hasPermisisonsInRole(role.value, ['admin', 'super_admin', 'write'])) {
    toast.error(t('no-permission'))
    return
  }
  displayStore.dialogOption = {
    header: `${t('unlink-bundle')} ${channel.value.version.name}`,
    headerStyle: 'w-full text-center',
    size: 'max-w-fit px-12',
    buttonCenter: true,
    buttons: [
      {
        text: t('button-cancel'),
        role: 'cancel',
        handler: () => {
          // console.log('Cancel clicked')
        },
      },
      {
        text: t('continue'),
        handler: async () => {
          const id = await getUnknownVersion()
          if (!id)
            return
          saveChannelChange('version', id)
        },
      },
    ],
  }
  displayStore.showDialog = true
  return displayStore.onDialogDismiss()
}

function guardChangeAutoUpdate(event: Event) {
  if (!organizationStore.hasPermisisonsInRole(role.value, ['admin', 'super_admin'])) {
    toast.error(t('no-permission'))
    event.preventDefault()
    return false
  }
}

async function onChangeAutoUpdate(event: Event) {
  if (!organizationStore.hasPermisisonsInRole(role.value, ['admin', 'super_admin'])) {
    toast.error(t('no-permission'))
    event.preventDefault()
    if (channel?.value?.disable_auto_update)
      (event.target as HTMLSelectElement).value = channel.value.disable_auto_update

    return false
  }
  const value = (event.target as HTMLSelectElement).value as Database['public']['Enums']['disable_update']

  if (value === 'version_number') {
    if (!channel.value?.version.min_update_version)
      toast.error(t('metadata-min-ver-not-set'))
  }

  const { error } = await supabase
    .from('channels')
    .update({ disable_auto_update: value })
    .eq('id', id.value)

  if (error)
    console.error(error)

  if (channel.value?.disable_auto_update)
    channel.value.disable_auto_update = value
}

async function handleRevertToBuiltin() {
  if (!organizationStore.hasPermisisonsInRole(role.value, ['admin', 'super_admin', 'write'])) {
    toast.error(t('no-permission'))
    return
  }
  displayStore.dialogOption = {
    header: t('revert-to-builtin'),
    message: t('revert-to-builtin-confirm'),
    buttons: [
      {
        text: t('confirm'),
        handler: async () => {
          const { data: revertVersionId, error } = await supabase
            .rpc('check_revert_to_builtin_version', { appid: packageId.value })

          if (error) {
            console.error('lazy load revertVersionId fail', error)
            toast.error(t('error-revert-to-builtin'))
            return
          }

          const { error: updateError } = await supabase
            .from('channels')
            .update({ version: revertVersionId })
            .eq('id', id.value)

          if (updateError) {
            console.error(updateError)
            toast.error(t('error-revert-to-builtin'))
            return
          }

          await getChannel()
        },
      },
      {
        text: t('cancel'),
        role: 'cancel',
      },
    ],
  }
  displayStore.showDialog = true
}

async function handleLink(appVersion: Database['public']['Tables']['app_versions']['Row']) {
  if (!channel.value)
    return
  await saveChannelChange('version', appVersion.id)
  toast.success(t('linked-bundle'))
}

function openSelectVersion() {
  displayStore.showBundleLinkDialogCallbacks = {
    onRevert: handleRevertToBuiltin,
    onUnlink: async () => {
      openPannel()
    },
    onLink: async (appVersion: Database['public']['Tables']['app_versions']['Row']) => {
      await handleLink(appVersion)
    },
  }
  displayStore.showBundleLinkDialogChannel = channel.value as any // YOLO, if this doesn't work, we don't care
}

function redirectToAppSettings() {
  if (!channel.value)
    return
  router.push(`/app/p/${appIdToUrl(packageId.value)}/settings`)
}
</script>

<template>
  <div>
    <div v-if="loading" class="flex flex-col items-center justify-center min-h-[50vh]">
      <Spinner size="w-40 h-40" />
    </div>
    <div v-else-if="channel">
      <Tabs v-model:active-tab="ActiveTab" :tabs="tabs" />
      <div v-if="channel && ActiveTab === 'info'" class="flex flex-col overflow-y-auto h-[calc(100vh-200px)]">
        <div class="flex flex-col overflow-y-auto bg-white shadow-lg border-slate-300 md:mx-auto md:mt-5 md:w-2/3 md:border dark:border-slate-900 md:rounded-lg dark:bg-slate-800">
          <dl class="divide-y dark:divide-slate-500 divide-slate-200">
            <InfoRow :label="t('name')">
              {{ channel.name }}
            </InfoRow>
            <!-- Bundle Number -->
            <InfoRow :label="t('bundle-number')" :is-link="channel && channel.version.name !== 'builtin' && channel.version.name !== 'unknown'">
              <div class="flex items-center">
                <span @click="openBundle()">{{ channel.version.name }}</span>
                <button v-if="channel" @click="openSelectVersion()">
                  <Settings class="w-6 h-6 ml-1 text-[#3B82F6]" />
                </button>
              </div>
            </InfoRow>
            <InfoRow v-if="channel.disable_auto_update === 'version_number'" :label="t('min-update-version')">
              {{ channel.version.min_update_version ?? t('undefined-fail') }}
            </InfoRow>
            <!-- Created At -->
            <InfoRow :label="t('created-at')">
              {{ formatDate(channel.created_at) }}
            </InfoRow>
            <!-- Last Update -->
            <InfoRow :label="t('last-update')">
              {{ formatDate(channel.updated_at) }}
            </InfoRow>
            <!-- Bundle Link -->
            <InfoRow
              v-if="channel.version.link"
              :label="t('bundle-link')"
              :is-link="channel.version.link ? true : false"
              @click="channel.version.link ? openLink(channel.version.link) : null"
            >
              {{ channel.version.link }}
            </InfoRow>
            <!-- Bundle Comment -->
            <InfoRow v-if="channel.version.comment" :label="t('bundle-comment')">
              {{ channel.version.comment }}
            </InfoRow>
            <InfoRow :label="t('channel-is-public')">
              <div class="flex items-center flex-row gap-2">
                {{ (channel.app_id.default_channel_android || channel.app_id.default_channel_ios) === id ? t('yes') : t('no') }}
                <button @click="redirectToAppSettings()">
                  <IconRedirect class="w-6 h-6 text-[#3B82F6]" />
                </button>
              </div>
            </InfoRow>
            <InfoRow label="iOS">
              <Toggle
                :value="channel?.ios"
                @change="saveChannelChange('ios', !channel?.ios)"
              />
            </InfoRow>
            <InfoRow label="Android">
              <Toggle
                :value="channel?.android"
                @change="saveChannelChange('android', !channel?.android)"
              />
            </InfoRow>
            <InfoRow :label="t('disable-auto-downgra')">
              <Toggle
                :value="channel?.disable_auto_update_under_native"
                @change="saveChannelChange('disable_auto_update_under_native', !channel?.disable_auto_update_under_native)"
              />
            </InfoRow>
            <InfoRow :label="t('disableAutoUpdateToMajor')">
              <select id="selectableDisallow" :value="channel.disable_auto_update" class="dark:text-[#fdfdfd] dark:bg-[#4b5462] rounded-lg border-4 dark:border-[#4b5462]" @mousedown="guardChangeAutoUpdate" @change="(event) => onChangeAutoUpdate(event)">
                <option value="major">
                  {{ t('major') }}
                </option>
                <option value="minor">
                  {{ t('minor') }}
                </option>
                <option value="patch">
                  {{ t('patch') }}
                </option>
                <option value="version_number">
                  {{ t('metadata') }}
                </option>
                <option value="none">
                  {{ t('none') }}
                </option>
              </select>
            </InfoRow>
            <InfoRow :label="t('allow-develoment-bui')">
              <Toggle
                :value="channel?.allow_dev"
                @change="saveChannelChange('allow_dev', !channel?.allow_dev)"
              />
            </InfoRow>
            <InfoRow :label="t('allow-emulator')">
              <Toggle
                :value="channel?.allow_emulator"
                @change="saveChannelChange('allow_emulator', !channel?.allow_emulator)"
              />
            </InfoRow>
            <InfoRow :label="t('allow-device-to-self')">
              <Toggle
                :value="channel?.allow_device_self_set"
                @change="saveChannelChange('allow_device_self_set', !channel?.allow_device_self_set)"
              />
            </InfoRow>
            <InfoRow :label="t('unlink-bundle')" :is-link="true" @click="openPannel">
              <button class="ml-auto bg-transparent w-7 h-7">
                <IconNext />
              </button>
            </InfoRow>
          </dl>
        </div>
      </div>
      <div
        v-if="channel && ActiveTab === 'devices'"
        class="flex flex-col"
        :class="{
          'm-0 w-full h-screen items-center justify-center overflow-hidden': deviceIds.length === 0,
        }"
      >
        <div
          class="flex flex-col overflow-y-auto bg-white shadow-lg border-slate-300 md:mx-auto md:border dark:border-slate-900 md:rounded-lg dark:bg-gray-800"
          :class="{
            'md:mt-5 md:w-2/3': deviceIds.length !== 0,
            'my-auto w-fit': deviceIds.length === 0,
            'p-4': deviceIds.length === 0 && !displayStore.showDialog,
          }"
        >
          <DeviceTable v-if="deviceIds.length > 0" class="p-3" :app-id="channel.version.app_id" :ids="deviceIds" :channel="channel" show-add-button @add-device="AddDevice" />
          <template v-else-if="!displayStore.showDialog">
            <div class="text-center">
              <div>{{ t('forced-devices-not-found') }}</div>
              <div class="btn btn-primary mt-4" @click="AddDevice">
                <plusOutline />
              </div>
            </div>
          </template>
        </div>
      </div>
      <div
        v-if="channel && ActiveTab === 'history'"
        class="flex flex-col"
      >
        <div
          class="flex flex-col overflow-y-auto bg-white shadow-lg border-slate-300 md:mx-auto md:mt-5 md:w-2/3 md:border dark:border-slate-900 md:rounded-lg dark:bg-gray-800"
        >
          <HistoryTable
            :channel-id="id"
            :app-id="channel.app_id"
          />
        </div>
      </div>
    </div>
    <div v-else class="flex flex-col items-center justify-center min-h-[50vh]">
      <IconAlertCircle class="w-16 h-16 text-destructive mb-4" />
      <h2 class="text-xl font-semibold text-foreground">
        {{ t('channel-not-found') }}
      </h2>
      <p class="text-muted-foreground mt-2">
        {{ t('channel-not-found-description') }}
      </p>
      <button class="mt-4 btn btn-primary" @click="router.push(`/app/p/${appIdToUrl(packageId)}/channels`)">
        {{ t('back-to-channels') }}
      </button>
    </div>
  </div>
</template>
