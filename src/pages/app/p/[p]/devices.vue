<script setup lang="ts">
import {
  IonContent,
  IonInfiniteScroll,
  IonInfiniteScrollContent,
  IonItem,
  IonLabel,
  IonList,
  IonNote, IonPage, IonRefresher, IonRefresherContent,
} from '@ionic/vue'
import { computed, ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { subDays } from 'date-fns'
import dayjs from 'dayjs'
import { formatDate } from '~/services/date'
import { useSupabase } from '~/services/supabase'
import type { definitions } from '~/types/supabase'
import Spinner from '~/components/Spinner.vue'
import TitleHead from '~/components/TitleHead.vue'

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
const id = ref('')
const search = ref('')
const isLoading = ref(true)
const isLoadingSub = ref(false)
const devices = ref<(definitions['devices'] & Device)[]>([])
const filtered = ref<(definitions['devices'] & Device)[]>([])

const deviceFiltered = computed(() => {
  if (search.value)
    return filtered.value
  return devices.value
})

const loadData = async (event?: InfiniteScrollCustomEvent) => {
  try {
    // create a date object for the last day of the previous month with dayjs
    const lastDay = dayjs().subtract(1, 'month')
    const { data: dataDev } = await supabase
      .from<definitions['devices'] & Device>('devices')
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
      .gt('updated_at', lastDay.toISOString())
      .order('created_at', { ascending: false })
      .range(fetchOffset, fetchOffset + fetchLimit - 1)
    if (!dataDev)
      return
    devices.value.push(...dataDev)
    if (dataDev.length === fetchLimit)
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

const openDevice = async (device: definitions['devices']) => {
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
const searchVersion = async () => {
  isLoadingSub.value = true
  const { data: dataVersions } = await supabase
    .from<definitions['devices'] & Device>('devices')
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
    .gt('updated_at', subDays(new Date(), 30).toUTCString())
    .order('created_at', { ascending: false })
    .like('device_id', `%${search.value}%`)
  filtered.value = dataVersions || []
  isLoadingSub.value = false
}
const onSearch = (val: string) => {
  search.value = val
  searchVersion()
}
</script>

<template>
  <IonPage>
    <TitleHead :title="t('devices.title')" :search="!isLoading" @search-input="onSearch" />
    <IonContent :fullscreen="true">
      <IonRefresher slot="fixed" @ion-refresh="refreshData($event)">
        <IonRefresherContent />
      </IonRefresher>
      <div v-if="isLoading" class="chat-items flex justify-center">
        <Spinner />
      </div>
      <div v-else>
        <IonList>
          <div v-if="isLoadingSub" class="chat-items flex justify-center">
            <Spinner />
          </div>
          <template v-for="d in deviceFiltered" :key="d.device_id">
            <IonItem class="cursor-pointer" @click="openDevice(d)">
              <IonLabel>
                <div class="col-span-6 flex flex-col">
                  <div class="flex justify-between items-center">
                    <h3 class="py-1 text-sm text-azure-500">
                      {{ d.device_id }}
                    </h3>
                  </div>
                  <p class="text-xs text-true-gray-400 truncate font-black-light">
                    {{ d.platform }} {{ d.version.name }}
                  </p>
                </div>
              </IonLabel>
              <IonNote slot="end">
                {{ formatDate(d.updated_at) }}
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
