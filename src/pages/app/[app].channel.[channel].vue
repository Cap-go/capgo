<script setup lang="ts">
import type { Database } from '~/types/supabase.types'
import { FormKit } from '@formkit/vue'
import { greaterOrEqual, parse } from '@std/semver'
import { computedAsync, onClickOutside } from '@vueuse/core'
import { ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import IconCopy from '~icons/heroicons/clipboard-document-check'
import IconCode from '~icons/heroicons/code-bracket'
import Settings from '~icons/heroicons/cog-8-tooth'
import IconInformation from '~icons/heroicons/information-circle'
import IconSearch from '~icons/ic/round-search?raw'
import IconAlertCircle from '~icons/lucide/alert-circle'
import IconWarning from '~icons/lucide/alert-triangle'
import IconDown from '~icons/material-symbols/keyboard-arrow-down-rounded'
import { formatDate, formatLocalDate } from '~/services/date'
import { checkPermissions } from '~/services/permissions'
import { checkCompatibilityNativePackages, defaultApiHost, isCompatible, useSupabase } from '~/services/supabase'
import { isInternalVersionName } from '~/services/versions'
import { useAppDetailStore } from '~/stores/appDetail'
import { useDialogV2Store } from '~/stores/dialogv2'
import { useDisplayStore } from '~/stores/display'

interface Channel {
  version: Database['public']['Tables']['app_versions']['Row']
}

// Bundle link dialog state
const bundleLinkVersions = ref<Database['public']['Tables']['app_versions']['Row'][]>([])
const bundleLinkSearchVal = ref('')
const bundleLinkSearchMode = ref(false)

const main = useMainStore()
const route = useRoute('/app/[app].channel.[channel]')
const router = useRouter()
const dialogStore = useDialogV2Store()
const displayStore = useDisplayStore()
const appDetailStore = useAppDetailStore()
const { t } = useI18n()
const supabase = useSupabase()
const packageId = ref<string>('')
const id = ref<number>(0)
const loading = ref(true)
const channel = ref<Database['public']['Tables']['channels']['Row'] & Channel>()

const canUpdateChannelSettings = computedAsync(async () => {
  if (!packageId.value)
    return false
  return await checkPermissions('channel.update_settings', { appId: packageId.value })
}, false)

const canPromoteBundle = computedAsync(async () => {
  if (!id.value)
    return false
  return await checkPermissions('channel.promote_bundle', { channelId: id.value })
}, false)

const showDebugSection = ref(false)

// Auto update dropdown state
const autoUpdateDropdown = useTemplateRef('autoUpdateDropdown')
onClickOutside(autoUpdateDropdown, () => closeAutoUpdateDropdown())

function openBundle() {
  if (!channel.value || channel.value.version.storage_provider === 'revert_to_builtin')
    return
  if (channel.value.version.name === 'unknown')
    return
  router.push(`/app/${route.params.app}/bundle/${channel.value.version.id}`)
}

async function getChannel(force = false) {
  if (!id.value)
    return

  // Check if we already have this channel in the store
  if (!force && appDetailStore.currentChannelId === id.value && appDetailStore.currentChannel) {
    channel.value = appDetailStore.currentChannel as any
    if (channel.value?.name)
      displayStore.setChannelName(String(channel.value.id), channel.value.name)
    displayStore.NavTitle = channel.value?.name ?? t('channel')
    return
  }

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
          allow_device,
          allow_dev,
          allow_prod,
          allow_device_self_set,
          disable_auto_update_under_native,
          disable_auto_update,
          ios,
          android,
          electron,
          updated_at
        `)
      .eq('id', id.value)
      .single()
    if (error) {
      console.error('no channel', error)
      return
    }

    channel.value = data as unknown as Database['public']['Tables']['channels']['Row'] & Channel

    // Store in appDetailStore
    appDetailStore.setChannel(id.value, channel.value)

    if (channel.value?.name)
      displayStore.setChannelName(String(channel.value.id), channel.value.name)
    displayStore.NavTitle = channel.value?.name ?? t('channel')
  }
  catch (error) {
    console.error(error)
  }
}

async function saveChannelChange(key: string, val: any) {
  if (!canUpdateChannelSettings.value) {
    toast.error(t('no-permission'))
    return
  }

  if (!id.value || !channel.value)
    return

  // Validate version ID if updating version field
  if (key === 'version' && (val === undefined || val === null || typeof val !== 'number')) {
    console.error('Invalid version ID:', val)
    toast.error(t('error-invalid-version'))
    return
  }

  try {
    const update = {
      [key]: val,
    }
    const { error } = await supabase
      .from('channels')
      .update(update)
      .eq('id', id.value)
    getChannel(true)
    if (error) {
      toast.error(t('error-update-channel'))
      console.error('no channel update', error)
    }
    else {
      toast.info(t('cloud-replication-delay'))
    }
  }
  catch (error) {
    console.error(error)
  }
}

watchEffect(async () => {
  if (route.path.includes('/channel/')) {
    loading.value = true
    packageId.value = route.params.app as string
    id.value = Number(route.params.channel as string)
    await getChannel()
    loading.value = false
    if (!channel.value?.name)
      displayStore.NavTitle = t('channel')
    displayStore.defaultBack = `/app/${route.params.app}/channels`
  }
})

function goToDefaultChannelSettings() {
  router.push(`/app/${route.params.app}/info`)
}

const currentChannelVersion = computed(() => {
  return channel.value?.version as any
})

const showSearchAndActions = computed(() => {
  return !bundleLinkSearchMode.value
})

async function handleVersionLink(appVersion: Database['public']['Tables']['app_versions']['Row']) {
  if (!channel.value)
    return
  const {
    finalCompatibility,
    localDependencies,
  } = await checkCompatibilityNativePackages(appVersion.app_id, channel.value.name, (appVersion.native_packages as any) ?? [])

  // Check if any package is incompatible
  if (localDependencies.length > 0 && finalCompatibility.find(x => !isCompatible(x))) {
    toast.error(t('bundle-not-compatible-with-channel', { channel: channel.value.name }))
    toast.info(t('channel-not-compatible-with-channel-description', { cmd: 'bunx @capgo/cli@latest bundle compatibility' }))

    dialogStore.openDialog({
      title: t('confirm-action'),
      description: t('set-even-not-compatible', { cmd: 'bunx @capgo/cli@latest bundle compatibility' }),
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
    toast.info(t('bundle-compatible-with-channel', { channel: channel.value.name }))
  }
  await saveChannelChange('version', appVersion.id)
  toast.success(t('linked-bundle'))
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
      console.error('no unknown version', error)
      return 0
    }
    return data.id
  }
  catch (error) {
    console.error(error)
  }
  return 0
}

async function handleUnlink() {
  if (!channel.value || !main.auth)
    return
  if (!canPromoteBundle.value) {
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

async function handleRevert() {
  if (!canPromoteBundle.value) {
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

          if (!revertVersionId || typeof revertVersionId !== 'number') {
            console.error('Invalid revert version ID:', revertVersionId)
            toast.error(t('error-invalid-version'))
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

          await getChannel(true)
          toast.info(t('cloud-replication-delay'))
        },
      },
    ],
  })
  await dialogStore.onDialogDismiss()
}

async function openSelectVersion() {
  if (!canPromoteBundle.value) {
    toast.error(t('no-permission'))
    return
  }
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

const debouncedRefreshFilteredVersions = useDebounceFn(() => {
  refreshFilteredVersions()
}, 500)

watch(() => bundleLinkSearchVal.value, () => {
  debouncedRefreshFilteredVersions()
})

function closeAutoUpdateDropdown() {
  if (autoUpdateDropdown.value) {
    autoUpdateDropdown.value.removeAttribute('open')
  }
}

function getAutoUpdateLabel(value: string) {
  switch (value) {
    case 'major':
      return t('major')
    case 'minor':
      return t('minor')
    case 'patch':
      return t('patch')
    case 'version_number':
      return t('metadata')
    case 'none':
      return t('none')
    default:
      return t('none')
  }
}

async function onSelectAutoUpdate(value: Database['public']['Enums']['disable_update']) {
  if (!canUpdateChannelSettings.value) {
    toast.error(t('no-permission'))
    return false
  }

  if (value === 'version_number') {
    if (!channel.value?.version.min_update_version)
      toast.error(t('metadata-min-ver-not-set'))
  }

  const { error } = await supabase
    .from('channels')
    .update({ disable_auto_update: value })
    .eq('id', id.value)

  if (error) {
    console.error(error)
  }
  else {
    toast.info(t('cloud-replication-delay'))
  }

  if (channel.value?.disable_auto_update)
    channel.value.disable_auto_update = value

  closeAutoUpdateDropdown()
}

function openLink(url?: string): void {
  if (url) {
    const win = window.open(url, '_blank')
    if (win)
      win.opener = null
  }
}

// Get the platform to use for testing based on channel settings
function getTestPlatform(): 'ios' | 'android' | 'electron' {
  if (!channel.value)
    return 'ios'
  // Prefer iOS if supported, then Android, then Electron
  if (channel.value.ios)
    return 'ios'
  if (channel.value.android)
    return 'android'
  if (channel.value.electron)
    return 'electron'
  return 'ios'
}

// Check if channel can be tested with the fake device data we use
const canTestChannel = computed(() => {
  if (!channel.value)
    return false
  const platform = getTestPlatform()
  // Check if channel allows the platform we're testing with
  const allowsPlatform = platform === 'ios'
    ? channel.value.ios
    : platform === 'android'
      ? channel.value.android
      : channel.value.electron
  const allowsProd = channel.value.allow_prod
  const allowsDevice = channel.value.allow_device
  // Channel must be public OR allow device self-assignment
  const isAccessible = channel.value.public || channel.value.allow_device_self_set
  return allowsPlatform && allowsProd && allowsDevice && isAccessible
})

// Generate a compatible version_name based on channel's version and update strategy
function getCompatibleVersionName(): string {
  if (!channel.value?.version?.name || isInternalVersionName(channel.value.version.name))
    return '1.0.0'

  const channelVersion = channel.value.version.name
  let channelSemver
  try {
    channelSemver = parse(channelVersion)
  }
  catch {
    return '1.0.0'
  }

  const { major, minor, patch } = channelSemver
  const strategy = channel.value.disable_auto_update

  // Generate a version that would trigger an update based on the strategy
  // We want a version slightly lower than the channel version to simulate a device needing an update
  let candidate = channelVersion
  switch (strategy) {
    case 'major':
      // Same major, device can receive update
      candidate = `${major}.0.0`
      break
    case 'minor':
      // Same major.minor, device can receive update
      candidate = `${major}.${minor}.0`
      break
    case 'patch':
      // Same major.minor.patch, device can receive update
      candidate = channelVersion
      break
    case 'version_number':
      // Uses min_update_version, return the min_update_version or channel version
      candidate = channel.value.version.min_update_version || channelVersion
      break
    case 'none':
    default:
      // Any version works, use a lower version to show update available
      candidate = `${major}.${minor}.0`
      break
  }

  const lowerFallback = () => {
    let fallback = '0.0.0-0'
    if (patch > 0)
      fallback = `${major}.${minor}.${patch - 1}`
    else if (minor > 0)
      fallback = `${major}.${minor - 1}.0`
    else if (major > 0)
      fallback = `${major - 1}.0.0`

    try {
      if (greaterOrEqual(parse(fallback), channelSemver))
        return '0.0.0-0'
    }
    catch {
      return '0.0.0-0'
    }

    return fallback
  }

  try {
    if (greaterOrEqual(parse(candidate), channelSemver))
      return lowerFallback()
  }
  catch {
    return lowerFallback()
  }

  return candidate
}

function getChannelCurlCommand() {
  if (!channel.value)
    return ''

  const versionName = getCompatibleVersionName()
  const platform = getTestPlatform()
  const versionOs = platform === 'ios' ? '18.0' : platform === 'android' ? '14' : '10.0'

  // Generate fake device data that fits the /updates endpoint schema
  const requestBody: Record<string, unknown> = {
    app_id: packageId.value,
    device_id: '00000000-0000-0000-0000-000000000000',
    version_name: versionName,
    version_build: versionName,
    version_os: versionOs,
    is_emulator: false,
    is_prod: true,
    platform,
    plugin_version: '8.40.6',
  }

  // Only include defaultChannel if the channel is NOT public (not the default)
  if (!channel.value.public) {
    requestBody.defaultChannel = channel.value.name
  }

  const jsonBody = JSON.stringify(requestBody, null, 2)

  return `curl -X POST '${defaultApiHost}/updates' \\
  -H 'Content-Type: application/json' \\
  -d '${jsonBody}'`
}

async function copyCurlCommand() {
  try {
    const curl = getChannelCurlCommand()
    await navigator.clipboard.writeText(curl)
    toast.success(t('copy-success'))
  }
  catch (error) {
    console.error('Failed to copy curl command:', error)
    toast.error(t('copy-fail'))
  }
}
</script>

<template>
  <div>
    <div v-if="loading" class="flex flex-col justify-center items-center min-h-[50vh]">
      <Spinner size="w-40 h-40" />
    </div>
    <div v-else-if="channel" class="mt-0 md:mt-8">
      <div class="w-full h-full px-0 pt-0 mx-auto mb-8 sm:px-6 md:pt-8 lg:px-8 max-w-9xl max-h-fit">
        <div class="flex flex-col bg-white border shadow-lg md:rounded-lg border-slate-300 dark:border-slate-900 dark:bg-slate-800">
          <dl class="divide-y divide-slate-200 dark:divide-slate-500">
            <InfoRow :label="t('name')">
              {{ channel.name }}
            </InfoRow>
            <!-- Bundle Number -->
            <InfoRow :label="t('bundle-number')" :is-link="channel && !isInternalVersionName((channel.version.name))">
              <div class="flex items-center gap-2">
                <span class="cursor-pointer" @click="openBundle()">{{ channel.version.name }}</span>
                <button
                  v-if="channel"
                  class="p-1 transition-colors border border-gray-200 rounded-md dark:border-gray-700 hover:bg-gray-50 hover:border-gray-300 dark:hover:border-gray-600 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:border-gray-200 dark:disabled:hover:border-gray-700"
                  :disabled="!canPromoteBundle"
                  @click="openSelectVersion()"
                >
                  <Settings class="w-4 h-4 text-gray-500 dark:text-gray-400 hover:text-blue-500 dark:hover:text-blue-400" />
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
              <div class="flex items-center justify-end w-full gap-3 text-right">
                <span
                  class="inline-flex items-center px-2 py-1 text-xs font-semibold rounded-md"
                  :class="channel?.public
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
                    : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'"
                >
                  {{ channel?.public ? t('channel-default-active') : t('channel-default-inactive') }}
                </span>
                <button
                  type="button"
                  class="text-sm font-medium text-blue-600 underline dark:text-blue-400 hover:text-blue-500 decoration-dotted dark:hover:text-blue-300"
                  @click="goToDefaultChannelSettings"
                >
                  {{ t('manage-default-channel') }}
                </button>
                <div class="relative inline-flex group">
                  <IconInformation class="w-4 h-4 transition-colors text-slate-400 cursor-help dark:text-slate-400 dark:group-hover:text-slate-200 group-hover:text-slate-600" />
                  <div class="absolute right-0 w-56 px-3 py-2 mb-2 text-xs text-white transition-opacity duration-150 bg-gray-800 rounded-lg shadow-lg opacity-0 pointer-events-none bottom-full group-hover:opacity-100">
                    {{ t('channel-default-moved-info') }}
                    <div class="absolute w-2 h-2 rotate-45 bg-gray-800 -bottom-1 right-2" />
                  </div>
                </div>
              </div>
            </InfoRow>
            <InfoRow
              v-for="platform in ['ios', 'android', 'electron'] as const"
              :key="platform"
              :label="t(`platform-${platform}`)"
            >
              <Toggle
                :value="channel?.[platform]"
                @change="saveChannelChange(platform, !channel?.[platform])"
              />
            </InfoRow>
            <InfoRow :label="t('disable-auto-downgra')">
              <Toggle
                :value="channel?.disable_auto_update_under_native"
                @change="saveChannelChange('disable_auto_update_under_native', !channel?.disable_auto_update_under_native)"
              />
            </InfoRow>
            <InfoRow :label="t('disableAutoUpdateToMajor')">
              <details ref="autoUpdateDropdown" class="d-dropdown d-dropdown-end">
                <summary class="d-btn d-btn-outline d-btn-sm">
                  <span>{{ getAutoUpdateLabel(channel.disable_auto_update) }}</span>
                  <IconDown class="w-4 h-4 ml-1 fill-current" />
                </summary>
                <ul class="w-48 p-2 bg-white shadow d-dropdown-content dark:bg-base-200 rounded-box z-1">
                  <li class="block px-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600">
                    <a
                      class="block px-3 py-2 text-gray-900 dark:text-white"
                      @click="onSelectAutoUpdate('major')"
                    >
                      {{ t('major') }}
                    </a>
                  </li>
                  <li class="block px-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600">
                    <a
                      class="block px-3 py-2 text-gray-900 dark:text-white"
                      @click="onSelectAutoUpdate('minor')"
                    >
                      {{ t('minor') }}
                    </a>
                  </li>
                  <li class="block px-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600">
                    <a
                      class="block px-3 py-2 text-gray-900 dark:text-white"
                      @click="onSelectAutoUpdate('patch')"
                    >
                      {{ t('patch') }}
                    </a>
                  </li>
                  <li class="block px-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600">
                    <a
                      class="block px-3 py-2 text-gray-900 dark:text-white"
                      @click="onSelectAutoUpdate('version_number')"
                    >
                      {{ t('metadata') }}
                    </a>
                  </li>
                  <li class="block px-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600">
                    <a
                      class="block px-3 py-2 text-gray-900 dark:text-white"
                      @click="onSelectAutoUpdate('none')"
                    >
                      {{ t('none') }}
                    </a>
                  </li>
                </ul>
              </details>
            </InfoRow>
            <InfoRow :label="t('allow-dev-build')">
              <Toggle
                :value="channel?.allow_dev"
                @change="saveChannelChange('allow_dev', !channel?.allow_dev)"
              />
            </InfoRow>
            <InfoRow :label="t('allow-prod-build')">
              <Toggle
                :value="channel?.allow_prod"
                @change="saveChannelChange('allow_prod', !channel?.allow_prod)"
              />
            </InfoRow>
            <InfoRow :label="t('allow-emulator')">
              <Toggle
                :value="channel?.allow_emulator"
                @change="saveChannelChange('allow_emulator', !channel?.allow_emulator)"
              />
            </InfoRow>
            <InfoRow :label="t('allow-physical-device')">
              <Toggle
                :value="channel?.allow_device"
                @change="saveChannelChange('allow_device', !channel?.allow_device)"
              />
            </InfoRow>
            <InfoRow :label="t('allow-device-to-self')">
              <Toggle
                :value="channel?.allow_device_self_set"
                @change="saveChannelChange('allow_device_self_set', !channel?.allow_device_self_set)"
              />
            </InfoRow>
          </dl>

          <!-- Debug API Section -->
          <div class="border-t border-slate-300 dark:border-slate-700">
            <button
              class="flex items-center justify-between w-full px-6 py-4 transition-colors dark:hover:bg-slate-700/50 hover:bg-slate-50"
              @click="showDebugSection = !showDebugSection"
            >
              <div class="flex items-center gap-2">
                <IconCode class="w-5 h-5 text-slate-600 dark:text-slate-300" />
                <span class="font-medium text-slate-700 dark:text-slate-200">{{ t('debug-channel-api-request') }}</span>
              </div>
              <IconDown
                class="w-5 h-5 transition-transform text-slate-600 dark:text-slate-300"
                :class="{ 'rotate-180': showDebugSection }"
              />
            </button>

            <div v-if="showDebugSection" class="px-6 pb-4">
              <!-- Warning if channel cannot be tested -->
              <div v-if="!canTestChannel" class="flex items-start gap-3 p-3 mb-4 rounded-lg bg-amber-50 dark:bg-amber-900/20">
                <IconWarning class="flex-shrink-0 w-5 h-5 mt-0.5 text-amber-600 dark:text-amber-400" />
                <p class="text-sm text-amber-800 dark:text-amber-200">
                  {{ t('debug-channel-api-warning') }}
                </p>
              </div>

              <div class="relative">
                <pre class="p-4 overflow-x-auto text-sm rounded-lg bg-slate-900 text-slate-100"><code>{{ getChannelCurlCommand() }}</code></pre>
                <button
                  class="absolute p-2 transition-colors rounded top-2 right-2 hover:bg-slate-700"
                  :title="t('copy-curl')"
                  @click="copyCurlCommand"
                >
                  <IconCopy class="w-4 h-4 text-slate-300" />
                </button>
              </div>
              <p class="mt-2 text-sm text-slate-600 dark:text-slate-400">
                {{ t('debug-channel-api-description') }}
              </p>
              <p class="mt-1 text-xs text-slate-500 dark:text-slate-500 italic">
                {{ t('debug-channel-api-tip') }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div v-else class="flex flex-col justify-center items-center min-h-[50vh]">
      <IconAlertCircle class="w-16 h-16 mb-4 text-destructive" />
      <h2 class="text-xl font-semibold text-foreground">
        {{ t('channel-not-found') }}
      </h2>
      <p class="mt-2 text-muted-foreground">
        {{ t('channel-not-found-description') }}
      </p>
      <button class="mt-4 text-white d-btn d-btn-primary" @click="router.push(`/app/${packageId}/channels`)">
        {{ t('back-to-channels') }}
      </button>
    </div>
    <!-- Teleport Content for Bundle Link Dialog -->
    <Teleport v-if="dialogStore.showDialog && dialogStore.dialogOptions?.title === t('bundle-management')" defer to="#dialog-v2-content">
      <div class="w-full space-y-4">
        <div class="text-left">
          <p class="mb-4 text-sm text-gray-600 dark:text-gray-400">
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
            }"
          />
        </div>

        <div class="space-y-3">
          <!-- Current Bundle Info -->
          <div class="flex flex-col gap-1 px-1">
            <div class="text-sm font-medium text-gray-500 dark:text-gray-400">
              {{ t('current-bundle') }}
            </div>
            <div class="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
              <div class="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              {{ currentChannelVersion?.name || t('unknown') }}
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
              class="p-3 border border-gray-300 rounded-lg cursor-pointer dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
              @click="handleVersionLink(version as any)"
            >
              <div class="flex items-center justify-between">
                <div>
                  <div class="font-medium">
                    {{ version.name }}
                  </div>
                  <div class="text-sm text-gray-600 dark:text-gray-400">
                    {{ t('created') }}: {{ version.created_at ? formatLocalDate(version.created_at) : t('unknown') }}
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
              class="p-3 border border-gray-300 rounded-lg cursor-pointer dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
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
              class="p-3 border border-gray-300 rounded-lg cursor-pointer dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
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
              class="p-3 border border-red-300 rounded-lg cursor-pointer dark:border-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
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
          <div v-if="bundleLinkSearchMode && bundleLinkVersions.length === 0" class="py-8 text-center text-gray-500 dark:text-gray-400">
            <div class="mb-2 text-4xl">
              🔍
            </div>
            <div class="font-medium">
              {{ t('no-versions-found') }}
            </div>
            <div class="mt-1 text-sm">
              {{ t('try-a-different-search-term') }}
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<route lang="yaml">
meta:
  layout: app
</route>
