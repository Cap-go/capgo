<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import copy from 'copy-text-to-clipboard'
import { Capacitor } from '@capacitor/core'
import {
  kBlockTitle, kList, kListItem,
  kSegmented,
  kSegmentedButton,
} from 'konsta/vue'
import ellipsisHorizontalCircle from '~icons/heroicons/plus'
import { useSupabase } from '~/services/supabase'
import { formatDate } from '~/services/date'
import TitleHead from '~/components/TitleHead.vue'
import { openVersion } from '~/services/versions'
import { useMainStore } from '~/stores/main'
import type { Database } from '~/types/supabase.types'
import { bytesToMbText } from '~/services/conversion'
import { useDisplayStore } from '~/stores/display'
import IconDevice from '~icons/heroicons/device-phone-mobile'
import IconInformations from '~icons/heroicons/information-circle'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const displayStore = useDisplayStore()
const main = useMainStore()
const supabase = useSupabase()
const packageId = ref<string>('')
const id = ref<number>()
const loading = ref(true)
const version = ref<Database['public']['Tables']['app_versions']['Row']>()
const channels = ref<(Database['public']['Tables']['channels']['Row'])[]>([])
const version_meta = ref<Database['public']['Tables']['app_versions_meta']['Row']>()
const search = ref('')
const devices = ref<Database['public']['Tables']['devices']['Row'][]>([])
const showDevices = ref(false)

const copyToast = async (text: string) => {
  copy(text)
  displayStore.messageToast.push(t('copied-to-clipboard'))
}
const getDevices = async () => {
  if (!version.value)
    return
  try {
    const { data: dataDevices } = await supabase
      .from('devices')
      .select()
      .eq('version', id.value)
      .eq('app_id', version.value.app_id)
    if (dataDevices && dataDevices.length)
      devices.value = dataDevices
    else
      devices.value = []
  }
  catch (error) {
    console.error(error)
  }
}
const getChannels = async () => {
  if (!version.value)
    return
  const { data: dataChannel } = await supabase
    .from('channels')
    .select()
    .eq('app_id', version.value.app_id)
    .order('updated_at', { ascending: false })
  channels.value = dataChannel || channels.value
}

const openDevice = async (device: Database['public']['Tables']['devices']['Row']) => {
  router.push(`/app/p/${device.app_id.replace(/\./g, '--')}/d/${device.device_id}`)
}

const showSize = computed(() => {
  if (version_meta.value?.size)
    return bytesToMbText(version_meta.value.size)
  else if (version.value?.external_url)
    return t('package.externally')
  else
    return t('package.not_available')
})
const setChannel = async (channel: Database['public']['Tables']['channels']['Row']) => {
  if (!version.value)
    return
  return supabase
    .from('channels')
    .update({
      version: version.value.id,
    })
    .eq('id', channel.id)
}
const ASChannelChooser = async () => {
  if (!version.value)
    return
  const buttons = []
  for (const channel of channels.value) {
    buttons.push({
      text: channel.name,
      handler: async () => {
        try {
          await setChannel(channel)
        }
        catch (error) {
          console.error(error)
          displayStore.messageToast.push(t('cannot-test-app-some'))
        }
      },
    })
  }
  buttons.push({
    text: t('button.cancel'),
    role: 'cancel',
    handler: () => {
      // console.log('Cancel clicked')
    },
  })
  displayStore.actionSheetOption = {
    header: t('package.link_channel'),
    buttons,
  }
  displayStore.showActionSheet = true
}
const openPannel = async () => {
  if (!version.value || !main.auth)
    return
  displayStore.actionSheetOption = {
    buttons: [
      {
        text: Capacitor.isNativePlatform() ? t('package.test') : t('package.download'),
        handler: () => {
          displayStore.showActionSheet = false
          if (!version.value)
            return
          openVersion(version.value, main.user?.id || '')
        },
      },
      {
        text: t('package.set'),
        handler: () => {
          displayStore.showActionSheet = false
          ASChannelChooser()
        },
      },
      {
        text: t('button.cancel'),
        role: 'cancel',
        handler: () => {
          // console.log('Cancel clicked')
        },
      },
    ],
  }
  displayStore.showActionSheet = true
}

const getVersion = async () => {
  if (!id.value)
    return
  try {
    const { data } = await supabase
      .from('app_versions')
      .select()
      .eq('app_id', packageId.value)
      .eq('id', id.value)
      .single()
    const { data: dataVersionsMeta } = await supabase
      .from('app_versions_meta')
      .select()
      .eq('id', id.value)
      .single()
    if (!data) {
      console.error('no version found')
      router.back()
      return
    }
    if (dataVersionsMeta)
      version_meta.value = dataVersionsMeta

    version.value = data
  }
  catch (error) {
    console.error(error)
  }
}
watchEffect(async () => {
  if (route.path.includes('/bundle/')) {
    loading.value = true
    packageId.value = route.params.p as string
    packageId.value = packageId.value.replace(/--/g, '.')
    id.value = Number(route.params.bundle as string)
    await getVersion()
    await getChannels()
    await getDevices()
    loading.value = false
  }
})

const hideString = (str: string) => {
  const first = str.slice(0, 5)
  const last = str.slice(-5)
  return `${first}...${last}`
}

const devicesFilter = computed(() => {
  const value = search.value
  if (value) {
    const filtered = devices.value.filter(device => device.device_id.toLowerCase().includes(value.toLowerCase()))
    return filtered
  }
  return devices.value
})
</script>

<template>
  <TitleHead :title="t('package.title')" color="warning" :default-back="`/app/package/${route.params.p}`" :plus-icon="ellipsisHorizontalCircle" @plus-click="openPannel" />
  <div class="h-full md:hidden">
    <k-segmented strong rounded class="mx-auto mt-6 sm:w-max-80 sm:mt-8 text-gray-600 dark:text-gray-100">
      <k-segmented-button
        class="h-10"
        :active="!showDevices"
        @click="() => (showDevices = false)"
      >
        {{ t('device.info') }}
      </k-segmented-button>
      <k-segmented-button
        class="h-10"
        :active="showDevices"
        @click="() => (showDevices = true)"
      >
        {{ t('devices.title') }}
      </k-segmented-button>
    </k-segmented>
    <k-block-title v-if="!showDevices" class="text-gray-600 dark:text-gray-100">
      {{ t('informations').toLocaleUpperCase() }}
    </k-block-title>
    <k-list v-if="version && !showDevices" class="h-full pb-16 overflow-y-scroll" strong-ios outline-ios>
      <k-list-item
        :title="t('bundle-number')"
        :after="version.name"
      />
      <k-list-item
        :title="t('id')"
        :after="version.id"
      />
      <k-list-item
        v-if="version.created_at"
        :title="t('device.created_at')"
        :after="formatDate(version.created_at)"
      />
      <k-list-item
        v-if="version.updated_at"
        :title="t('updated-at')"
        :after="formatDate(version.updated_at)"
      />
      <k-list-item
        v-if="version.checksum"
        :title="t('checksum')"
        :after="formatDate(version.checksum)"
      />
      <k-list-item
        v-if="version_meta?.devices"
        :title="t('devices.title')"
        :after="version_meta?.devices"
      />
      <k-list-item
        v-if="version.session_key"
        :title="t('session_key')"
        :after="hideString(version.session_key)"
        @click="() => copyToast(version?.session_key || '')"
      />
      <k-list-item
        v-if="version.external_url"
        :title="t('url')"
        :after="version.external_url"
        @click="() => copyToast(version?.external_url || '')"
      />
      <k-list-item
        v-else
        :title="t('size')"
        :after="showSize"
      />
      <k-list-item
        :title="t('settings')"
        link
        @click="openPannel"
      />
    </k-list>

    <k-block-title v-if="showDevices" class="text-gray-600 dark:text-gray-100">
      {{ t('devices.title').toLocaleUpperCase() }}
    </k-block-title>
    <input v-model="search" class="w-full px-5 py-3 border-b border-slate-100 dark:bg-gray-800 dark:border-slate-900 dark:text-gray-400" type="text" placeholder="Search">

    <div v-if="devicesFilter.length > 0" class="h-[70vh]">
      <k-list v-if="showDevices" class="overflow-y-auto h-full" strong-ios outline-ios>
        <k-list-item
          v-for="device in devicesFilter"
          :key="device.device_id"
          class="cursor-pointer"
          :title="`${device.device_id}`"
          :footer="`${device.platform}`"
          :after="formatDate(device.created_at || '')"
          link
          @click="openDevice(device)"
        />
      </k-list>
    </div>
    <div v-else class="text-center text-2xl mt-3">
      {{ t('no-devices') }}
    </div>
  </div>
  <div v-if="version" class="hidden md:block h-full p-8 overflow-y-scroll">
    <div class="">
      <div class="px-4 mx-auto sm:px-6 lg:px-8 max-w-7xl">
        <div class="flex items-center justify-center">
          <div class="">
            <nav class="flex flex-wrap -mb-px sm:space-x-10">
              <button class="inline-flex items-center w-1/2 mt-5 text-lg font-medium text-gray-500 dark:text-gray-200 transition-all duration-200 sm:mt-0 sm:w-auto sm:border-transparent sm:border-b-2 sm:py-4 hover:text-gray-900 hover:border-gray-300 dark:hover:text-gray-500 dark:hover:border-gray-100 whitespace-nowrap group" :class="!showDevices ? 'bg-gray-200/70 dark:bg-gray-600/70 px-2 rounded-lg hover:border-0 duration-0' : ''" @click="showDevices = false">
                <IconInformations class="-ml-0.5 mr-2 text-gray-400 group-hover:text-gray-600 h-5 w-5 transition-all duration-100" />

                {{ t('informations') }}
              </button>

              <button class="inline-flex items-center w-1/2 mt-5 text-lg font-medium text-gray-500 dark:text-gray-200 transition-all duration-200 sm:mt-0 sm:w-auto sm:border-transparent sm:border-b-2 sm:py-4 hover:text-gray-900 hover:border-gray-300 dark:hover:text-gray-500 dark:hover:border-gray-100 whitespace-nowrap group" :class="showDevices ? 'bg-gray-200/70 dark:bg-gray-600/70 px-2 rounded-lg hover:border-0 duration-0' : ''" @click="showDevices = true">
                <IconDevice class="-ml-0.5 mr-2 text-gray-400 group-hover:text-gray-600 h-5 w-5 transition-all duration-100" />
                {{ t('devices.title') }}
              </button>
            </nav>
          </div>
        </div>
      </div>
    </div>

    <div v-if="!showDevices" id="informations" class="">
      <div class="mt-5 border-t border-gray-200">
        <dl class="sm:divide-y sm:divide-gray-200">
          <div class="py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:py-5">
            <dt class="text-lg font-medium text-gray-700 dark:text-gray-200">
              {{ t('bundle-number') }}
            </dt>
            <dd class="mt-1 text-lg text-gray-600 dark:text-gray-200 sm:col-span-2 sm:mt-0">
              {{ version.name }}
            </dd>
          </div>
          <div class="py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:py-5">
            <dt class="text-lg font-medium text-gray-700 dark:text-gray-200">
              {{ t('id') }}
            </dt>
            <dd class="mt-1 text-lg text-gray-600 dark:text-gray-200 sm:col-span-2 sm:mt-0">
              {{ version.id }}
            </dd>
          </div>
          <div v-if="version.created_at" class="py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:py-5">
            <dt class="text-lg font-medium text-gray-700 dark:text-gray-200">
              {{ t('device.created_at') }}
            </dt>
            <dd class="mt-1 text-lg text-gray-600 dark:text-gray-200 sm:col-span-2 sm:mt-0">
              {{ formatDate(version.created_at) }}
            </dd>
          </div>
          <div v-if="version.updated_at" class="py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:py-5">
            <dt class="text-lg font-medium text-gray-700 dark:text-gray-200">
              {{ t('updated-at') }}
            </dt>
            <dd class="mt-1 text-lg text-gray-600 dark:text-gray-200 sm:col-span-2 sm:mt-0">
              {{ formatDate(version.updated_at) }}
            </dd>
          </div>
          <div v-if="version.checksum" class="py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:py-5">
            <dt class="text-lg font-medium text-gray-700 dark:text-gray-200">
              {{ t('checksum') }}
            </dt>
            <dd class="mt-1 text-lg text-gray-600 dark:text-gray-200 sm:col-span-2 sm:mt-0">
              {{ version.checksum }}
            </dd>
          </div>
          <div v-if="version_meta?.devices" class="py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:py-5">
            <dt class="text-lg font-medium text-gray-700 dark:text-gray-200">
              {{ t('devices.title') }}
            </dt>
            <dd class="mt-1 text-lg text-gray-600 dark:text-gray-200 sm:col-span-2 sm:mt-0">
              {{ version_meta.devices }}
            </dd>
          </div>
          <div v-if="version.session_key" class="cursor-pointer py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:py-5" @click="copyToast(version?.session_key || '')">
            <dt class="text-lg font-medium text-gray-700 dark:text-gray-200">
              {{ t('session_key') }}
            </dt>
            <dd class="mt-1 text-lg text-gray-600 dark:text-gray-200 sm:col-span-2 sm:mt-0">
              {{ hideString(version.session_key) }}
            </dd>
          </div>
          <div v-if="version.external_url" class="cursor pointer py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:py-5" @click="copyToast(version?.external_url || '')">
            <dt class="text-lg font-medium text-gray-700 dark:text-gray-200">
              {{ t('url') }}
            </dt>
            <dd class="mt-1 text-lg text-gray-600 dark:text-gray-200 sm:col-span-2 sm:mt-0">
              {{ version.external_url }}
            </dd>
          </div>
          <div v-else class="py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:py-5">
            <dt class="text-lg font-medium text-gray-700 dark:text-gray-200">
              {{ t('size') }}
            </dt>
            <dd class="mt-1 text-lg text-gray-600 dark:text-gray-200 sm:col-span-2 sm:mt-0">
              {{ showSize }}
            </dd>
          </div>
          <div class="cursor-pointer py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:py-5" @click="openPannel">
            <dt class="text-lg font-medium text-gray-700 dark:text-gray-200">
              {{ t('settings') }}
            </dt>
            <dd class="mt-1 text-lg text-gray-600 dark:text-gray-200 sm:col-span-2 sm:mt-0">
              {{ t('open-settings') }}
            </dd>
          </div>
        </dl>
      </div>
    </div>
    <div v-else id="devices" class="flex flex-col py-6">
      <div class="inline-block min-w-full overflow-y-scroll align-middle">
        <input v-model="search" class="w-full px-5 py-3 border-b border-slate-100 dark:bg-gray-800 dark:border-slate-900 dark:text-gray-400" type="text" placeholder="Search">
        <table v-if="devicesFilter.length > 0" class="h-full w-full lg:divide-y lg:divide-gray-200 mb-5">
          <thead class="sticky top-0 hidden bg-white lg:table-header-group dark:bg-gray-900/90">
            <tr>
              <th class="py-3.5 pl-4 pr-3 text-left text-xl whitespace-nowrap font-medium text-gray-700 dark:text-gray-200 sm:pl-6 md:pl-0">
                <div class="flex items-center">
                  {{ t('device-id') }}
                </div>
              </th>
              <th class="py-3.5 px-3 text-left text-xl whitespace-nowrap font-medium text-gray-700 dark:text-gray-200">
                <div class="flex items-center">
                  {{ t('device.platform') }}
                </div>
              </th>
              <th class="py-3.5 px-3 text-left text-xl whitespace-nowrap font-medium text-gray-700 dark:text-gray-200">
                <div class="flex items-center">
                  {{ t('device.os_version') }}
                </div>
              </th>
              <th class="py-3.5 px-3 text-left text-xl whitespace-nowrap font-medium text-gray-700 dark:text-gray-200">
                <div class="flex items-center">
                  {{ t('device.created_at') }}
                </div>
              </th>
            </tr>
          </thead>
          <tbody class="w-full divide-y divide-gray-200 max-h-fit">
            <tr v-for="(device, i) in devicesFilter" :key="i" class="w-full cursor-pointer" @click="openDevice(device)">
              <td class="hidden py-4 pl-4 pr-3 text-lg font-medium text-gray-700 dark:text-gray-200 lg:table-cell whitespace-nowrap sm:pl-6 md:pl-0">
                {{ device.device_id }}
              </td>
              <td class="hidden px-4 py-4 text-lg font-bold text-gray-700 dark:text-gray-200 lg:table-cell whitespace-nowrap">
                {{ device.platform }}
              </td>
              <td class="hidden px-4 py-4 text-lg font-medium text-gray-700 dark:text-gray-200 lg:table-cell whitespace-nowrap">
                {{ device.os_version || 'Unknown' }}
              </td>
              <td class="hidden px-4 py-4 text-lg font-medium text-gray-700 dark:text-gray-200 lg:table-cell whitespace-nowrap">
                {{ formatDate(device.created_at || '') }}
              </td>
            </tr>
          </tbody>
        </table>
        <div v-else class="text-center text-2xl mt-3">
          {{ t('no-devices') }}
        </div>
      </div>
    </div>
  </div>
</template>

<style>
  #confirm-button {
    background-color: theme('colors.red.500');
    color: theme('colors.white');
  }
</style>
