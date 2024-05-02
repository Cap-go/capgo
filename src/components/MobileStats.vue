<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { Line } from 'vue-chartjs'
import dayjs from 'dayjs'
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore'
import type { ChartData, ChartOptions } from 'chart.js'
import annotationPlugin from 'chartjs-plugin-annotation'
import {
  CategoryScale,
  Chart,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
// LineElement,
// LinearScale,
// PointElement,
} from 'chart.js'
import { useSupabase } from '~/services/supabase'
import Spinner from '~/components/Spinner.vue'
import type { Database } from '~/types/supabase.types'
import { urlToAppId } from '~/services/conversion'
import { getMonthSubscriptionDates } from '~/services/date'

Chart.register(
  // Colors,
  // BarController,
  // BarElement,
  Tooltip,
  PointElement,
  CategoryScale,
  LinearScale,
  LineElement,
  annotationPlugin,
  // Legend,
)

interface Version {
  id: {
    name: string
  }
}

const { t } = useI18n()
const route = useRoute()
const supabase = useSupabase()
const organizationStore = useOrganizationStore()
const id = ref('')
const isLoading = ref(true)
const billingStart = ref<null | Date>(null)
const billingEnd = ref<null | Date>(null)
const rawData = ref([] as Database['public']['Tables']['daily_version']['Row'][])
const labels = computed(() => generateLables())
const finalDataset = ref([] as ChartData<'line'>['datasets'])

function buildGraph() {
  const vals = rawData.value.reduce((finalMap, row) => {
    const prev = finalMap.get(row.version_id)
    if (prev)
      finalMap.set(row.version_id, [...prev, row])
    else
      finalMap.set(row.version_id, [row])

    return finalMap
  }, new Map<number, Database['public']['Tables']['daily_version']['Row'][]>())

  console.log(vals)

  const startDayDate = dayjs(billingStart.value).startOf('day')

  const finalMappedData = Array.from(vals.values()).map((val) => {
    const finalData = Array.from({ length: labels.value.length }).fill(0) as number[]

    for (const entry of val) {
      const dateDiff = dayjs(entry.date).diff(startDayDate, 'day')
      finalData[dateDiff] = entry.install! - entry.uninstall!
    }

    const randomColor = Math.floor(Math.random() * 16777215).toString(16)

    return {
      // label: props.title,
      data: finalData,
      borderColor: `#${randomColor}`,
      backgroundColor: `#${randomColor}`,
      tension: 0.3,
      pointRadius: 2,
      pointBorderWidth: 0,
      stepped: true,
    }
  })

  finalDataset.value = finalMappedData
}

function generateLables() {
  const labels = []
  let date = dayjs(billingStart.value)
  dayjs.extend(isSameOrBefore)

  while (date.isSameOrBefore(billingEnd.value)) {
    labels.push(date.date()) // day of the month
    date = date.add(1, 'day')
  }

  return labels
}

async function loadData() {
  try {
    const { data: dataVersions, error } = await supabase
      .from('daily_version')
      .select('*')
      .eq('app_id', id.value)
      .order('date', { ascending: true })
      .gte('date', billingStart.value?.toISOString())
      .lte('date', billingEnd.value?.toISOString())
    // console.log(dataVersions, error)
    rawData.value = dataVersions ?? []
    // bundles.value = (dataVersions || bundles.value) as (Database['public']['Tables']['app_versions_meta']['Row'] & Version)[]
    buildGraph()
  }
  catch (error) {
    console.error(error)
  }
}

const chartData = computed<ChartData<'line'>>(() => ({
  labels: labels.value,
  datasets: finalDataset.value,
}))
const chartOptions = ref({
  maintainAspectRatio: false,
  scales: {
    y: {
      ticks: {
        color: `${isDark.value ? 'white' : 'black'}`,
      },
    },
    x: {
      ticks: {
        color: `${isDark.value ? 'white' : 'black'}`,
      },
    }
    ,
  },
  plugins: {
    // annotation: {
    //   annotations: generateAnnotations.value,
    // },
    legend: {
      display: false,
    },
    title: {
      display: false,
    },
  },
})

watchEffect(async () => {
  if (route.path.includes('/package/')) {
    id.value = (route.params as any).package as string
    id.value = urlToAppId(id.value)

    await organizationStore.awaitInitialLoad()
    const org = organizationStore.getOrgByAppId(id.value)
    if (!org) {
      console.error(`Cannot load mobile stats - org not found for ${id.value}`)
      return
    }

    const [cycleStart, cycleEnd] = getMonthSubscriptionDates(org.subscription_start, org.subscription_end)
    billingStart.value = cycleStart
    billingEnd.value = cycleEnd

    try {
      await loadData()
      isLoading.value = false
    }
    catch (error) {
      console.error(error)
    }
  }
  else {
    isLoading.value = true
  }
})
</script>

<template>
  <div v-if="isLoading" class="flex flex-col items-center justify-center bg-white border rounded-lg shadow-lg col-span-full border-slate-200 sm:col-span-6 xl:col-span-4 dark:border-slate-900 dark:bg-gray-800">
    <Spinner size="w-40 h-40" />
  </div>
  <div v-else class="flex flex-col bg-white border rounded-lg shadow-lg col-span-full border-slate-200 sm:col-span-6 xl:col-span-4 dark:border-slate-900 dark:bg-gray-800">
    <div class="px-5 pt-5">
      <h2 class="mb-2 text-2xl font-semibold text-slate-800 dark:text-white">
        {{ t('bundles') }}
      </h2>
      <div class="mb-1 text-xs font-semibold uppercase text-slate-400 dark:text-white">
        {{ t('usage-title') }}
      </div>
      <div class="flex items-start">
        <div id="bundles-total" class="mr-2 text-3xl font-bold text-slate-800 dark:text-white">
          <!-- {{ bundles.length.toLocaleString() }} -->
        </div>
      </div>
    </div>
    <div class="w-full h-full p-6">
      <Line :data="chartData" :options="chartOptions" />
      <!-- <div class="flex flex-col items-center justify-center h-full">
        {{ t('no-data') }}
      </div> -->
    </div>
  </div>
</template>
