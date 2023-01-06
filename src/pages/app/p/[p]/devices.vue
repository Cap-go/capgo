<script setup lang="ts">
import {
  IonContent,
  IonInfiniteScroll,
  IonInfiniteScrollContent,
  IonItem,
  IonLabel,
  IonList,
  IonNote, IonPage, IonRefresher, IonRefresherContent, toastController,
} from '@ionic/vue'
import { computed, ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { subDays } from 'date-fns'
import { filterOutline } from 'ionicons/icons'
import { formatDate } from '~/services/date'
import { useSupabase } from '~/services/supabase'
import Spinner from '~/components/Spinner.vue'
import TitleHead from '~/components/TitleHead.vue'
import type { Database } from '~/types/supabase.types'

interface Device {
  version: {
    name: string
  }
}
interface InfiniteScrollCustomEvent extends CustomEvent {
  target: HTMLIonInfiniteScrollElement
}

const fetchLimit = 40
let fetchOffset = 0
const { t } = useI18n()
const router = useRouter()
const route = useRoute()
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
const loadData = async (event?: InfiniteScrollCustomEvent) => {
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
  if (event)
    event.target.complete()
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
  const toast = await toastController
    .create({
      message: isFilter.value ? t('switch-to-only-devic') : t('switch-to-all-device'),
      duration: 2000,
    })
  await toast.present()
  await refreshData()
}
</script>

<template>
  <IonPage>
    <TitleHead :title="t('devices.title')" :search="!isLoading" :search-icon="filterOutline" @search-input="onSearch" @search-button-click="onFilter" />
    <IonContent :fullscreen="true">
      <IonRefresher slot="fixed" @ion-refresh="refreshData($event)">
        <IonRefresherContent />
      </IonRefresher>
      <div v-if="isLoading" class="flex justify-center chat-items">
        <Spinner />
      </div>
      <div v-else>
        <IonList>
          <div v-if="isLoadingSub" class="flex justify-center chat-items">
            <Spinner />
          </div>
          <template v-for="d in deviceFiltered" :key="d.device_id">
            <IonItem class="cursor-pointer" @click="openDevice(d)">
              <IonLabel>
                <div class="flex flex-col col-span-6">
                  <div class="flex items-center justify-between">
                    <h3 class="py-1 text-sm text-azure-500">
                      {{ d.device_id }}
                    </h3>
                  </div>
                  <p class="text-xs truncate text-true-gray-400 font-black-light">
                    {{ d.platform }} {{ d.version.name }} {{ d.custom_id }}
                  </p>
                </div>
              </IonLabel>
              <IonNote slot="end">
                {{ formatDate(d.updated_at || '') }}
              </IonNote>
            </IonItem>
          </template>
          <IonInfiniteScroll
            threshold="100px"
            :disabled="isDisabled || !!search"
            @ion-infinite="loadData($event)"
          >
            <IonInfiniteScrollContent
              loading-spinner="bubbles"
              :loading-text="t('loading-more-data')"
            />
          </IonInfiniteScroll>
        </IonList>
      </div>
    </IonContent>
  </IonPage>
</template>
