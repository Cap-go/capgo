<script setup lang="ts">
import {
  kList, kListItem,
} from 'konsta/vue'
import { computed, ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { gt } from 'semver'
import { vInfiniteScroll } from '@vueuse/components'
import { formatDate } from '~/services/date'
import { useSupabase } from '~/services/supabase'
import TitleHead from '~/components/TitleHead.vue'
import type { Database } from '~/types/supabase.types'
import { useMainStore } from '~/stores/main'
import { useDisplayStore } from '~/stores/display'
import Spinner from '~/components/Spinner.vue'
import IconLog from '~icons/heroicons/document'
import IconInformations from '~icons/heroicons/information-circle'

interface Device {
  version: Database['public']['Tables']['app_versions']['Row']
}
interface Channel {
  version: Database['public']['Tables']['app_versions']['Row']
}
interface ChannelDev {
  channel_id: Database['public']['Tables']['channels']['Row'] & Channel
}

interface Stat {
  version: {
    name: string
  }
}
const fetchLimit = 40
let fetchOffset = 0
const isDisabled = ref(false)
const displayStore = useDisplayStore()
const { t } = useI18n()
const main = useMainStore()
const route = useRoute()
const supabase = useSupabase()
const packageId = ref<string>('')
const search = ref<string>('')
const id = ref<string>()
const showLog = ref(false)
const isLoading = ref(true)
const isLoadingSub = ref(true)
const device = ref<Database['public']['Tables']['devices']['Row'] & Device>()
const logs = ref<(Database['public']['Tables']['stats']['Row'] & Stat)[]>([])
const filtered = ref<(Database['public']['Tables']['stats']['Row'] & Stat)[]>([])
const deviceOverride = ref<Database['public']['Tables']['devices_override']['Row'] & Device>()
const channels = ref<(Database['public']['Tables']['channels']['Row'] & Channel)[]>([])
const versions = ref<Database['public']['Tables']['app_versions']['Row'][]>([])
const channelDevice = ref<Database['public']['Tables']['channel_devices']['Row'] & ChannelDev>()

const logFiltered = computed(() => {
  if (search.value)
    return filtered.value

  return logs.value
})

const getVersion = async () => {
  try {
    const { data, error } = await supabase
      .from('app_versions')
      .select()
      .eq('app_id', packageId.value)
      .eq('deleted', false)
      .order('created_at', { ascending: false })
    if (error) {
      console.error('getVersion', error)
      return
    }
    versions.value = data || versions.value
  }
  catch (error) {
    console.error(error)
  }
}
const getChannels = async () => {
  try {
    const { data, error } = await supabase
      .from('channels')
      .select(`
        id,
        name,
        created_at,
        updated_at
      `)
      .eq('app_id', packageId.value)
    if (error) {
      console.error('getChannels', error)
      return
    }
    channels.value = (data || []) as (Database['public']['Tables']['channels']['Row'] & Channel)[]
  }
  catch (error) {
    console.error(error)
  }
}
const onSearchLog = async (e: Event) => {
  e.preventDefault()
  const val = (e.target as HTMLInputElement).value
  if (val == null) {
    search.value = ''
    return
  }
  search.value = val
  isLoadingSub.value = true
  const { data: dataStats } = await supabase
    .from('stats')
    .select(`
        device_id,
        action,
        platform,
        version_build,
        version (
            name
        ),
        created_at,
        updated_at
      `)
    .eq('device_id', id.value)
    .order('created_at', { ascending: false })
    .like('action', `%${search.value}%`)
  filtered.value = (dataStats || []) as (Database['public']['Tables']['stats']['Row'] & Stat)[]
  isLoadingSub.value = false
}

const loadStatsData = async () => {
  isLoadingSub.value = true
  try {
    // create a date object for the last day of the previous month with dayjs
    const { data: dataStats } = await supabase
      .from('stats')
      .select(`
        device_id,
        action,
        platform,
        version_build,
        version (
            name
        ),
        created_at,
        updated_at
      `)
      .eq('device_id', id.value)
      .order('created_at', { ascending: false })
      .range(fetchOffset, fetchOffset + fetchLimit - 1)
    if (!dataStats)
      return
    logs.value.push(...dataStats as (Database['public']['Tables']['stats']['Row'] & Stat)[])
    if (dataStats.length === fetchLimit)
      fetchOffset += fetchLimit
    else
      isDisabled.value = true
  }
  catch (error) {
    console.error(error)
  }
  isLoadingSub.value = false
}
const getChannelOverride = async () => {
  const { data, error } = await supabase
    .from('channel_devices')
    .select(`
      device_id,
      app_id,
      channel_id (
        name,
        version (
          name
        )
      ),
      created_at,
      updated_at
    `)
    .eq('app_id', packageId.value)
    .eq('device_id', id.value)
    .single()
  if (error) {
    console.error('getChannelOverride', error)
    return
  }
  channelDevice.value = (data || undefined) as Database['public']['Tables']['channel_devices']['Row'] & ChannelDev
}
const getDeviceOverride = async () => {
  const { data, error } = await supabase
    .from('devices_override')
    .select(`
      device_id,
      app_id,
      version (
          name
      ),
      created_at,
      updated_at
    `)
    .eq('app_id', packageId.value)
    .eq('device_id', id.value)
    .single()
  if (error) {
    console.error('getDeviceOverride', error)
    return
  }
  deviceOverride.value = (data || undefined) as Database['public']['Tables']['devices_override']['Row'] & Device
}
const getDevice = async () => {
  if (!id.value)
    return
  try {
    const { data, error } = await supabase
      .from('devices')
      .select(`
          device_id,
          app_id,
          platform,
          os_version,
          custom_id,
          version (
            name,
            app_id,
            bucket_id,
            created_at
          ),
          is_prod,
          is_emulator,
          version_build,
          created_at,
          plugin_version,
          updated_at
        `)
      .eq('device_id', id.value)
      .single()
    if (data && !error)
      device.value = data as Database['public']['Tables']['devices']['Row'] & Device
    else
      console.error('no devices', error)
    // console.log('device', device.value)
  }
  catch (error) {
    console.error(error)
  }
}

const minVersion = (val: string, min = '4.6.99') => {
  return gt(val, min)
}

const loadData = async () => {
  isLoading.value = true
  logs.value = []
  fetchOffset = 0
  await Promise.all([
    getDevice(),
    getDeviceOverride(),
    getChannelOverride(),
    getChannels(),
    getVersion(),
    loadStatsData(),
  ])
  isLoading.value = false
}

const upsertDevVersion = async (device: string, v: Database['public']['Tables']['app_versions']['Row']) => {
  return supabase
    .from('devices_override')
    .upsert({
      device_id: device,
      version: v.id,
      app_id: packageId.value,
      created_by: main.user?.id,
    })
}
const didCancel = async (name: string) => {
  displayStore.dialogOption = {
    header: t('alert.confirm-delete'),
    message: `${t('alert.delete-message')} ${name} ${t('from-device')} ?`,
    buttons: [
      {
        text: t('button.cancel'),
        role: 'cancel',
      },
      {
        text: t('button.delete'),
        id: 'confirm-button',
      },
    ],
  }
  displayStore.showDialog = true
  return displayStore.onDialogDismiss()
}
const saveCustomId = async (e: Event) => {
  e.preventDefault()
  if (!device.value?.device_id)
    return
  device.value.custom_id = (e.target as HTMLInputElement).value
  await supabase
    .from('devices')
    .update({
      custom_id: device.value?.custom_id,
    })
    .eq('device_id', id.value)
  displayStore.messageToast.push(t('custom-id-saved'))
}

const delDevVersion = async (device: string) => {
  if (await didCancel(t('channel.device')))
    return
  return supabase
    .from('devices_override')
    .delete()
    .eq('device_id', device)
    .eq('app_id', packageId.value)
}
const updateOverride = async () => {
  const buttons = []
  if (deviceOverride.value) {
    buttons.push({
      text: t('button.remove'),
      handler: async () => {
        device.value?.device_id && delDevVersion(device.value?.device_id)
        displayStore.messageToast.push(t('device.unlink_version'))
        await loadData()
      },
    })
  }
  for (const version of versions.value) {
    buttons.push({
      text: version.name,
      handler: async () => {
        if (!device.value?.device_id)
          return
        isLoading.value = true
        try {
          await upsertDevVersion(device.value?.device_id, version)
          displayStore.messageToast.push(t('device.link_version'))
          await loadData()
        }
        catch (error) {
          console.error(error)
          displayStore.messageToast.push(t('device.link_fail'))
        }
        isLoading.value = false
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
    header: t('package.link_version'),
    buttons,
  }
  displayStore.showActionSheet = true
}
const upsertDevChannel = async (device: string, channel: Database['public']['Tables']['channels']['Row']) => {
  if (!main?.user?.id)
    return
  return supabase
    .from('channel_devices')
    .upsert({
      device_id: device,
      channel_id: channel.id,
      app_id: packageId.value,
      created_by: main.user.id,
    })
}
const delDevChannel = async (device: string) => {
  if (await didCancel(t('channel.title')))
    return
  return supabase
    .from('channel_devices')
    .delete()
    .eq('device_id', device)
    .eq('app_id', packageId.value)
}
const updateChannel = async () => {
  const buttons = []
  if (channelDevice.value) {
    buttons.push({
      text: t('button.remove'),
      handler: async () => {
        device.value?.device_id && delDevChannel(device.value?.device_id)
        displayStore.messageToast.push(t('device.unlink_channel'))
        await loadData()
      },
    })
  }
  for (const channel of channels.value) {
    buttons.push({
      text: channel.name,
      handler: async () => {
        if (!device.value?.device_id)
          return
        isLoading.value = true
        try {
          await upsertDevChannel(device.value?.device_id, channel)
          displayStore.messageToast.push(t('device.link_channel'))
          await loadData()
        }
        catch (error) {
          console.error(error)
          displayStore.messageToast.push(t('device.link_fail'))
        }
        isLoading.value = false
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

watchEffect(async () => {
  if (route.path.includes('/d/')) {
    packageId.value = route.params.p as string
    packageId.value = packageId.value.replace(/--/g, '.')
    id.value = route.params.device as string
    await loadData()
  }
})
</script>

<template>
  <TitleHead :title="t('device.title')" />
  <div class="flex flex-col h-full p-8 pb-12 overflow-y-scroll md:mx-24">
    <div class="">
      <div class="w-full px-6 mx-auto lg:px-8 max-w-7xl">
        <div class="flex items-center justify-center">
          <div class="">
            <nav class="flex -mb-px space-x-10 md:flex-wrap">
              <button class="inline-flex items-center w-auto py-4 mt-0 text-lg font-medium text-gray-500 transition-all duration-200 border-b-2 border-transparent dark:text-gray-200 hover:text-gray-900 hover:border-gray-300 dark:hover:text-gray-500 dark:hover:border-gray-100 whitespace-nowrap group" :class="!showLog ? 'bg-gray-200/70 dark:bg-gray-600/70 px-2 rounded-lg hover:border-0 duration-0' : ''" @click="showLog = false">
                <IconInformations class="-ml-0.5 mr-2 text-gray-400 group-hover:text-gray-600 h-5 w-5 transition-all duration-100" />
                {{ t('channel.info') }}
              </button>

              <button class="inline-flex items-center w-auto py-4 mt-0 text-lg font-medium text-gray-500 transition-all duration-200 border-b-2 border-transparent dark:text-gray-200 hover:text-gray-900 hover:border-gray-300 dark:hover:text-gray-500 dark:hover:border-gray-100 whitespace-nowrap group" :class="showLog ? 'bg-gray-200/70 dark:bg-gray-600/70 px-2 rounded-lg hover:border-0 duration-0' : ''" @click="showLog = true">
                <IconLog class="-ml-0.5 mr-2 text-gray-400 group-hover:text-gray-600 h-5 w-5 transition-all duration-100" />
                {{ t('logs') }}
              </button>
            </nav>
          </div>
        </div>
      </div>
    </div>

    <div v-if="device">
      <div v-if="!showLog" id="informations">
        <div class="mt-5 border-t border-gray-200">
          <dl class="sm:divide-y sm:divide-gray-200">
            <div class="py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:py-5">
              <dt class="text-lg font-medium text-gray-700 dark:text-gray-200">
                {{ t('device-id') }}
              </dt>
              <dd class="mt-1 text-lg text-gray-600 dark:text-gray-200 sm:col-span-2 sm:mt-0">
                {{ device.device_id }}
              </dd>
            </div>
            <div class="py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:py-5">
              <dt class="text-lg font-medium text-gray-700 dark:text-gray-200">
                {{ t('device.platform') }}
              </dt>
              <dd class="mt-1 text-lg text-gray-600 dark:text-gray-200 sm:col-span-2 sm:mt-0">
                {{ device.platform }}
              </dd>
            </div>
            <div class="py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:py-5">
              <dt class="text-lg font-medium text-gray-700 dark:text-gray-200">
                {{ t('custom-id') }}
              </dt>
              <dd class="mt-1 text-lg text-gray-600 dark:text-gray-200 sm:col-span-2 sm:mt-0">
                <input :value="device.custom_id" class="w-full max-w-xs text-white input input-bordered" @input="saveCustomId">
              </dd>
            </div>
            <div class="py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:py-5">
              <dt class="text-lg font-medium text-gray-700 dark:text-gray-200">
                {{ t('device.plugin_version') }}
              </dt>
              <dd class="mt-1 text-lg text-gray-600 dark:text-gray-300 sm:col-span-2 sm:mt-0">
                {{ device.plugin_version }}
              </dd>
            </div>
            <div class="py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:py-5">
              <dt class="text-lg font-medium text-gray-700 dark:text-gray-200">
                {{ t('device.version') }}
              </dt>
              <dd class="mt-1 text-lg text-gray-600 dark:text-gray-300 sm:col-span-2 sm:mt-0">
                {{ device.version.name }}
              </dd>
            </div>
            <div class="py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:py-5">
              <dt class="text-lg font-medium text-gray-700 dark:text-gray-200">
                {{ t('version-builtin') }}
              </dt>
              <dd class="mt-1 text-lg text-gray-600 dark:text-gray-300 sm:col-span-2 sm:mt-0">
                {{ device.version_build }}
              </dd>
            </div>
            <div class="py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:py-5">
              <dt class="text-lg font-medium text-gray-700 dark:text-gray-200">
                {{ t('device.os_version') }}
              </dt>
              <dd class="mt-1 text-lg text-gray-600 dark:text-gray-300 sm:col-span-2 sm:mt-0">
                {{ device.os_version || 'Unknown' }}
              </dd>
            </div>
            <div v-if="minVersion(device.plugin_version)" class="py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:py-5">
              <dt class="text-lg font-medium text-gray-700 dark:text-gray-200">
                {{ t('is-emulator') }}
              </dt>
              <dd class="mt-1 text-lg text-gray-600 dark:text-gray-300 sm:col-span-2 sm:mt-0">
                {{ device.is_emulator }}
              </dd>
            </div>
            <div v-if="minVersion(device.plugin_version)" class="py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:py-5">
              <dt class="text-lg font-medium text-gray-700 dark:text-gray-200">
                {{ t('is-production-app') }}
              </dt>
              <dd class="mt-1 text-lg text-gray-600 dark:text-gray-300 sm:col-span-2 sm:mt-0">
                {{ device.is_prod }}
              </dd>
            </div>
            <div v-if="device.updated_at" class="py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:py-5">
              <dt class="text-lg font-medium text-gray-700 dark:text-gray-200">
                {{ t('device.last_update') }}
              </dt>
              <dd class="mt-1 text-lg text-gray-600 dark:text-gray-300 sm:col-span-2 sm:mt-0">
                {{ formatDate(device.updated_at) }}
              </dd>
            </div>
            <div v-if="device.created_at" class="py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:py-5">
              <dt class="text-lg font-medium text-gray-700 dark:text-gray-200">
                {{ t('device.created_at') }}
              </dt>
              <dd class="mt-1 text-lg text-gray-600 dark:text-gray-300 sm:col-span-2 sm:mt-0">
                {{ formatDate(device.created_at) }}
              </dd>
            </div>
            <div class="py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:py-5">
              <dt class="text-lg font-medium text-gray-700 dark:text-gray-200">
                {{ t('device.force_version') }}
              </dt>
              <dd class="mt-1 text-lg text-gray-600 dark:text-gray-300 sm:col-span-2 sm:mt-0" @click="updateOverride">
                {{ deviceOverride?.version?.name || t('device.no_override') }}
              </dd>
            </div>
            <div class="py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:py-5">
              <dt class="text-lg font-medium text-gray-700 dark:text-gray-200">
                {{ t('device.channel') }}
              </dt>
              <dd class="mt-1 text-lg text-gray-600 dark:text-gray-300 sm:col-span-2 sm:mt-0" @click="updateChannel">
                {{ channelDevice?.channel_id.name || t('device.no_channel') }}
              </dd>
            </div>
          </dl>
        </div>
      </div>
      <div v-if="showLog" id="logs" class="flex flex-col h-full">
        <div class="h-full">
          <input class="w-full px-5 py-3 mt-3 border-b border-slate-100 dark:bg-gray-800 dark:border-slate-900 dark:text-gray-400" type="text" placeholder="Search" @input="onSearchLog">
          <div v-if="logFiltered.length > 0" v-infinite-scroll="[loadStatsData, { distance: 10 }]" class="inline-block h-full min-w-full py-2 overflow-y-scroll align-middle">
            <div class="hidden md:block">
              <table class="w-full max-h-full lg:divide-y lg:divide-gray-200">
                <thead class="sticky top-0 hidden bg-white lg:table-header-group dark:bg-gray-900/90">
                  <tr>
                    <th class="py-3.5 pl-4 pr-3 text-left text-lg whitespace-nowrap font-medium text-gray-700 dark:text-gray-200 sm:pl-6 md:pl-0">
                      <div class="flex items-center">
                        {{ t('action') }}
                      </div>
                    </th>
                    <th class="py-3.5 px-3 text-left text-lg whitespace-nowrap font-medium text-gray-700 dark:text-gray-200">
                      <div class="flex items-center">
                        {{ t('device.version') }}
                      </div>
                    </th>
                    <th class="py-3.5 px-3 text-left text-lg whitespace-nowrap font-medium text-gray-700 dark:text-gray-200">
                      <div class="flex items-center">
                        {{ t('version-build') }}
                      </div>
                    </th>
                    <th class="py-3.5 px-3 text-left text-lg whitespace-nowrap font-medium text-gray-700 dark:text-gray-200">
                      <div class="flex items-center">
                        {{ t('updated-at') }}
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody class="w-full divide-y divide-gray-200 max-h-fit">
                  <tr v-if="isLoading || isLoadingSub">
                    <td align="center" colspan="5">
                      <Spinner />
                    </td>
                  </tr>
                  <tr v-for="(item, i) in logFiltered" v-else :key="i" class="w-full">
                    <td class="hidden py-4 pl-4 pr-3 text-lg font-medium text-gray-700 dark:text-gray-200 lg:table-cell whitespace-nowrap sm:pl-6 md:pl-0">
                      {{ item.action }}
                    </td>
                    <td class="hidden px-4 py-4 text-lg font-bold text-gray-700 dark:text-gray-200 lg:table-cell whitespace-nowrap">
                      {{ item.version.name }}
                    </td>
                    <td class="hidden px-4 py-4 text-lg font-medium text-gray-700 dark:text-gray-200 lg:table-cell whitespace-nowrap">
                      {{ item.version_build }}
                    </td>
                    <td class="hidden px-4 py-4 text-lg font-medium text-gray-700 dark:text-gray-200 lg:table-cell whitespace-nowrap">
                      {{ formatDate(item.updated_at || '') }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <k-list class="w-full my-0 md:hidden">
              <k-list-item v-if="isLoading || isLoadingSub">
                <template #text>
                  <Spinner />
                </template>
              </k-list-item>
              <k-list-item
                v-for="s in logFiltered"
                v-else
                :key="s.id"
                :title="`${s.action}`"
                :footer="`${s.version.name}, builtin ${s.version_build}`"
                :after="formatDate(s.updated_at || '')"
              />
            </k-list>
          </div>
          <div v-else class="mt-5 text-2xl text-center">
            {{ t('no-logs') }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
