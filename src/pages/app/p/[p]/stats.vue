<script setup lang="ts">
import {
  IonButton, IonButtons, IonContent,
  IonHeader,
  IonIcon,
  IonPage, IonRefresher, IonRefresherContent,
  IonTitle,
  IonToolbar,
} from '@ionic/vue'
import { chevronBack } from 'ionicons/icons'
import { computed, ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { DoughnutChart, useDoughnutChart } from 'vue-chart-3'
import type { ChartData, ChartOptions } from 'chart.js'
import { subDays } from 'date-fns'
import { useSupabase } from '~/services/supabase'
import type { definitions } from '~/types/supabase'
import Spinner from '~/components/Spinner.vue'

interface Device {
  version: {
    name: string
  }
}
const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const supabase = useSupabase()
const id = ref('')
const isLoading = ref(true)
const downloads = ref(0)
const versions = ref<definitions['app_versions'][]>([])
const devices = ref<(definitions['devices'] & Device)[]>([])
const dataDevValues = ref([30, 40, 60, 70, 5])
const dataDevLabels = ref(['Paris', 'Nîmes', 'Toulon', 'Perpignan', 'Autre'])

const buildGraph = () => {
  const vals = devices.value.reduce((past, d) => {
    past[d.version.name] = past[d.version.name] ? past[d.version.name] + 1 : 1
    return past
  }, { } as any)
  dataDevValues.value = Object.values(vals)
  dataDevLabels.value = Object.keys(vals)
}

const loadData = async() => {
  try {
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
      .gt('updated_at', subDays(new Date(), 30).toUTCString())
    const { data: dataVersions } = await supabase
      .from<definitions['app_versions']>('app_versions')
      .select()
      .eq('app_id', id.value)
      .eq('deleted', false)
      .order('created_at', { ascending: false })
    versions.value = dataVersions || versions.value
    devices.value = dataDev || devices.value
    buildGraph()
  }
  catch (error) {
    console.error(error)
  }
}

const getLastDownload = async() => {
  const { data, error } = await supabase.rpc<number>('get_dl_by_month_by_app', { pastmonth: 0, appid: id.value })
  if (error)
    downloads.value = 0
  else
    downloads.value = Number(data)
}

const refreshData = async(evt: RefresherCustomEvent | null = null) => {
  isLoading.value = true
  try {
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

watchEffect(async() => {
  if (route.path.endsWith('/stats')) {
    id.value = route.params.p as string
    id.value = id.value.replaceAll('--', '.')
    await refreshData()
  }
})
const back = () => {
  router.go(-1)
}
</script>
<template>
  <ion-page>
    <IonHeader class="header-custom">
      <IonToolbar class="toolbar-no-border">
        <IonButtons slot="start" class="mx-3">
          <IonButton @click="back">
            <IonIcon :icon="chevronBack" class="text-grey-dark" /> {{ t('button.back') }}
          </IonButton>
        </IonButtons>
        <IonTitle color="warning">
          {{ t('stats.title') }}
        </IonTitle>
      </IonToolbar>
    </IonHeader>
    <ion-content :fullscreen="true">
      <ion-refresher slot="fixed" @ionRefresh="refreshData($event)">
        <ion-refresher-content />
      </ion-refresher>
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
                Devices
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
      </div>
    </ion-content>
  </ion-page>
</template>
