<!-- eslint-disable @typescript-eslint/no-use-before-define -->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { kList } from 'konsta/vue'
import { useRoute } from 'vue-router'
import { initDropdowns } from 'flowbite'
import debounce from 'lodash.debounce'
import { useSupabase } from '~/services/supabase'
import type { Database } from '~/types/supabase.types'
import IconPrevious from '~icons/heroicons/chevron-left'
import IconNext from '~icons/heroicons/chevron-right'

interface Device {
  version: {
    name: string
  }
}
const filters = reactive({
  override: false,
})
const { t } = useI18n()
const supabase = useSupabase()
const route = useRoute()
const isLoading = ref(true)
const search = ref('')
const isLoadingSub = ref(false)
const devices = ref<(Database['public']['Tables']['devices']['Row'] & Device)[]>([])
const filtered = ref<(Database['public']['Tables']['devices']['Row'] & Device)[]>([])
const currentPageNumber = ref(1)
const pageNumbers = ref<number[]>([1])
const filteredPageNumbers = ref<number[]>([1])
const appId = ref('')
const offset = 10

const isFilter = computed(() => {
  return Object
    .values(filters)
    .reduce((p, v) => v || p, false)
})

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

const getDeviceOverrideIds = async () => {
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
  // console.log('deviceIds', deviceIds)
  return deviceIds
}

const loadData = async () => {
  try {
    const rangeA = (currentPageNumber.value - 1) * offset
    const rangeB = currentPageNumber.value * offset
    console.log('loadData', offset, `range ${rangeA}, ${rangeB}`)
    const req = supabase
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
      `, { count: 'exact' })
      .eq('app_id', appId.value)
      .order('updated_at', { ascending: false })
      .range(rangeA, rangeB)
      // page 1  = 0, 10
      // page 2  = 10, 20
    if (isFilter.value) {
      const deviceIds = await getDeviceOverrideIds()
      req.in('device_id', deviceIds)
    }
    const { data: dataDev, count } = await req
    if (!dataDev)
      return
    devices.value.length = 0
    devices.value.push(...dataDev as (Database['public']['Tables']['devices']['Row'] & Device)[])
    const pages = Array.from(Array(Math.ceil(count ?? 0 / offset)).keys())
    pageNumbers.value = pages.slice(1, pages.length)
  }
  catch (error) {
    console.error(error)
  }
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
  }
  catch (error) {
    console.error(error)
  }
}

const refreshData = async () => {
  isLoading.value = true
  try {
    console.log('refreshData')
    await loadData()
  }
  catch (error) {
    console.error(error)
  }
  isLoading.value = false
}

watch(search, debounce(() => {
  if (search.value)
    searchDevice()
}, 500))

onMounted(() => {
  initDropdowns()
})

watch(isFilter, () => {
  console.log('isFilter', isFilter.value)
  currentPageNumber.value = 1
  refreshData()
})

watch(
  route,
  async () => {
    if (route.path.endsWith('/devices')) {
      appId.value = route.params.p as string
      appId.value = appId.value.replace(/--/g, '.')
      console.log('watchEffect', appId.value)
      currentPageNumber.value = 1
      await refreshData()
    }
  },
  { deep: true, immediate: true },
)
</script>

<template>
  <div class="h-full py-4 overflow-y-scroll">
    <div id="devices" class="flex flex-col mx-auto mt-5 overflow-y-scroll border rounded-lg shadow-lg md:w-2/3 border-slate-200 dark:bg-gray-800 dark:border-slate-900">
      <header class="px-5 py-4 border-b border-slate-100">
        <h2 class="text-xl font-semibold text-slate-800 dark:text-white">
          {{ t('package.device_list') }}
        </h2>
      </header>

      <div class="flex items-center w-full p-4 justify-right">
        <input v-model="search" class="w-full px-5 py-3 border-b border-slate-100 dark:bg-gray-800 dark:border-slate-900 dark:text-gray-400" type="text" placeholder="Search">

        <button
          id="dropdownDefault" data-dropdown-toggle="dropdown"
          class="text-white bg-primary-700 hover:bg-primary-800 focus:ring-4 focus:outline-none focus:ring-primary-300 font-medium rounded-lg text-sm px-4 py-2.5 text-center inline-flex items-center dark:bg-primary-600 dark:hover:bg-primary-700 dark:focus:ring-primary-800"
          type="button"
        >
          Filter
          <svg
            class="w-4 h-4 ml-2" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        <!-- Dropdown menu -->
        <div id="dropdown" class="z-10 hidden w-56 p-3 bg-white rounded-lg shadow dark:bg-gray-700">
          <h6 class="mb-3 text-sm font-medium text-gray-900 dark:text-white">
            Category
          </h6>
          <ul class="space-y-2 text-sm" aria-labelledby="dropdownDefault">
            <li v-for="(f, i) in Object.keys(filters)" :key="i" class="flex items-center">
              <input
                id="apple" v-model="(filters as any)[f]" type="checkbox"
                class="w-4 h-4 bg-gray-100 border-gray-300 rounded text-primary-600 focus:ring-primary-500 dark:focus:ring-primary-600 dark:ring-offset-gray-700 focus:ring-2 dark:bg-gray-600 dark:border-gray-500"
              >

              <label for="apple" class="ml-2 text-sm font-medium text-gray-900 dark:text-gray-100">
                {{ f }}
              </label>
            </li>
          </ul>
        </div>
      </div>
      <div class="p-3">
        <!-- Table -->
        <div class="overflow-y-scroll">
          <table class="w-full table-auto" aria-label="">
            <!-- Table header -->
            <thead class="uppercase rounded-sm text-md text-slate-400 dark:text-white bg-slate-50 dark:bg-gray-800">
              <tr>
                <th class="p-2 text-xl font-medium text-left text-gray-700 whitespace-nowrap dark:text-gray-200">
                  <div class="flex items-center">
                    {{ t('device-id') }}
                  </div>
                </th>
                <th class="p-2 text-xl font-medium text-left text-gray-700 whitespace-nowrap dark:text-gray-200">
                  <div class="flex items-center">
                    {{ t('device.platform') }}
                  </div>
                </th>
                <th class="p-2 text-xl font-medium text-left text-gray-700 whitespace-nowrap dark:text-gray-200">
                  <div class="flex items-center">
                    {{ t('updated-at') }}
                  </div>
                </th>
                <th class="p-2 text-xl font-medium text-left text-gray-700 whitespace-nowrap dark:text-gray-200">
                  <div class="flex items-center">
                    {{ t('device.version') }}
                  </div>
                </th>
                <th class="p-2 text-xl font-medium text-left text-gray-700 whitespace-nowrap dark:text-gray-200">
                  <div class="flex items-center">
                    {{ t('custom-id') }}
                  </div>
                </th>
              </tr>
            </thead>
            <!-- Table body -->
            <tbody class="font-medium divide-y text-md divide-slate-100">
              <tr v-if="isLoading || isLoadingSub">
                <td align="center" colspan="5">
                  <Spinner />
                </td>
              </tr>
              <!-- Row -->
              <DeviceCard v-for="(device, i) in devicesFiltered" :key="device.device_id + i" :device="device" />
            </tbody>
          </table>
        </div>
        <k-list class="w-full my-0 md:hidden">
          <DeviceCard v-for="(device, i) in devicesFiltered" :key="device.device_id + i" :device="device" />
        </k-list>
      </div>
      <div v-if="!search" class="py-6">
        <div class="px-4 mx-auto sm:px-6 lg:px-8">
          <nav class="relative flex justify-center -space-x-px rounded-md">
            <IconPrevious v-if="currentPageNumber > 1" class="self-center text-lg text-gray-400 cursor-pointer dark:text-white" @click="currentPageNumber -= 1; refreshData()" />
            <a v-if="currentPageNumber > 1" class="relative inline-flex items-center justify-center px-4 py-2 text-sm font-bold text-gray-400 bg-white cursor-pointer dark:text-gray-200 hover:text-gray-700 dark:hover:text-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900 focus:z-10 w-9" @click="currentPageNumber -= 1; refreshData()"> {{ currentPageNumber - 1 }} </a>
            <a class="relative inline-flex items-center justify-center px-4 py-2 text-sm text-lg font-bold text-gray-600 bg-white cursor-pointer dark:text-white hover:text-gray-700 dark:hover:text-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900 focus:z-10 w-9"> {{ currentPageNumber }} </a>
            <a v-if="currentPageNumber < pageNumberFiltered[pageNumberFiltered.length - 1]" class="relative inline-flex items-center justify-center px-4 py-2 text-sm font-bold text-gray-400 bg-white cursor-pointer dark:text-gray-200 hover:text-gray-700 dark:hover:text-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900 focus:z-10 w-9" @click="currentPageNumber += 1; refreshData()"> {{ currentPageNumber + 1 }} </a>
            <IconNext v-if="currentPageNumber < pageNumberFiltered[pageNumberFiltered.length - 1]" class="self-center text-lg text-gray-400 cursor-pointer dark:text-white" @click="currentPageNumber += 1; refreshData()" />
          </nav>
        </div>
      </div>
    </div>
  </div>
</template>
