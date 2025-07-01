<script setup lang="ts">
import type { Tab } from '~/components/comp_def'
import type { OrganizationRole } from '~/stores/organization'
import type { Database } from '~/types/supabase.types'
import { FormKit } from '@formkit/vue'
import { useDebounceFn } from '@vueuse/core'
import { useI18n } from 'petite-vue-i18n'
import { ref, watch, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import IconHistory from '~icons/heroicons/clock'
import Settings from '~icons/heroicons/cog-8-tooth'
import IconDevice from '~icons/heroicons/device-phone-mobile'
import IconInformations from '~icons/heroicons/information-circle'
import IconNext from '~icons/ic/round-keyboard-arrow-right'
import IconSearch from '~icons/ic/round-search?raw'
import plusOutline from '~icons/ion/add-outline?width=2em&height=2em'
import IconAlertCircle from '~icons/lucide/alert-circle'
import { appIdToUrl, urlToAppId } from '~/services/conversion'
import { formatDate } from '~/services/date'
import { checkCompatibilityNativePackages, isCompatible, useSupabase } from '~/services/supabase'
import { useDialogV2Store } from '~/stores/dialogv2'
import { useDisplayStore } from '~/stores/display'
import { useMainStore } from '~/stores/main'
import { useOrganizationStore } from '~/stores/organization'

interface Channel {
  version: Database['public']['Tables']['app_versions']['Row']
}
const router = useRouter()
const dialogStore = useDialogV2Store()
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
const deviceIdInput = ref('')

// Bundle link dialog state
const bundleLinkVersions = ref<Database['public']['Tables']['app_versions']['Row'][]>([])
const bundleLinkSearchVal = ref('')
const bundleLinkSearchMode = ref(false)

const currentChannelVersion = computed(() => {
  return channel.value?.version as any
})

const showSearchAndActions = computed(() => {
  return !bundleLinkSearchMode.value
})

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
  deviceIdInput.value = ''

  dialogStore.openDialog({
    title: t('type-device-id'),
    description: t('type-device-id-msg'),
    buttons: [
      {
        text: t('button-cancel'),
        role: 'cancel',
      },
      {
        text: t('continue'),
        role: 'primary',
        handler: async () => {
          await customDeviceOverwritePart3()
        },
      },
    ],
  })
  await dialogStore.onDialogDismiss()
}

async function customDeviceOverwritePart3() {
  const input = deviceIdInput.value
  const deviceId = input

  if (!deviceIdRegex.test(input)) {
    toast.error(t('invalid-uuid'))
    return false
  }

  const bigLetters = countCapitalLetters(input)
  const smallLetters = countLowercaseLetters(input)

  if (bigLetters === smallLetters) {
    toast.error(t('cannot-determine-platform'))
    return false
  }
  const platform = bigLetters > smallLetters ? 'ios' : 'android'

  await customDeviceOverwritePart4(deviceId, platform)
}

async function customDeviceOverwritePart4(
  deviceId: string,
  platform: 'ios' | 'android',
) {
  dialogStore.openDialog({
    title: t('confirm-overwrite'),
    description: t('confirm-overwrite-msg').replace('$1', deviceId).replace('$2', channel.value?.name ?? '').replace('$3', channel.value?.version.name ?? ''),
    buttons: [
      {
        text: t('no'),
        role: 'cancel',
      },
      {
        text: t('yes'),
        role: 'primary',
        handler: async () => {
          await customDeviceOverwritePart5(deviceId, platform)
        },
      },
    ],
  })
  await dialogStore.onDialogDismiss()
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
      owner_org: channel.value?.owner_org ?? '',
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
          public,
          owner_org,
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
          app_id,
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

async function makeDefault(val = true) {
  if (!organizationStore.hasPermisisonsInRole(role.value, ['admin', 'super_admin'])) {
    toast.error(t('no-permission'))
    return
  }
  let buttonMessage = t('channel-make-now')
  if (channel.value?.ios && !channel.value.android)
    buttonMessage = t('make-default-ios')
  else if (channel.value?.android && !channel.value.ios)
    buttonMessage = t('make-default-android')

  dialogStore.openDialog({
    title: t('are-u-sure'),
    description: val ? t('confirm-public-desc') : t('making-this-channel-'),
    buttons: [
      {
        text: t('button-cancel'),
        role: 'cancel',
      },
      {
        text: val ? buttonMessage : t('make-normal'),
        role: 'primary',
        handler: async () => {
          if (!channel.value || !id.value)
            return
          const { error } = await supabase
            .from('channels')
            .update({ public: val })
            .eq('id', id.value)

          // This code is here because the backend has a 20 second delay between setting a channel to public
          // and the backend changing other channels to be not public
          // In these 20 seconds the updates are broken
          if (val && channel.value.ios) {
            const { error: iosError } = await supabase
              .from('channels')
              .update({ public: false })
              .eq('app_id', channel.value.app_id)
              .eq('ios', true)
              .neq('id', channel.value.id)
            const { error: hiddenError } = await supabase
              .from('channels')
              .update({ public: false })
              .eq('app_id', channel.value.app_id)
              .eq('android', false)
              .eq('ios', false)
            if (iosError || hiddenError)
              console.log('error', iosError ?? hiddenError)
          }

          if (val && channel.value.android) {
            const { error: androidError } = await supabase
              .from('channels')
              .update({ public: false })
              .eq('app_id', channel.value.app_id)
              .eq('android', true)
              .neq('id', channel.value.id)
            const { error: hiddenError } = await supabase
              .from('channels')
              .update({ public: false })
              .eq('app_id', channel.value.app_id)
              .eq('android', false)
              .eq('ios', false)
            if (androidError || hiddenError)
              console.log('error', androidError ?? hiddenError)
          }

          if (error) {
            console.error(error)
          }
          else {
            channel.value.public = val
            toast.success(val ? t('defined-as-public') : t('defined-as-private'))
          }
        },
      },
    ],
  })
  return dialogStore.onDialogDismiss()
}

async function getUnknownVersion(): Promise<number> {
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

async function openPannel() {
  if (!channel.value || !main.auth)
    return
  if (!organizationStore.hasPermisisonsInRole(role.value, ['admin', 'super_admin', 'write'])) {
    toast.error(t('no-permission'))
    return
  }
  dialogStore.openDialog({
    title: `${t('unlink-bundle')} ${channel.value.version.name}`,
    buttons: [
      {
        text: t('button-cancel'),
        role: 'cancel',
      },
      {
        text: t('continue'),
        role: 'primary',
        handler: async () => {
          const id = await getUnknownVersion()
          if (!id)
            return
          saveChannelChange('version', id)
        },
      },
    ],
  })
  return dialogStore.onDialogDismiss()
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
  dialogStore.openDialog({
    title: t('revert-to-builtin'),
    description: t('revert-to-builtin-confirm'),
    buttons: [
      {
        text: t('cancel'),
        role: 'cancel',
      },
      {
        text: t('confirm'),
        role: 'primary',
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
    ],
  })
  await dialogStore.onDialogDismiss()
}

async function handleLink(appVersion: Database['public']['Tables']['app_versions']['Row']) {
  if (!channel.value)
    return
  const {
    finalCompatibility,
    localDependencies,
  } = await checkCompatibilityNativePackages(appVersion.app_id, channel.value.name, (appVersion.native_packages as any) ?? [])

  // Check if any package is incompatible
  if (localDependencies.length > 0 && finalCompatibility.find(x => !isCompatible(x))) {
    toast.error(t('bundle-not-compatible-with-channel', { channel: channel.value.name }))
    toast.info(t('channel-not-compatible-with-channel-description').replace('%', 'npx @capgo/cli@latest bundle compatibility'))

    dialogStore.openDialog({
      title: t('confirm-action'),
      description: t('set-even-not-compatible').replace('%', 'npx @capgo/cli@latest bundle compatibility'),
      buttons: [
        {
          text: t('button-cancel'),
          role: 'cancel',
        },
        {
          text: t('button-confirm'),
          role: 'primary',
        },
      ],
    })
    if (await dialogStore.onDialogDismiss())
      return
  }
  else if (localDependencies.length === 0) {
    toast.info('ignore-compatibility')
  }
  else {
    toast.info(t('bundle-compatible-with-channel').replace('%', channel.value.name))
  }
  await saveChannelChange('version', appVersion.id)
  toast.success(t('linked-bundle'))
}

async function openSelectVersion() {
  if (!channel.value)
    return

  // Fetch versions when dialog opens
  const { data, error } = await supabase.from('app_versions')
    .select('*')
    .eq('app_id', channel.value.app_id)
    .eq('deleted', false)
    .neq('id', channel.value.version.id)
    .order('created_at', { ascending: false })
    .limit(5)

  if (error) {
    console.error(error)
    toast.error(t('error-fetching-versions'))
    return
  }

  bundleLinkVersions.value = data ?? []
  bundleLinkSearchVal.value = ''
  bundleLinkSearchMode.value = false

  // Open the dialog
  dialogStore.openDialog({
    title: t('bundle-management'),
    size: 'lg',
    buttons: [
      {
        text: t('button-cancel'),
        role: 'cancel',
      },
    ],
  })

  await dialogStore.onDialogDismiss()
}

const debouncedRefreshFilteredVersions = useDebounceFn(() => {
  refreshFilteredVersions()
}, 500)

watch(() => bundleLinkSearchVal.value, () => {
  debouncedRefreshFilteredVersions()
})

async function refreshFilteredVersions() {
  if (!channel.value)
    return

  if (bundleLinkSearchVal.value && bundleLinkSearchVal.value.trim()) {
    const { data, error } = await supabase.from('app_versions')
      .select('*')
      .eq('app_id', channel.value.app_id)
      .eq('deleted', false)
      .neq('id', channel.value.version.id)
      .order('created_at', { ascending: false })
      .like('name', `%${bundleLinkSearchVal.value.trim()}%`)
      .limit(5)
    if (error) {
      console.error(error)
      toast.error(t('error-fetching-versions'))
    }
    bundleLinkVersions.value = data ?? []
  }
  else {
    const { data, error } = await supabase.from('app_versions')
      .select('*')
      .eq('app_id', channel.value.app_id)
      .eq('deleted', false)
      .neq('id', channel.value.version.id)
      .order('created_at', { ascending: false })
      .limit(5)
    if (error) {
      console.error(error)
      toast.error(t('error-fetching-versions'))
    }
    bundleLinkVersions.value = data ?? []
  }
}

async function handleVersionLink(version: Database['public']['Tables']['app_versions']['Row']) {
  await handleLink(version)
}

async function handleUnlink() {
  await openPannel()
}

async function handleRevert() {
  await handleRevertToBuiltin()
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
                <button v-if="channel" class="btn btn-outline btn-sm ml-3" @click="openSelectVersion()">
                  <Settings class="w-5 h-5 text-gray-500 hover:text-blue-500 dark:text-gray-400 dark:hover:text-blue-400" />
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
              <Toggle
                :value="channel?.public"
                @change="() => (makeDefault(!channel?.public))"
              />
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
            'p-4': deviceIds.length === 0 && !dialogStore.showDialog,
          }"
        >
          <DeviceTable v-if="deviceIds.length > 0" class="p-3" :app-id="channel.version.app_id" :ids="deviceIds" :channel="channel" show-add-button @add-device="AddDevice" />
          <template v-else-if="!dialogStore.showDialog">
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

    <!-- Teleport Content for Add Device Modal -->
    <Teleport v-if="dialogStore.showDialog && dialogStore.dialogOptions?.title === t('type-device-id')" defer to="#dialog-v2-content">
      <div class="space-y-4">
        <FormKit
          v-model="deviceIdInput"
          type="text"
          :placeholder="t('device-id-placeholder')"
          :label="t('device-id')"
          validation="required|uuid"
        />
      </div>
    </Teleport>

    <!-- Teleport Content for Bundle Link Dialog -->
    <Teleport v-if="dialogStore.showDialog && dialogStore.dialogOptions?.title === t('bundle-management')" defer to="#dialog-v2-content">
      <div class="w-full space-y-4">
        <div class="text-left">
          <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
            {{ t('select-bundle-action-for-channel') }}
          </p>
        </div>

        <!-- Search Input (only when in search mode) -->
        <div v-if="bundleLinkSearchMode" class="mb-6">
          <FormKit
            v-model="bundleLinkSearchVal"
            :prefix-icon="IconSearch"
            enterkeyhint="send"
            :placeholder="t('search-versions')"
            :classes="{
              outer: 'mb-0! w-full',
              inner: 'rounded-full!',
            }"
          />
        </div>

        <div class="space-y-3">
          <!-- Current Bundle Info -->
          <div class="p-3 border border-green-300 dark:border-green-600 bg-green-50 dark:bg-green-900/20 rounded-lg">
            <div class="flex items-center justify-between">
              <div>
                <div class="font-medium text-green-800 dark:text-green-200">
                  {{ t('current-bundle') }}
                </div>
                <div class="text-sm text-green-600 dark:text-green-300">
                  {{ currentChannelVersion?.name || t('unknown') }}
                </div>
              </div>
              <div class="text-green-600 dark:text-green-400 text-xl">
                🔗
              </div>
            </div>
          </div>

          <!-- Available Versions (when in search mode) -->
          <div v-if="bundleLinkSearchMode && bundleLinkVersions.length > 0" class="space-y-2">
            <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300">
              {{ t('available-versions') }}
            </h4>
            <div
              v-for="version in bundleLinkVersions"
              :key="version.id"
              class="p-3 border border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700"
              @click="handleVersionLink(version as any)"
            >
              <div class="flex items-center justify-between">
                <div>
                  <div class="font-medium">
                    {{ version.name }}
                  </div>
                  <div class="text-sm text-gray-600 dark:text-gray-400">
                    {{ t('created') }}: {{ version.created_at ? new Date(version.created_at).toLocaleDateString() : t('unknown') }}
                  </div>
                </div>
                <div class="text-blue-600 dark:text-blue-400">
                  →
                </div>
              </div>
            </div>
          </div>

          <!-- Action Cards (when not in search mode) -->
          <div v-if="showSearchAndActions" class="space-y-3">
            <!-- Link New Bundle -->
            <div
              class="p-3 border border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700"
              @click="bundleLinkSearchMode = true"
            >
              <div class="flex items-center justify-between">
                <div>
                  <div class="font-medium">
                    {{ t('link-new-bundle') }}
                  </div>
                  <div class="text-sm text-gray-600 dark:text-gray-400">
                    {{ t('search-and-select-a-different-bundle') }}
                  </div>
                </div>
                <div class="text-blue-600 dark:text-blue-400">
                  📦
                </div>
              </div>
            </div>

            <!-- Unlink Bundle -->
            <div
              class="p-3 border border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700"
              @click="handleUnlink"
            >
              <div class="flex items-center justify-between">
                <div>
                  <div class="font-medium">
                    {{ t('unlink-bundle') }}
                  </div>
                  <div class="text-sm text-gray-600 dark:text-gray-400">
                    {{ t('remove-bundle-from-this-channel') }}
                  </div>
                </div>
                <div class="text-orange-600 dark:text-orange-400">
                  🔓
                </div>
              </div>
            </div>

            <!-- Revert to Built-in -->
            <div
              class="p-3 border border-red-300 dark:border-red-600 rounded-lg cursor-pointer hover:bg-red-50 dark:hover:bg-red-900/20"
              @click="handleRevert"
            >
              <div class="flex items-center justify-between">
                <div>
                  <div class="font-medium text-red-600 dark:text-red-400">
                    {{ t('revert-to-builtin') }}
                  </div>
                  <div class="text-sm text-red-500 dark:text-red-300">
                    {{ t('revert-channel-to-built-in-version') }}
                  </div>
                </div>
                <div class="text-red-600 dark:text-red-400">
                  ⚠️
                </div>
              </div>
            </div>
          </div>

          <!-- Empty state for search -->
          <div v-if="bundleLinkSearchMode && bundleLinkVersions.length === 0" class="text-center text-gray-500 dark:text-gray-400 py-8">
            <div class="text-4xl mb-2">
              🔍
            </div>
            <div class="font-medium">
              {{ t('no-versions-found') }}
            </div>
            <div class="text-sm mt-1">
              {{ t('try-a-different-search-term') }}
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
