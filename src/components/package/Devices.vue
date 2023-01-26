<script setup lang="ts">
import { ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSupabase } from '~/services/supabase'
import type { Database } from '~/types/supabase.types'
import IconPrevious from '~icons/heroicons/chevron-left'
import IconNext from '~icons/heroicons/chevron-right'

interface Device {
  version: {
    name: string
  }
}

const props = defineProps<{
  appId: string
}>()

const { t } = useI18n()
const supabase = useSupabase()
const isFilter = ref(false)
const isLoading = ref(true)
const isLoadingSub = ref(false)
const devices = ref<(Database['public']['Tables']['devices']['Row'] & Device)[]>([])
const displayedDevices = ref<(Database['public']['Tables']['devices']['Row'] & Device)[]>([])
const currentPageNumber = ref(1)
const pageNumbers = ref<number[]>([1])

const getDeviceIds = async () => {
  const { data: channelDevices } = await supabase
    .from('channel_devices')
    .select('device_id')
    .eq('app_id', props.appId)
  const { data: deviceOverride } = await supabase
    .from('devices_override')
    .select('device_id')
    .eq('app_id', props.appId)

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

const display = (pageNumber: number) => {
  // Display the devices between the two indexes
  const firstIndex = pageNumber * 8
  const lastIndex = firstIndex + 8

  displayedDevices.value = devices.value.slice(firstIndex, lastIndex)
  currentPageNumber.value = pageNumber
}

const loadData = async () => {
  try {
    if (isFilter.value) {
      // list all devices override
      const deviceIds = await getDeviceIds()
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
        .eq('app_id', props.appId)
        .order('updated_at', { ascending: false })
        .in('device_id', deviceIds)
      if (!dataDev)
        return
      devices.value.push(...dataDev as (Database['public']['Tables']['devices']['Row'] & Device)[])
    }
    else {
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
        .eq('app_id', props.appId)
        .order('updated_at', { ascending: false })
      if (!dataDev)
        return
      devices.value.push(...dataDev as (Database['public']['Tables']['devices']['Row'] & Device)[])
    }
    if (devices.value.length > 0) {
      display(currentPageNumber.value)
      const pages = Array.from(Array(Math.ceil(devices.value.length / 8)).keys())
      pageNumbers.value = pages.slice(1, pages.length)
    }
  }
  catch (error) {
    console.error(error)
  }
}
const refreshData = async (evt: RefresherCustomEvent | null = null) => {
  isLoading.value = true
  try {
    devices.value = []
    await loadData()
  }
  catch (error) {
    console.error(error)
  }
  isLoading.value = false
  evt?.target?.complete()
}

interface RefresherEventDetail {
  complete(): void
}
interface RefresherCustomEvent extends CustomEvent {
  detail: RefresherEventDetail
  target: HTMLIonRefresherElement
}

watchEffect(async () => {
  await refreshData()
})
</script>

<template>
  <div id="devices" class="bg-white border md:mx-3 rounded-sm shadow-lg border-slate-200 dark:bg-gray-800 dark:border-slate-900">
    <header class="px-5 py-4 border-b border-slate-100">
      <h2 class="font-semibold text-slate-800 dark:text-white">
        {{ t('package.device_list') }}
      </h2>
    </header>
    <div class="p-3">
      <!-- Table -->
      <div class="overflow-y-scroll">
        <table class="w-full table-auto" aria-label="">
          <!-- Table header -->
          <thead class="text-xs uppercase rounded-sm text-slate-400 dark:text-white bg-slate-50 dark:bg-gray-800">
            <tr>
              <th class="p-2">
                <div class="font-semibold text-left">
                  {{ t('device-id') }}
                </div>
              </th>
              <th class="p-2">
                <div class="font-semibold text-left">
                  {{ t('device.platform') }}
                </div>
              </th>
              <th class="p-2">
                <div class="font-semibold text-left">
                  {{ t('updated-at') }}
                </div>
              </th>
              <th class="p-2">
                <div class="font-semibold text-left">
                  {{ t('device.version') }}
                </div>
              </th>
              <th class="p-2">
                <div class="font-semibold text-left">
                  {{ t('custom-id') }}
                </div>
              </th>
            </tr>
          </thead>
          <!-- Table body -->
          <tbody class="text-sm font-medium divide-y divide-slate-100">
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
    </div>
    <div class="py-6">
      <div class="px-4 mx-auto sm:px-6 lg:px-8">
        <nav class="relative flex justify-center -space-x-px rounded-md">
          <IconPrevious v-if="currentPageNumber > 1" class="dark:text-white text-gray-400 self-center text-lg cursor-pointer" @click="display(currentPageNumber - 1)" />
          <a v-if="currentPageNumber > 1" class="relative cursor-pointer text-gray-400 dark:text-gray-200 hover:text-gray-700 dark:hover:text-white bg-white dark:bg-gray-800  inline-flex items-center justify-center px-4 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900 focus:z-10 w-9" @click="display(currentPageNumber - 1)"> {{ currentPageNumber - 1 }} </a>
          <a class="relative cursor-pointer text-lg text-gray-600 dark:text-white hover:text-gray-700 dark:hover:text-white bg-white dark:bg-gray-800  inline-flex items-center justify-center px-4 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900 focus:z-10 w-9"> {{ currentPageNumber }} </a>
          <a v-if="currentPageNumber < pageNumbers[pageNumbers.length - 1]" class="relative cursor-pointer text-gray-400 dark:text-gray-200 hover:text-gray-700 dark:hover:text-white bg-white dark:bg-gray-800  inline-flex items-center justify-center px-4 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900 focus:z-10 w-9" @click="display(currentPageNumber + 1)"> {{ currentPageNumber + 1 }} </a>
          <IconNext v-if="currentPageNumber < pageNumbers[pageNumbers.length - 1]" class="dark:text-white text-gray-400 self-center text-lg cursor-pointer" @click="display(currentPageNumber + 1)" />
        </nav>
      </div>
    </div>
  </div>
</template>
