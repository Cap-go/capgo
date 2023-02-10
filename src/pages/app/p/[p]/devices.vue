<!-- eslint-disable @typescript-eslint/no-use-before-define -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { kList } from 'konsta/vue'
import { useRoute } from 'vue-router'
import { useSupabase } from '~/services/supabase'
import type { Database } from '~/types/supabase.types'
import IconPrevious from '~icons/heroicons/chevron-left'
import IconNext from '~icons/heroicons/chevron-right'

interface Device {
  version: {
    name: string
  }
}

const { t } = useI18n()
const supabase = useSupabase()
const route = useRoute()
const isLoading = ref(true)
const search = ref('')
const isLoadingSub = ref(false)
const devices = ref<(Database['public']['Tables']['devices']['Row'] & Device)[]>([])
const filtered = ref<(Database['public']['Tables']['devices']['Row'] & Device)[]>([])
const displayedDevices = ref<(Database['public']['Tables']['devices']['Row'] & Device)[]>([])
let currentPageNumber = 1
const pageNumbers = ref<number[]>([1])
const filteredPageNumbers = ref<number[]>([1])
const appId = ref('')
const offset = 10
const currentDevicesNumber = ref(0)

const devicesFiltered = computed(() => {
  if (search.value)
    return filtered.value
  return devices.value
})

const pageNumberFiltered = computed(() => {
  if (search.value)
    return filteredPageNumbers.value
  return pageNumbers.value
})

const getDeviceIds = async () => {
  const { data: channelDevices } = await supabase
    .from('channel_devices')
    .select('device_id')
    .eq('app_id', appId.value)
  const { data: deviceOverride } = await supabase
    .from('devices_override')
    .select('device_id')
    .eq('app_id', appId.value)
  // create a list of unique id
  const deviceIds = [
    ...new Set([
      ...(channelDevices ? channelDevices.map(d => d.device_id) : []),
      ...(deviceOverride ? deviceOverride.map(d => d.device_id) : []),
    ]),
  ]
  console.log('deviceIds', deviceIds)
  return deviceIds
}

const getDevicesLength = async () => {
  const length = await supabase
    .from('devices')
    .select('device_id', { count: 'exact', head: true })
    .eq('is_emulator', false)
    .eq('is_prod', true)
    .eq('app_id', appId.value)
    .then(res => res.count || 0)
  const pages = Array.from(Array(Math.ceil(length / offset)).keys())
  pageNumbers.value = pages.slice(1, pages.length)
}

const loadData = async () => {
  try {
    console.log('loadData', currentDevicesNumber.value, offset)
    let total = 0

    const { data: dataDev } = await supabase
      .from('devices')
      .select(`
        device_id,
        platform,
        plugin_version,
        version (
            name
        ),
        created_at,
        updated_at
      `)
      .eq('app_id', appId.value)
      .order('updated_at', { ascending: false })
      .range(currentDevicesNumber.value, currentDevicesNumber.value + offset - 1)
    if (!dataDev)
      return
    devices.value.push(...dataDev as (Database['public']['Tables']['devices']['Row'] & Device)[])
    total = dataDev.length
    if (total === offset)
      currentDevicesNumber.value += offset
  }
  catch (error) {
    console.error(error)
  }
}

const display = async (pageNumber: number) => {
  console.log('display', currentDevicesNumber.value, pageNumber, offset)
  // Display the devices between the two indexes
  const firstIndex = (pageNumber - 1) * offset
  const lastIndex = firstIndex + offset

  if (currentDevicesNumber.value < lastIndex) {
    console.log('load more', currentDevicesNumber.value, lastIndex)
    await getDevicesLength()
    await loadData()
  }

  displayedDevices.value = devicesFiltered.value.slice(firstIndex, lastIndex)
  currentPageNumber = pageNumber
}

const searchDevice = async () => {
  console.log('searchDevice')
  try {
    const { data: dataDev } = await supabase
      .from('devices')
      .select(`
        app_id,
        device_id,
        platform,
        plugin_version,
        version (
            name
        ),
        created_at,
        updated_at
      `)
      .eq('app_id', appId.value)
      .ilike('device_id', `%${search.value}%`)
      .order('updated_at', { ascending: false })
    if (!dataDev)
      return

    filtered.value = [...dataDev as (Database['public']['Tables']['devices']['Row'] & Device)[]]
    const pages = Array.from(Array(Math.ceil(dataDev.length / offset)).keys())
    filteredPageNumbers.value = pages.slice(1, pages.length)
    currentPageNumber = 1
    display(currentPageNumber)
  }
  catch (error) {
    console.error(error)
  }
}

const refreshData = async () => {
  isLoading.value = true
  try {
    console.log('refreshData')
    devices.value = []
    await loadData()
    await getDevicesLength()
    display(currentPageNumber)
  }
  catch (error) {
    console.error(error)
  }
  isLoading.value = false
}

onMounted(async () => {
  if (route.path.endsWith('/devices')) {
    appId.value = route.params.p as string
    appId.value = appId.value.replace(/--/g, '.')
    console.log('watchEffect', appId.value)
    await refreshData()
  }
})
</script>

<template>
  <TitleHead :title="t('package.device_list')" color="warning" />
  <div class="h-full overflow-y-scroll py-4">
    <div id="devices" class="mt-5 border md:w-2/3 mx-auto rounded-lg shadow-lg border-slate-200 dark:bg-gray-800 dark:border-slate-900 flex flex-col overflow-y-scroll">
      <header class="px-5 py-4 border-b border-slate-100">
        <h2 class="font-semibold text-xl text-slate-800 dark:text-white">
          {{ t('package.device_list') }}
        </h2>
      </header>
      <input v-model="search" class="w-full px-5 py-3 border-b border-slate-100 dark:bg-gray-800 dark:border-slate-900 dark:text-gray-400" type="text" placeholder="Search" @input="searchDevice">
      <div class="">
        <!-- Table -->
        <div class="hidden md:block overflow-y-scroll p-3">
          <table class="h-full w-full table-auto lg:divide-y lg:divide-gray-200 mb-5">
            <thead class="sticky top-0 bg-white dark:bg-gray-900/90">
              <tr>
                <th class="p-2 text-left text-xl whitespace-nowrap font-medium text-gray-700 dark:text-gray-200">
                  <div class="flex items-center">
                    {{ t('device-id') }}
                  </div>
                </th>
                <th class="p-2 text-left text-xl whitespace-nowrap font-medium text-gray-700 dark:text-gray-200">
                  <div class="flex items-center">
                    {{ t('device.platform') }}
                  </div>
                </th>
                <th class="p-2 text-left text-xl whitespace-nowrap font-medium text-gray-700 dark:text-gray-200">
                  <div class="flex items-center">
                    {{ t('updated-at') }}
                  </div>
                </th>
                <th class="p-2 text-left text-xl whitespace-nowrap font-medium text-gray-700 dark:text-gray-200">
                  <div class="flex items-center">
                    {{ t('device.version') }}
                  </div>
                </th>
                <th class="p-2 text-left text-xl whitespace-nowrap font-medium text-gray-700 dark:text-gray-200">
                  <div class="flex items-center">
                    {{ t('custom-id') }}
                  </div>
                </th>
              </tr>
            </thead>
            <!-- Table body -->
            <tbody class="text-md font-medium divide-y divide-slate-100">
              <tr v-if="isLoading || isLoadingSub">
                <td align="center" colspan="5">
                  <Spinner />
                </td>
              </tr>
              <!-- Row -->
              <DeviceCard v-for="(device, i) in displayedDevices" :key="device.device_id + i" :device="device" />
            </tbody>
          </table>
        </div>
        <k-list class="md:hidden w-full my-0">
          <DeviceCard v-for="(device, i) in displayedDevices" :key="device.device_id + i" :device="device" />
        </k-list>
      </div>
      <div class="py-6">
        <div class="px-4 mx-auto sm:px-6 lg:px-8">
          <nav class="relative flex justify-center -space-x-px rounded-md">
            <IconPrevious v-if="currentPageNumber > 1" class="dark:text-white text-gray-400 self-center text-lg cursor-pointer" @click="display(currentPageNumber - 1)" />
            <a v-if="currentPageNumber > 1" class="relative cursor-pointer text-gray-400 dark:text-gray-200 hover:text-gray-700 dark:hover:text-white bg-white dark:bg-gray-800  inline-flex items-center justify-center px-4 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900 focus:z-10 w-9" @click="display(currentPageNumber - 1)"> {{ currentPageNumber - 1 }} </a>
            <a class="relative cursor-pointer text-lg text-gray-600 dark:text-white hover:text-gray-700 dark:hover:text-white bg-white dark:bg-gray-800  inline-flex items-center justify-center px-4 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900 focus:z-10 w-9"> {{ currentPageNumber }} </a>
            <a v-if="currentPageNumber < pageNumberFiltered[pageNumberFiltered.length - 1]" class="relative cursor-pointer text-gray-400 dark:text-gray-200 hover:text-gray-700 dark:hover:text-white bg-white dark:bg-gray-800  inline-flex items-center justify-center px-4 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900 focus:z-10 w-9" @click="display(currentPageNumber + 1)"> {{ currentPageNumber + 1 }} </a>
            <IconNext v-if="currentPageNumber < pageNumberFiltered[pageNumberFiltered.length - 1]" class="dark:text-white text-gray-400 self-center text-lg cursor-pointer" @click="display(currentPageNumber + 1)" />
          </nav>
        </div>
      </div>
    </div>
  </div>
</template>
