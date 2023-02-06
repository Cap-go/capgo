<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import copy from 'copy-text-to-clipboard'
import { Capacitor } from '@capacitor/core'
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
  <div v-if="version" class="h-full p-8 overflow-y-scroll">
    <div class="">
      <div class="mx-auto w-full px-6 lg:px-8 max-w-7xl">
        <div class="flex items-center justify-center">
          <div class="">
            <nav class="flex md:flex-wrap -mb-px space-x-10">
              <button class="inline-flex items-center text-lg font-medium text-gray-500 dark:text-gray-200 transition-all duration-200 mt-0 w-auto border-transparent border-b-2 py-4 hover:text-gray-900 hover:border-gray-300 dark:hover:text-gray-500 dark:hover:border-gray-100 whitespace-nowrap group" :class="!showDevices ? 'bg-gray-200/70 dark:bg-gray-600/70 px-2 rounded-lg hover:border-0 duration-0' : ''" @click="showDevices = false">
                <IconInformations class="-ml-0.5 mr-2 text-gray-400 group-hover:text-gray-600 h-5 w-5 transition-all duration-100" />
                {{ t('channel.info') }}
              </button>

              <button class="inline-flex items-center text-lg font-medium text-gray-500 dark:text-gray-200 transition-all duration-200 mt-0 w-auto border-transparent border-b-2 py-4 hover:text-gray-900 hover:border-gray-300 dark:hover:text-gray-500 dark:hover:border-gray-100 whitespace-nowrap group" :class="showDevices ? 'bg-gray-200/70 dark:bg-gray-600/70 px-2 rounded-lg hover:border-0 duration-0' : ''" @click="showDevices = true">
                <IconDevice class="-ml-0.5 mr-2 text-gray-400 group-hover:text-gray-600 h-5 w-5 transition-all duration-100" />
                {{ t('devices.title') }}
              </button>
            </nav>
          </div>
        </div>
      </div>
    </div>

    <div v-if="!showDevices" id="informations" class="mt-5">
      <InfoRow :label="t('bundle-number')" :value="version.name" />
      <InfoRow :label="t('id')" :value="version.id.toString()" />
      <InfoRow v-if="version.created_at" :label="t('device.created_at')" :value="formatDate(version.created_at)" />
      <InfoRow v-if="version.updated_at" :label="t('updated-at')" :value="formatDate(version.updated_at)" />
      <!-- Checksum -->
      <InfoRow v-if="version.checksum" :label="t('checksum')" :value="version.checksum" />
      <!-- meta devices -->
      <InfoRow v-if="version_meta?.devices" :label="t('devices.title')" :value="version_meta.devices.toString()" />
      <!-- session_key -->
      <InfoRow v-if="version.session_key" :label="t('session_key')" :value="hideString(version.session_key)" :is-link="true" @click="copyToast(version?.session_key || '')" />
      <!-- version.external_url -->
      <InfoRow v-if="version.external_url" :label="t('url')" :value="version.external_url" :is-link="true" @click="copyToast(version?.external_url || '')" />
      <!-- size -->
      <InfoRow :label="t('size')" :value="showSize" />
      <!-- settings -->
      <InfoRow :label="t('settings')" :value="t('open-settings')" :is-link="true" @click="openPannel" />
    </div>
    <div v-else id="devices" class="flex flex-col">
      <input v-model="search" class="w-full mt-3 px-5 py-3 border-b border-slate-100 dark:bg-gray-800 dark:border-slate-900 dark:text-gray-400" type="text" placeholder="Search">
      <div class="inline-block min-w-full overflow-y-scroll align-middle">
        <table v-if="devicesFilter.length > 0" class="hidden md:table h-full w-full lg:divide-y lg:divide-gray-200 mb-5">
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
        <k-list v-if="devicesFilter.length > 0" class="md:hidden w-full my-0 list-none">
          <DeviceCard v-for="(device, i) in devicesFilter" :key="device.device_id + i" :device="device" />
        </k-list>
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
