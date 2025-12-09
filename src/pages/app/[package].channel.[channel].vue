<script setup lang="ts">
import type { OrganizationRole } from '~/stores/organization'
import type { Database } from '~/types/supabase.types'
import { onClickOutside } from '@vueuse/core'
import { ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import Settings from '~icons/heroicons/cog-8-tooth'
import IconInformation from '~icons/heroicons/information-circle'
import IconNext from '~icons/ic/round-keyboard-arrow-right'
import IconAlertCircle from '~icons/lucide/alert-circle'
import IconDown from '~icons/material-symbols/keyboard-arrow-down-rounded'
import { formatDate } from '~/services/date'
import { useSupabase } from '~/services/supabase'
import { isInternalVersionName } from '~/services/versions'
import { useAppDetailStore } from '~/stores/appDetail'
import { useDialogV2Store } from '~/stores/dialogv2'
import { useDisplayStore } from '~/stores/display'
import { useOrganizationStore } from '~/stores/organization'

interface Channel {
  version: Database['public']['Tables']['app_versions']['Row']
}

const route = useRoute('/app/[package].channel.[channel]')
const router = useRouter()
const dialogStore = useDialogV2Store()
const displayStore = useDisplayStore()
const organizationStore = useOrganizationStore()
const appDetailStore = useAppDetailStore()
const { t } = useI18n()
const supabase = useSupabase()
const packageId = ref<string>('')
const id = ref<number>(0)
const loading = ref(true)
const channel = ref<Database['public']['Tables']['channels']['Row'] & Channel>()
const role = ref<OrganizationRole | null>(null)

// Auto update dropdown state
const autoUpdateDropdown = useTemplateRef('autoUpdateDropdown')
onClickOutside(autoUpdateDropdown, () => closeAutoUpdateDropdown())

function openBundle() {
  if (!channel.value || channel.value.version.storage_provider === 'revert_to_builtin')
    return
  if (channel.value.version.name === 'unknown')
    return
  router.push(`/app/${route.params.package}/bundle/${channel.value.version.id}`)
}

async function getChannel() {
  if (!id.value)
    return

  // Check if we already have this channel in the store
  if (appDetailStore.currentChannelId === id.value && appDetailStore.currentChannel) {
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

async function reload() {
  await getChannel()
}

async function saveChannelChange(key: string, val: any) {
  if (!organizationStore.hasPermissionsInRole(role.value, ['admin', 'super_admin'])) {
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
    id.value = Number(route.params.channel as string)
    await getChannel()
    loading.value = false
    if (!channel.value?.name)
      displayStore.NavTitle = t('channel')
    displayStore.defaultBack = `/app/${route.params.package}/channels`

    // Load role
    await organizationStore.awaitInitialLoad()
    role.value = await organizationStore.getCurrentRoleForApp(packageId.value)
  }
})

function goToDefaultChannelSettings() {
  router.push(`/app/${route.params.package}/info`)
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

async function openPanel() {
  if (!channel.value)
    return
  if (!organizationStore.hasPermissionsInRole(role.value, ['admin', 'super_admin', 'write'])) {
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
  if (!organizationStore.hasPermissionsInRole(role.value, ['admin', 'super_admin'])) {
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

  if (error)
    console.error(error)

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
                  class="p-1 transition-colors border border-gray-200 rounded-md dark:border-gray-700 hover:bg-gray-50 hover:border-gray-300 dark:hover:border-gray-600 dark:hover:bg-gray-800"
                  @click="() => {}"
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
            <InfoRow :label="t('unlink-bundle')" :is-link="true" @click="openPanel">
              <button class="ml-auto bg-transparent w-7 h-7">
                <IconNext />
              </button>
            </InfoRow>
          </dl>
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
  </div>
</template>

<route lang="yaml">
meta:
  layout: channel
</route>
