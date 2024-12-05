<script setup lang="ts">
import type { Tab } from '~/components/comp_def'
import type { OrganizationRole } from '~/stores/organization'
import type { Database } from '~/types/supabase.types'
import { useDebounceFn } from '@vueuse/core'
import { useI18n } from 'petite-vue-i18n'
import { ref, watch, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import Backward from '~icons/heroicons/backward'
import IconDevice from '~icons/heroicons/device-phone-mobile'
import IconInformations from '~icons/heroicons/information-circle'
import IconNext from '~icons/ic/round-keyboard-arrow-right'
import { urlToAppId } from '~/services/conversion'
import { formatDate } from '~/services/date'
import { useSupabase } from '~/services/supabase'
import { useDisplayStore } from '~/stores/display'
import { useMainStore } from '~/stores/main'
import { useOrganizationStore } from '~/stores/organization'

interface Channel {
  version: Database['public']['Tables']['app_versions']['Row']
  second_version: Database['public']['Tables']['app_versions']['Row']
}
const router = useRouter()
const displayStore = useDisplayStore()
const organizationStore = useOrganizationStore()
const { t } = useI18n()
const route = useRoute('/app/p/[p]/channel/[channel]')
const main = useMainStore()
const supabase = useSupabase()
const packageId = ref<string>('')
const id = ref<number>(0)
const loading = ref(true)
const deviceIds = ref<string[]>([])
const channel = ref<Database['public']['Tables']['channels']['Row'] & Channel>()
const ActiveTab = ref('info')
const secondaryVersionPercentage = ref(50)

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
    label: t('info'),
    icon: IconInformations,
    key: 'info',
  },
  {
    label: t('channel-forced-devices'),
    icon: IconDevice,
    key: 'devices',
  },
]
function openBundle() {
  if (!channel.value || channel.value.version.storage_provider === 'revert_to_builtin')
    return
  if (channel.value.version.name === 'unknown')
    return
  console.log('openBundle', channel.value.version.id)
  router.push(`/app/p/${route.params.p}/bundle/${channel.value.version.id}`)
}

function openSecondBundle() {
  if (!channel.value)
    return
  if (channel.value.second_version.name === 'unknown')
    return
  console.log('openBundle', channel.value.version.id)
  router.push(`/app/p/${route.params.p}/bundle/${channel.value.second_version.id}`)
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
          version (
            id,
            name,
            app_id,
            bucket_id,
            created_at,
            min_update_version,
            storage_provider
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
          updated_at,
          enable_ab_testing,
          enable_progressive_deploy,
          secondary_version_percentage,
          second_version (
            name,
            id,
            min_update_version
          )
        `)
      .eq('id', id.value)
      .single()
    if (error) {
      console.error('no channel', error)
      return
    }

    channel.value = data as unknown as Database['public']['Tables']['channels']['Row'] & Channel
    secondaryVersionPercentage.value = (data.secondary_version_percentage * 100) | 0
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

async function makeDefault(val = true) {
  if (!organizationStore.hasPermisisonsInRole(role.value, ['admin', 'super_admin'])) {
    toast.error(t('no-permission'))
    return
  }
  const buttonMessage = channel.value?.ios && !channel.value.android
    ? t('make-default-ios')
    : channel.value?.android && !channel.value.ios
      ? t('make-default-android')
      : t('channel-make-now')

  displayStore.dialogOption = {
    header: t('are-u-sure'),
    message: val ? t('confirm-public-desc') : t('making-this-channel-'),
    buttons: [
      {
        text: val ? buttonMessage : t('make-normal'),
        id: 'confirm-button',
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
              console.log('error', iosError || hiddenError)
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
              console.log('error', androidError || hiddenError)
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
      {
        text: t('button-cancel'),
        role: 'cancel',
      },
    ],
  }
  displayStore.showDialog = true
  return displayStore.onDialogDismiss()
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
  displayStore.dialogOption = {
    header: t('unlink-bundle'),
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

async function enableAbTesting() {
  if (!organizationStore.hasPermisisonsInRole(role.value, ['admin', 'super_admin'])) {
    toast.error(t('no-permission'))
    return
  }
  if (!channel.value)
    return

  const val = !channel.value.enable_ab_testing

  if (val && channel.value.enable_progressive_deploy) {
    toast.error(t('ab-testing-progressive-deploy-conflict'))
    return
  }

  const { error } = await supabase
    .from('channels')
    .update({ enable_ab_testing: val, second_version: val ? channel.value.version.id : undefined })
    .eq('id', id.value)

  if (error) {
    console.error(error)
  }
  else {
    channel.value.enable_ab_testing = val
    toast.success(val ? t('enabled-ab-testing') : t('disable-ab-testing'))
  }

  await reload()
}

async function enableProgressiveDeploy() {
  if (!organizationStore.hasPermisisonsInRole(role.value, ['admin', 'super_admin'])) {
    toast.error(t('no-permission'))
    return
  }
  if (!channel.value)
    return

  const val = !channel.value.enable_progressive_deploy

  if (val && channel.value.enable_ab_testing) {
    toast.error(t('ab-testing-progressive-deploy-conflict'))
    return
  }

  const { error } = await supabase
    .from('channels')
    .update({ enable_progressive_deploy: val, second_version: val ? channel.value.version.id : undefined })
    .eq('id', id.value)

  if (error) {
    console.error(error)
  }
  else {
    channel.value.enable_progressive_deploy = val
    toast.success(val ? t('enabled-progressive-deploy') : t('disable-progressive-deploy'))
  }

  await reload()
}

const debouncedSetSecondaryVersionPercentage = useDebounceFn(async (percentage: number) => {
  if (!organizationStore.hasPermisisonsInRole(role.value, ['admin', 'super_admin'])) {
    toast.error(t('no-permission'))
    return
  }
  const { error } = await supabase
    .from('channels')
    .update({ secondary_version_percentage: percentage / 100 })
    .eq('id', id.value)

  if (error)
    console.error(error)
}, 500)

async function setSecondaryVersionPercentage(percentage: number) {
  if (channel.value?.enable_progressive_deploy)
    return

  secondaryVersionPercentage.value = percentage
  await debouncedSetSecondaryVersionPercentage(percentage)
}

function onMouseDownSecondaryVersionSlider(event: Event) {
  console.log('onMouseDownSecondaryVersionSlider', secondaryVersionPercentage.value)
  if (!organizationStore.hasPermisisonsInRole(role.value, ['admin', 'super_admin'])) {
    toast.error(t('no-permission'))
    event.preventDefault()
    return
  }

  if (!channel.value?.enable_progressive_deploy) {
    setSecondaryVersionPercentage(secondaryVersionPercentage.value)
  }
  else {
    toast.error(t('progressive-deploy-set-percentage'))
    event.preventDefault()
  }
}

function guardChangeAutoUpdate(event: Event) {
  if (!organizationStore.hasPermisisonsInRole(role.value, ['admin', 'super_admin'])) {
    toast.error(t('no-permission'))
    event.preventDefault()
    return false
  }
}

const getVersion = computed(() => {
  if (channel.value?.secondary_version_percentage !== 1) {
    let label = t('status-failed')
    if (channel.value?.secondary_version_percentage && channel.value?.secondary_version_percentage !== 0) {
      label = `${channel.value?.secondary_version_percentage * 100}%`
    }
    return {
      name: channel.value?.version.name ?? '',
      label,
    }
  }
  else {
    return {
      name: channel.value?.second_version.name,
      label: t('status-complete'),
    }
  }
})

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

function getBundleNumber() {
  if (!channel.value?.enable_ab_testing && !channel.value?.enable_progressive_deploy)
    return channel.value?.version.name
  if (channel.value?.enable_ab_testing && !channel.value?.enable_progressive_deploy)
    return `${channel.value?.version.name} / ${channel.value?.second_version.name}`
  return (channel.value?.secondary_version_percentage !== 1) ? channel.value?.version.name : channel.value?.second_version.name
}

function getProgressivePercentage() {
  if (channel.value?.secondary_version_percentage === 1)
    return t('status-complete')
  if (channel.value?.secondary_version_percentage)
    return `${((channel.value?.secondary_version_percentage * 100) | 0)}%`
  return t('status-failed')
}
</script>

<template>
  <div>
    <Tabs v-model:active-tab="ActiveTab" :tabs="tabs" />
    <div v-if="channel && ActiveTab === 'info'" class="flex flex-col overflow-y-auto h-[calc(100vh-200px)]">
      <div class="flex flex-col overflow-y-auto bg-white shadow-lg border-slate-300 md:mx-auto md:mt-5 md:w-2/3 md:border dark:border-slate-900 md:rounded-lg dark:bg-slate-800">
        <dl class="divide-y dark:divide-slate-500 divide-slate-200">
          <InfoRow :label="t('name')">
            {{ channel.name }}
          </InfoRow>
          <!-- Bundle Number -->
          <template v-if="!channel.enable_ab_testing && !channel.enable_progressive_deploy">
            <InfoRow :label="t('bundle-number')" :is-link="channel && channel.version.storage_provider !== 'revert_to_builtin' && channel.version.name !== 'unknown'">
              <div class="flex items-center">
                <span @click="openBundle()">{{ channel.version.name }}</span>
                <!-- <button v-if="channel && channel.version.storage_provider !== 'revert_to_builtin' && channel.version.name !== 'unknown'" @click="handleRevertToBuiltin()"><Backward class="w-6 h-6 ml-1" /></button>  -->
              </div>
            </InfoRow>
            <InfoRow v-if="channel.disable_auto_update === 'version_number'" :label="t('min-update-version')">
              {{ channel.version.min_update_version ?? t('undefined-fail') }}
            </InfoRow>
          </template>
          <template v-else-if="channel.enable_ab_testing && !channel.enable_progressive_deploy">
            <InfoRow :label="`${t('bundle-number')} A`" :is-link="true" @click="openBundle()">
              {{ channel.version.name }}
            </InfoRow>
            <InfoRow :label="`${t('bundle-number')} B`" :is-link="true" @click="openSecondBundle">
              {{ channel.second_version.name }}
            </InfoRow>
            <template v-if="channel.disable_auto_update === 'version_number'">
              <InfoRow v-if="channel.disable_auto_update === 'version_number'" :label="`${t('min-update-version')} A`">
                {{ channel.version.min_update_version ?? t('undefined-fail') }}
              </InfoRow>
              <InfoRow :label="`${t('min-update-version')} B`">
                {{ channel.second_version.min_update_version ?? t('undefined-fail') }}
              </InfoRow>
            </template>
          </template>
          <template v-else>
            <InfoRow :label="`${t('main-bundle-number')}`" :is-link="true" @click="openBundle()">
              {{ getBundleNumber() }}
            </InfoRow>
            <InfoRow :label="`${t('progressive-bundle-number')}`" :is-link="true" @click="openSecondBundle">
              {{ getBundleNumber() }}
            </InfoRow>
            <InfoRow v-if="channel.enable_progressive_deploy" :label="`${t('progressive-percentage')}`">
              {{ getProgressivePercentage() }}
            </InfoRow>
            <template v-if="channel.disable_auto_update === 'version_number'">
              <InfoRow v-if="channel.disable_auto_update === 'version_number'" :label="`${t('min-update-version')} A`">
                {{ channel.version.min_update_version ?? t('undefined-fail') }}
              </InfoRow>
              <InfoRow :label="`${t('min-update-version')} B`">
                {{ channel.second_version.min_update_version ?? t('undefined-fail') }}
              </InfoRow>
              <InfoRow :label="`${t('main-bundle-number')}`" :is-link="true" @click="openBundle()">
                {{ getVersion.name }}
              </InfoRow>
              <InfoRow :label="`${t('progressive-bundle-number')}`" :is-link="true" @click="openSecondBundle">
                {{ getVersion.name }}
              </InfoRow>
              <InfoRow v-if="channel.enable_progressive_deploy" :label="`${t('progressive-percentage')}`">
                {{ getVersion.label }}
              </InfoRow>
              <template v-if="channel.disable_auto_update === 'version_number'">
                <InfoRow v-if="channel.disable_auto_update === 'version_number'" :label="`${t('min-update-version')} A`">
                  {{ channel.version.min_update_version ?? t('undefined-fail') }}
                </InfoRow>
                <InfoRow :label="`${t('min-update-version')} B`">
                  {{ channel.second_version.min_update_version ?? t('undefined-fail') }}
                </InfoRow>
              </template>
            </template>
          </template>
          <!-- Created At -->
          <InfoRow :label="t('created-at')">
            {{ formatDate(channel.created_at) }}
          </InfoRow>
          <!-- Last Update -->
          <InfoRow :label="t('last-update')">
            {{ formatDate(channel.updated_at) }}
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
              @change="saveChannelChange('disable_auto_update_under_native', !channel?.disable_auto_update)"
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
          <InfoRow :label="t('channel-ab-testing')">
            <Toggle
              :value="channel?.enable_ab_testing"
              @change="enableAbTesting()"
            />
          </InfoRow>
          <InfoRow :label="t('channel-progressive-deploy')">
            <Toggle
              :value="channel?.enable_progressive_deploy"
              @change="enableProgressiveDeploy()"
            />
          </InfoRow>
          <InfoRow v-if="channel.enable_ab_testing || channel.enable_progressive_deploy" :label="`${t('channel-ab-testing-percentage')}: ${secondaryVersionPercentage}%`">
            <div>
              <input v-model="secondaryVersionPercentage" type="range" min="0" max="100" class="range range-info" step="10" @mouseup="onMouseDownSecondaryVersionSlider">
              <div class="w-full px-2 text-xs text-center">
                <span>{{ secondaryVersionPercentage }}%</span>
              </div>
            </div>
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
        // 'translate-y-[-50%] translate-x-[-50%] top-1/2 left-1/2 absolute m-0': deviceIds.length === 0,
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
        <DeviceTable v-if="deviceIds.length > 0" class="p-3" :app-id="channel.version.app_id" :ids="deviceIds" :channel="channel" />
        <template v-else-if="!displayStore.showDialog">
          <div>
            {{ t('forced-devices-not-found') }}
          </div>
        </template>
      </div>
    </div>
  </div>
  <AddDeviceOverwriteButton
    v-if="channel && deviceIds.length === 0 && ActiveTab === 'devices'"
    :app-id="channel.version.app_id"
    :channel="channel"
  />
</template>
