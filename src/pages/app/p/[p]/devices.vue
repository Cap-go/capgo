<script setup lang="ts">
import { kList, kListItem } from 'konsta/vue'
import { vInfiniteScroll } from '@vueuse/components'
import { computed, ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { subDays } from 'date-fns'
import filterOutline from '~icons/ion/filter-outline?raw'
import { formatDate } from '~/services/date'
import { useSupabase } from '~/services/supabase'
import Spinner from '~/components/Spinner.vue'
import TitleHead from '~/components/TitleHead.vue'
import type { Database } from '~/types/supabase.types'
import { useDisplayStore } from '~/stores/display'

interface Device {
  version: {
    name: string
  }
}
const fetchLimit = 40
let fetchOffset = 0
const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const displayStore = useDisplayStore()
const supabase = useSupabase()
const isDisabled = ref(false)
const isFilter = ref(false)
const id = ref('')
const search = ref('')
const isLoading = ref(true)
const isLoadingSub = ref(false)
const devices = ref<(Database['public']['Tables']['devices']['Row'] & Device)[]>([])
const filtered = ref<(Database['public']['Tables']['devices']['Row'] & Device)[]>([])

const deviceFiltered = computed(() => {
  if (search.value)
    return filtered.value
  return devices.value
})

const getDeviceIds = async () => {
  const { data: channelDevices } = await supabase
    .from('channel_devices')
    .select('device_id')
    .eq('app_id', id.value)
  const { data: deviceOverride } = await supabase
    .from('devices_override')
    .select('device_id')
    .eq('app_id', id.value)

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
const loadData = async () => {
  console.log('loadData', fetchOffset, fetchLimit)
  try {
    // create a date object for the last day of the previous month with dayjs
    let total = 0
    if (isFilter.value) {
      // list all devices override
      const deviceIds = await getDeviceIds()
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
        .eq('app_id', id.value)
        .order('updated_at', { ascending: false })
        .in('device_id', deviceIds)
        .range(fetchOffset, fetchOffset + fetchLimit - 1)
      if (!dataDev)
        return
      devices.value.push(...dataDev as (Database['public']['Tables']['devices']['Row'] & Device)[])
      total = dataDev.length
    }
    else {
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
        .eq('app_id', id.value)
        .order('updated_at', { ascending: false })
        .range(fetchOffset, fetchOffset + fetchLimit - 1)
      if (!dataDev)
        return
      devices.value.push(...dataDev as (Database['public']['Tables']['devices']['Row'] & Device)[])
      total = dataDev.length
    }

    if (total === fetchLimit)
      fetchOffset += fetchLimit
    else
      isDisabled.value = true
  }
  catch (error) {
    console.error(error)
  }
}
const refreshData = async (evt: RefresherCustomEvent | null = null) => {
  isLoading.value = true
  try {
    devices.value = []
    fetchOffset = 0
    await loadData()
  }
  catch (error) {
    console.error(error)
  }
  isLoading.value = false
  evt?.target?.complete()
}

const openDevice = async (device: Database['public']['Tables']['devices']['Row']) => {
  router.push(`/app/p/${id.value.replace(/\./g, '--')}/d/${device.device_id}`)
}

interface RefresherEventDetail {
  complete(): void
}
interface RefresherCustomEvent extends CustomEvent {
  detail: RefresherEventDetail
  target: HTMLIonRefresherElement
}

watchEffect(async () => {
  if (route.path.endsWith('/devices')) {
    id.value = route.params.p as string
    id.value = id.value.replace(/--/g, '.')
    await refreshData()
  }
})
const searchDevices = async () => {
  isLoadingSub.value = true
  const { data: dataVersions } = await supabase
    .from('devices')
    .select(`
        device_id,
        platform,
        plugin_version,
        custom_id,
        version (
            name
        ),
        created_at,
        updated_at
      `)
    .eq('app_id', id.value)
    .gt('updated_at', subDays(new Date(), 30).toUTCString())
    .order('updated_at', { ascending: false })
    .or(`device_id.like.%${search.value}%,custom_id.like.%${search.value}%`)
  filtered.value = (dataVersions || []) as (Database['public']['Tables']['devices']['Row'] & Device)[]
  isLoadingSub.value = false
}
const onSearch = (val: string) => {
  search.value = val
  searchDevices()
}
const onFilter = async () => {
  console.log('filter')
  isFilter.value = !isFilter.value
  displayStore.messageToast.push(isFilter.value ? t('switch-to-only-devic') : t('switch-to-all-device'))
  await refreshData()
}
</script>

<template>
  <TitleHead :title="t('devices.title')" :search-placeholder="t('search-device')" :search="!isLoading" :search-icon="filterOutline" @search-input="onSearch" @search-button-click="onFilter" />
  <k-list v-infinite-scroll="[loadData, { distance: 10 }]" class="h-full overflow-y-scroll md:hidden max-h-fit" strong-ios outline-ios>
    <k-list-item v-if="isLoading || isLoadingSub">
      <template #text>
        <Spinner />
      </template>
    </k-list-item>
    <k-list-item
      v-for="(item, i) in deviceFiltered"
      v-else
      :key="i"
      :title="item.device_id"
      :footer="`${item.platform} ${item.version.name} ${item.custom_id || ''}`"
      :after="formatDate(item.updated_at || '')" link @click="openDevice(item)"
    />
  </k-list>
  <div class="hidden h-full md:block">
    <div class="h-full px-0 mx-auto sm:px-2">
      <div class="flex flex-col h-full">
        <div class="h-full overflow-x-auto">
          <div v-infinite-scroll="[loadData, { distance: 10 }]" class="inline-block h-full min-w-full py-2 overflow-y-scroll align-middle md:px-6 lg:px-8">
            <table class="w-full h-full lg:divide-y lg:divide-gray-200">
              <thead class="sticky top-0 hidden bg-white lg:table-header-group dark:bg-gray-900/90">
                <tr>
                  <th class="py-3.5 pl-4 pr-3 text-left text-sm whitespace-nowrap font-medium text-gray-500 sm:pl-6 md:pl-0">
                    <div class="flex items-center">
                      Device ID
                    </div>
                  </th>
                  <th class="py-3.5 px-3 text-left text-sm whitespace-nowrap font-medium text-gray-500">
                    <div class="flex items-center">
                      Platform
                    </div>
                  </th>
                  <th class="py-3.5 px-3 text-left text-sm whitespace-nowrap font-medium text-gray-500">
                    <div class="flex items-center">
                      Date
                    </div>
                  </th>
                  <th class="py-3.5 px-3 text-left text-sm whitespace-nowrap font-medium text-gray-500">
                    <div class="flex items-center">
                      Version
                    </div>
                  </th>
                  <th class="py-3.5 px-3 text-left text-sm whitespace-nowrap font-medium text-gray-500">
                    <div class="flex items-center">
                      Custom ID
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody class="w-full h-full divide-y divide-gray-200 max-h-fit">
                <tr v-if="isLoading || isLoadingSub">
                  <td align="center" colspan="5">
                    <Spinner />
                  </td>
                </tr>
                <tr v-for="(item, i) in deviceFiltered" v-else :key="i" class="w-full cursor-pointer" @click="openDevice(item)">
                  <td class="hidden py-4 pl-4 pr-3 text-sm font-medium text-gray-200 lg:table-cell whitespace-nowrap sm:pl-6 md:pl-0">
                    {{ item.device_id }}
                  </td>
                  <td class="hidden px-4 py-4 text-sm font-medium text-gray-200 lg:table-cell whitespace-nowrap">
                    {{ item.platform }}
                  </td>
                  <td class="hidden px-4 py-4 text-sm font-medium text-gray-200 lg:table-cell whitespace-nowrap">
                    {{ formatDate(item.updated_at || '') }}
                  </td>
                  <td class="hidden px-4 py-4 text-sm font-bold text-gray-200 lg:table-cell whitespace-nowrap">
                    {{ item.version.name }}
                  </td>
                  <td class="hidden px-4 py-4 text-sm font-medium text-gray-200 lg:table-cell whitespace-nowrap">
                    {{ item.custom_id }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
