<script setup lang="ts">
import { ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import {
  kList, kListItem,
  kRange,
  kToggle,
} from 'konsta/vue'
import { toast } from 'vue-sonner'
import debounce from 'lodash.debounce'
import { useSupabase } from '~/services/supabase'
import { formatDate } from '~/services/date'
import { useMainStore } from '~/stores/main'
import type { Database } from '~/types/supabase.types'
import { useDisplayStore } from '~/stores/display'
import IconSettings from '~icons/heroicons/cog-6-tooth'
import IconInformations from '~icons/heroicons/information-circle'
import IconUsers from '~icons/heroicons/users-solid'
import IconDevice from '~icons/heroicons/device-phone-mobile'
import type { Tab } from '~/components/comp_def'
import { urlToAppId } from '~/services/conversion'

interface Channel {
  version: Database['public']['Tables']['app_versions']['Row']
  secondVersion: Database['public']['Tables']['app_versions']['Row']
}
const router = useRouter()
const displayStore = useDisplayStore()
const { t } = useI18n()
const route = useRoute()
const main = useMainStore()
const supabase = useSupabase()
const packageId = ref<string>('')
const id = ref<number>(0)
const loading = ref(true)
const deviceIds = ref<string[]>([])
const channel = ref<Database['public']['Tables']['channels']['Row'] & Channel>()
const ActiveTab = ref('info')
const secondaryVersionPercentage = ref(50)

const tabs: Tab[] = [
  {
    label: t('info'),
    icon: IconInformations,
    key: 'info',
  },
  {
    label: t('shared-users'),
    icon: IconUsers,
    key: 'users',
  },
  {
    label: t('devices'),
    icon: IconDevice,
    key: 'devices',
  },
  {
    label: t('settings'),
    icon: IconSettings,
    key: 'settings',
  },
]
function openBundle() {
  if (!channel.value)
    return
  if (channel.value.version.name === 'unknown')
    return
  console.log('openBundle', channel.value.version.id)
  router.push(`/app/p/${route.params.p}/bundle/${channel.value.version.id}`)
}

function openSecondBundle() {
  if (!channel.value)
    return
  if (channel.value.secondVersion.name === 'unknown')
    return
  console.log('openBundle', channel.value.version.id)
  router.push(`/app/p/${route.params.p}/bundle/${channel.value.secondVersion.id}`)
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
            created_at
          ),
          created_at,
          allow_emulator,
          allow_dev,
          allow_device_self_set,
          disableAutoUpdateUnderNative,
          disableAutoUpdateToMajor,
          ios,
          android,
          updated_at,
          enableAbTesting,
          enable_progressive_deploy,
          secondaryVersionPercentage,
          secondVersion (
            name,
            id
          )
        `)
      .eq('id', id.value)
      .single()
    if (error) {
      console.error('no channel', error)
      return
    }

    channel.value = data as unknown as Database['public']['Tables']['channels']['Row'] & Channel
    secondaryVersionPercentage.value = (data.secondaryVersionPercentage * 100) | 0

    // Conversion of type '{ id: number; name: string; public: boolean; version: { id: unknown; name: unknown; app_id: unknown; bucket_id: unknown; created_at: unknown; }[]; created_at: string; allow_emulator: boolean; allow_dev: boolean; allow_device_self_set: boolean; ... 7 more ...; secondVersion: number | null; }' to type '{ allow_dev: boolean; allow_device_self_set: boolean; allow_emulator: boolean; android: boolean; app_id: string; beta: boolean; created_at: string; created_by: string; disableAutoUpdateToMajor: boolean; ... 9 more ...; version: number; } & Channel' may be a mistake because neither type sufficiently overlaps with the other. If this was intentional, convert the expression to 'unknown' first.
    // Type '{ id: number; name: string; public: boolean; version: { id: unknown; name: unknown; app_id: unknown; bucket_id: unknown; created_at: unknown; }[]; created_at: string; allow_emulator: boolean; allow_dev: boolean; allow_device_self_set: boolean; ... 7 more ...; secondVersion: number | null; }' is missing the following properties from type '{ allow_dev: boolean; allow_device_self_set: boolean; allow_emulator: boolean; android: boolean; app_id: string; beta: boolean; created_at: string; created_by: string; disableAutoUpdateToMajor: boolean; ... 9 more ...; version: number; }': app_id, beta, created_byts(2352)
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
  displayStore.actionSheetOption = {
    header: t('are-u-sure'),
    message: val ? t('confirm-public-desc') : t('making-this-channel-'),
    buttons: [
      {
        text: val ? t('channel-make-now') : t('make-normal'),
        id: 'confirm-button',
        handler: async () => {
          if (!channel.value || !id.value)
            return
          const { error } = await supabase
            .from('channels')
            .update({ public: val })
            .eq('id', id.value)
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
  displayStore.showActionSheet = true
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
  displayStore.actionSheetOption = {
    buttons: [
      {
        text: t('unlink-bundle'),
        handler: async () => {
          displayStore.showActionSheet = false
          const id = await getUnknownVersion()
          if (!id)
            return
          saveChannelChange('version', id)
        },
      },
      {
        text: t('button-cancel'),
        role: 'cancel',
        handler: () => {
          // console.log('Cancel clicked')
        },
      },
    ],
  }
  displayStore.showActionSheet = true
}

async function enableAbTesting() {
  if (!channel.value)
    return

  const val = !channel.value.enableAbTesting

  if (val && channel.value.enable_progressive_deploy) {
    toast.error(t('ab-testing-progressive-deploy-conflict'))
    return
  }

  const { error } = await supabase
    .from('channels')
    .update({ enableAbTesting: val, secondVersion: val ? channel.value.version.id : undefined })
    .eq('id', id.value)

  if (error) {
    console.error(error)
  }
  else {
    channel.value.enableAbTesting = val
    toast.success(val ? t('enabled-ab-testing') : t('disable-ab-testing'))
  }
}

async function enableProgressiveDeploy() {
  if (!channel.value)
    return

  const val = !channel.value.enable_progressive_deploy

  if (val && channel.value.enableAbTesting) {
    toast.error(t('ab-testing-progressive-deploy-conflict'))
    return
  }

  const { error } = await supabase
    .from('channels')
    .update({ enable_progressive_deploy: val, secondVersion: val ? channel.value.version.id : undefined })
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

const debouncedSetSecondaryVersionPercentage = debounce (async (percentage: number) => {
  const { error } = await supabase
    .from('channels')
    .update({ secondaryVersionPercentage: percentage / 100 })
    .eq('id', id.value)

  if (error)
    console.error(error)
}, 500, { leading: true, trailing: true, maxWait: 500 })

const debouncedInformAboutProgressiveDeployPercentageSet = debounce(() => {
  toast.error(t('progressive-deploy-set-percentage'))
}, 500, { leading: true, trailing: true, maxWait: 500 })

async function setSecondaryVersionPercentage(percentage: number) {
  if (channel.value?.enable_progressive_deploy)
    return

  secondaryVersionPercentage.value = percentage
  await debouncedSetSecondaryVersionPercentage(percentage)
}

function onMouseDownSecondaryVersionSlider(event: MouseEvent) {
  if (channel.value?.enable_progressive_deploy) {
    debouncedInformAboutProgressiveDeployPercentageSet()
    event.preventDefault()
  }
}
</script>

<template>
  <div>
    <Tabs v-model:active-tab="ActiveTab" :tabs="tabs" />
    <div v-if="channel && ActiveTab === 'info'" class="flex flex-col">
      <div class="flex flex-col overflow-y-auto bg-white shadow-lg border-slate-200 md:mx-auto md:mt-5 md:w-2/3 md:border dark:border-slate-900 md:rounded-lg dark:bg-slate-800">
        <dl class="divide-y divide-gray-500">
          <InfoRow :label="t('name')" :value="channel.name" />
          <!-- Bundle Number -->
          <InfoRow v-if="!channel.enableAbTesting && !channel.enable_progressive_deploy" :label="t('bundle-number')" :value="channel.version.name" :is-link="true" @click="openBundle()" />
          <template v-else-if="channel.enableAbTesting && !channel.enable_progressive_deploy">
            <InfoRow :label="`${t('bundle-number')} A`" :value="channel.version.name" :is-link="true" @click="openBundle" />
            <InfoRow :label="`${t('bundle-number')} B`" :value="channel.secondVersion.name" :is-link="true" @click="openSecondBundle" />
          </template>
          <template v-else>
            <InfoRow :label="`${t('main-bundle-number')}`" :value="(channel.secondaryVersionPercentage !== 1) ? channel.version.name : channel.secondVersion.name" :is-link="true" @click="openBundle" />
            <InfoRow :label="`${t('progressive-bundle-number')}`" :value="(channel.secondaryVersionPercentage !== 1) ? channel.secondVersion.name : channel.version.name" :is-link="true" @click="openSecondBundle" />
            <InfoRow v-id="channel.enable_progressive_deploy" :label="`${t('progressive-percentage')}`" :value="(channel.secondaryVersionPercentage === 1) ? t('status-complete') : (channel.secondaryVersionPercentage !== 0 ? `${((channel.secondaryVersionPercentage * 100) | 0)}%` : t('status-failed'))" />
          </template>
          <!-- Created At -->
          <InfoRow :label="t('created-at')" :value="formatDate(channel.created_at)" />
          <!-- Last Update -->
          <InfoRow :label="t('last-update')" :value="formatDate(channel.updated_at)" />
        </dl>
      </div>
    </div>
    <div v-if="channel && ActiveTab === 'settings'" class="flex flex-col">
      <div class="flex flex-col overflow-y-auto bg-white shadow-lg border-slate-200 md:mx-auto md:mt-5 md:w-2/3 md:border dark:border-slate-900 md:rounded-lg dark:bg-slate-800">
        <dl class="divide-y divide-gray-500">
          <k-list class="w-full mt-5 list-none border-t border-gray-200">
            <k-list-item label :title="t('channel-is-public')" class="text-lg text-gray-700 dark:text-gray-200">
              <template #after>
                <k-toggle
                  class="-my-1 k-color-success"
                  component="div"
                  :checked="channel?.public"
                  @change="() => (makeDefault(!channel?.public))"
                />
              </template>
            </k-list-item>
            <k-list-item label title="iOS" class="text-lg text-gray-700 dark:text-gray-200">
              <template #after>
                <k-toggle
                  class="-my-1 k-color-success"
                  component="div"
                  :checked="channel?.ios"
                  @change="saveChannelChange('ios', !channel?.ios)"
                />
              </template>
            </k-list-item>
            <k-list-item label title="Android" class="text-lg text-gray-700 dark:text-gray-200">
              <template #after>
                <k-toggle
                  class="-my-1 k-color-success"
                  component="div"
                  :checked="channel?.android"
                  @change="saveChannelChange('android', !channel?.android)"
                />
              </template>
            </k-list-item>
            <k-list-item label :title="t('disable-auto-downgra')" class="text-lg text-gray-700 dark:text-gray-200">
              <template #after>
                <k-toggle
                  class="-my-1 k-color-success"
                  component="div"
                  :checked="channel?.disableAutoUpdateUnderNative"
                  @change="saveChannelChange('disableAutoUpdateUnderNative', !channel?.disableAutoUpdateUnderNative)"
                />
              </template>
            </k-list-item>
            <k-list-item label :title="t('disable-auto-upgrade')" class="text-lg text-gray-700 dark:text-gray-200">
              <template #after>
                <k-toggle
                  class="-my-1 k-color-success"
                  component="div"
                  :checked="channel?.disableAutoUpdateToMajor"
                  @change="saveChannelChange('disableAutoUpdateToMajor', !channel?.disableAutoUpdateToMajor)"
                />
              </template>
            </k-list-item>
            <k-list-item label :title="t('allow-develoment-bui')" class="text-lg text-gray-700 dark:text-gray-200">
              <template #after>
                <k-toggle
                  class="-my-1 k-color-success"
                  component="div"
                  :checked="channel?.allow_dev"
                  @change="saveChannelChange('allow_dev', !channel?.allow_dev)"
                />
              </template>
            </k-list-item>
            <k-list-item label :title="t('allow-emulator')" class="text-lg text-gray-700 dark:text-gray-200">
              <template #after>
                <k-toggle
                  class="-my-1 k-color-success"
                  component="div"
                  :checked="channel?.allow_emulator"
                  @change="saveChannelChange('allow_emulator', !channel?.allow_emulator)"
                />
              </template>
            </k-list-item>
            <k-list-item label :title="t('allow-device-to-self')" class="text-lg text-gray-700 dark:text-gray-200">
              <template #after>
                <k-toggle
                  class="-my-1 k-color-success"
                  component="div"
                  :checked="channel?.allow_device_self_set"
                  @change="saveChannelChange('allow_device_self_set', !channel?.allow_device_self_set)"
                />
              </template>
            </k-list-item>
            <k-list-item label :title="t('channel-ab-testing')" class="text-lg text-gray-700 dark:text-gray-200">
              <template #after>
                <k-toggle
                  class="-my-1 k-color-success"
                  component="div"
                  :checked="channel?.enableAbTesting"
                  @change="enableAbTesting()"
                />
              </template>
            </k-list-item>
            <k-list-item label :title="t('channel-progressive-deploy')" class="text-lg text-gray-700 dark:text-gray-200">
              <template #after>
                <k-toggle
                  class="-my-1 k-color-success"
                  component="div"
                  :checked="channel?.enable_progressive_deploy"
                  @change="enableProgressiveDeploy()"
                />
              </template>
            </k-list-item>
            <k-list-item label :title="`${t('channel-ab-testing-percentage')}: ${secondaryVersionPercentage}%`" class="text-lg text-gray-700 dark:text-gray-200">
              <template #after>
                <k-range
                  :value="secondaryVersionPercentage"
                  class="-my-1 k-color-success"
                  component="div"
                  :step="5"
                  @input="(e: any) => (setSecondaryVersionPercentage(parseInt(e.target.value, 10)))"
                  @mousedown="onMouseDownSecondaryVersionSlider"
                />
              </template>
            </k-list-item>
            <k-list-item label :title="t('unlink-bundle')" class="text-lg text-red-500" link @click="openPannel" />
          </k-list>
        </dl>
      </div>
    </div>
    <div v-if="channel && ActiveTab === 'users'" class="flex flex-col">
      <div class="flex flex-col overflow-y-auto bg-white shadow-lg border-slate-200 md:mx-auto md:mt-5 md:w-2/3 md:border dark:border-slate-900 md:rounded-lg dark:bg-gray-800">
        <SharedUserTable allow-add class="p-3" :app-id="channel.version.app_id" :channel-id="id" />
      </div>
    </div>
    <div v-if="channel && ActiveTab === 'devices'" class="flex flex-col">
      <div class="flex flex-col overflow-y-auto bg-white shadow-lg border-slate-200 md:mx-auto md:mt-5 md:w-2/3 md:border dark:border-slate-900 md:rounded-lg dark:bg-gray-800">
        <DeviceTable class="p-3" :app-id="channel.version.app_id" :channel-id="id" :ids="deviceIds" />
      </div>
    </div>
  </div>
</template>
