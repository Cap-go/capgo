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
import { DoughnutChart, useDoughnutChart } from 'vue-chart-3'
import type { ChartData, ChartOptions } from 'chart.js'
import { subDays } from 'date-fns'
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
interface Stat {
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
const id = ref('')
const search = ref('')
const isLoading = ref(true)
const isDisabled = ref(false)
const downloads = ref(0)
const versions = ref<definitions['app_versions'][]>([])
const devices = ref<(definitions['devices'] & Device)[]>([])
const dataDevValues = ref([30, 40, 60, 70, 5])
const dataDevLabels = ref(['Paris', 'Nîmes', 'Toulon', 'Perpignan', 'Autre'])
const isLoadingSub = ref(false)
const stats = ref<(definitions['stats'] & Stat)[]>([])
const filtered = ref<(definitions['stats'] & Stat)[]>([])

const statsFiltered = computed(() => {
  if (search.value)
    return filtered.value
  return stats.value
})

const buildGraph = () => {
  const vals = devices.value.reduce((past, d) => {
    past[d.version.name] = past[d.version.name] ? past[d.version.name] + 1 : 1
    return past
  }, { } as any)
  dataDevValues.value = Object.values(vals)
  dataDevLabels.value = Object.keys(vals)
}

const loadData = async () => {
  try {
    const { data: dataDevices } = await supabase
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
    const { data: dataVersions } = await supabase
      .from<definitions['app_versions']>('app_versions')
      .select()
      .eq('app_id', id.value)
      .eq('deleted', false)
      .order('created_at', { ascending: false })
    versions.value = dataVersions || versions.value
    devices.value = dataDevices || devices.value
    // console.log('devices', devices.value)
    buildGraph()
  }
  catch (error) {
    console.error(error)
  }
}

const getLastDownload = async () => {
  // create date_id with format YYYY-MM
  const date_id = new Date().toISOString().slice(0, 7)
  const { data } = await supabase
    .from<definitions['app_stats']>('app_stats')
    .select()
    .eq('app_id', id.value)
    .eq('date_id', date_id)
    .single()
  if (data) {
    // find biggest value between mlu and mlu_real
    downloads.value = Math.max(data.mlu, data.mlu_real)
  }
}

const loadStatsData = async (event?: InfiniteScrollCustomEvent) => {
  try {
    // create a date object for the last day of the previous month with dayjs
    const { data: dataStats } = await supabase
      .from<(definitions['stats'] & Stat)>('stats')
      .select(`
        device_id,
        action,
        platform,
        version (
            name
        ),
        created_at,
        updated_at
      `)
      .eq('app_id', id.value)
      .order('created_at', { ascending: false })
      .range(fetchOffset, fetchOffset + fetchLimit - 1)
    if (!dataStats)
      return
    stats.value.push(...dataStats)
    if (dataStats.length === fetchLimit)
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

const openDevice = async (stat: definitions['stats']) => {
  router.push(`/app/p/${id.value.replace(/\./g, '--')}/d/${stat.device_id}`)
}

const refreshStatsData = async (evt: RefresherCustomEvent | null = null) => {
  isLoading.value = true
  try {
    devices.value = []
    fetchOffset = 0
    await loadStatsData()
  }
  catch (error) {
    console.error(error)
  }
  isLoading.value = false
  evt?.target?.complete()
}

const refreshData = async (evt: RefresherCustomEvent | null = null) => {
  isLoading.value = true
  try {
    await refreshStatsData()
    await loadData()
    await getLastDownload()
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

const testData = computed<ChartData<'doughnut'>>(() => ({
  labels: dataDevLabels.value,
  datasets: [
    {
      data: dataDevValues.value,
      backgroundColor: [
        '#77CEFF',
        '#0079AF',
        '#123E6B',
        '#97B0C4',
        '#A5C8ED',
      ],
    },
  ],
}))

const options = computed<ChartOptions<'doughnut'>>(() => ({
  plugins: {
    legend: {
      position: 'left',
    },
    title: {
      display: true,
      text: 'Devices breakdown',
    },
  },
}))

const { doughnutChartProps } = useDoughnutChart({
  chartData: testData,
  options,
})

watchEffect(async () => {
  if (route.path.endsWith('/stats')) {
    id.value = route.params.p as string
    id.value = id.value.replace(/--/g, '.')
    await refreshData()
  }
})
</script>

<template>
  <IonPage>
    <TitleHead :title="t('stats.title')" />
    <IonContent :fullscreen="true">
      <IonRefresher slot="fixed" @ion-refresh="refreshData($event)">
        <IonRefresherContent />
      </IonRefresher>
      <div v-if="isLoading" class="chat-items flex justify-center">
        <Spinner />
      </div>
      <div v-else>
        <p class="text-center">
          {{ t('stats.subtitle') }}
        </p>
        <div class="grid h-32 grid-flow-row grid-cols-3 gap-2 sm:w-1/4 mx-auto w-full">
          <div class="flex flex-col justify-center px-4 py-4 bg-white border border-gray-300 rounded">
            <div>
              <p class="text-3xl font-semibold text-center text-gray-800">
                {{ devices.length }}
              </p>
              <p class="text-sm text-center text-gray-500">
                {{ t('monthly-active-users') }}
              </p>
            </div>
          </div>

          <div class="flex flex-col justify-center px-4 py-4 bg-white border border-gray-300 rounded">
            <div>
              <p class="text-3xl font-semibold text-center text-gray-800">
                {{ versions.length }}
              </p>
              <p class="text-sm text-center text-gray-500">
                {{ t('stats.versions') }}
              </p>
            </div>
          </div>

          <div class="flex flex-col justify-center px-4 py-4 bg-white border border-gray-300 rounded">
            <div>
              <p class="text-3xl font-semibold text-center text-gray-800">
                {{ downloads }}
              </p>
              <p class="text-sm text-center text-gray-500">
                {{ t('stats.downloads') }}
              </p>
            </div>
          </div>
        </div>
        <DoughnutChart class="my-8 mx-auto w-100 h-100" v-bind="doughnutChartProps" />
        <IonList>
          <div v-if="isLoadingSub" class="chat-items flex justify-center">
            <Spinner />
          </div>
          <template v-for="s in statsFiltered" :key="s.id">
            <IonItem class="cursor-pointer" @click="openDevice(s)">
              <IonLabel>
                <h2 class="text-sm text-azure-500">
                  {{ s.device_id }} {{ s.platform }} {{ s.action }} {{ s.version.name }}
                </h2>
              </IonLabel>
              <IonNote slot="end">
                {{ formatDate(s.updated_at) }}
              </IonNote>
            </IonItem>
          </template>
          <IonInfiniteScroll
            threshold="100px"
            :disabled="isDisabled || !!search"
            @ion-infinite="loadStatsData($event)"
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
