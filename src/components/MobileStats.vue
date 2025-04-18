<script setup lang="ts">
import type { ChartOptions } from 'chart.js'
import { CategoryScale, Chart, LinearScale, LineElement, PointElement, Tooltip } from 'chart.js'
import dayjs from 'dayjs'
import { useI18n } from 'petite-vue-i18n'
import { computed, ref, watchEffect } from 'vue'
import { Line } from 'vue-chartjs'
import { useRoute } from 'vue-router'
import IcBaselineInfo from '~icons/ic/baseline-info'
import { useChartData } from '~/services/chartDataService'
import { urlToAppId } from '~/services/conversion'
import { useSupabase } from '~/services/supabase'
import { useMainStore } from '~/stores/main'

Chart.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip)

const { t } = useI18n()
const route = useRoute('/app/p/[package]')
const main = useMainStore()

const appId = ref('')
const isLoading = ref(true)

const chartOptions = computed<ChartOptions<'line'>>(() => ({
  maintainAspectRatio: false,
  scales: {
    x: {
      grid: { display: false },
      ticks: { color: isDark.value ? 'white' : 'black' },
    },
    y: {
      min: 0,
      max: 100,
      ticks: {
        callback: (value: number) => `${value}%`,
        color: isDark.value ? 'white' : 'black',
      },
    },
  },
  plugins: {
    legend: { display: false },
    title: { display: false },
  },
} as any))

const chartData = ref<any>(null)

async function loadData() {
  isLoading.value = true

  const { startDate, endDate } = getDateRange(30)
  chartData.value = await useChartData(useSupabase(), appId.value, startDate, endDate)
  isLoading.value = false
}

function getLast30Days() {
  const dates = []
  const endDate = new Date()
  for (let i = 30; i > 0; i--) {
    const date = new Date(endDate)
    date.setDate(endDate.getDate() - i)
    dates.push(date.toISOString().slice(0, 10))
  }
  return dates
}

function getDateRange(days: number) {
  const endDate = new Date()
  const startDate = new Date(endDate)
  startDate.setDate(startDate.getDate() - days)
  return { startDate, endDate }
}

watchEffect(async () => {
  if (route.path.includes('/p/')) {
    appId.value = urlToAppId(route.params.package as string)
    try {
      await loadData()
    }
    catch (error) {
      console.error(error)
    }
  }
  else {
    isLoading.value = true
  }
})

function lastRunDate() {
  const lastRun = dayjs(main.statsTime.last_run).format('MMMM D, YYYY HH:mm')
  return `${t('last-run')}: ${lastRun}`
}
function nextRunDate() {
  const nextRun = dayjs(main.statsTime.next_run).format('MMMM D, YYYY HH:mm')
  return `${t('next-run')}: ${nextRun}`
}
</script>

<template>
  <div class="flex flex-col bg-white border rounded-lg shadow-lg col-span-full border-slate-300 sm:col-span-6 xl:col-span-4 dark:border-slate-900 dark:bg-gray-800 h-[460px]">
    <div class="px-5 pt-3">
      <div class="flex flex-row items-center">
        <h2 class="mb-2 mr-2 text-2xl font-semibold text-slate-800 dark:text-white">
          {{ t('active_users_by_version') }}
        </h2>
        <div class="tooltip">
          <div class="flex items-center justify-center w-5 h-5 cursor-pointer">
            <IcBaselineInfo class="w-4 h-4 text-slate-400 dark:text-white" />
          </div>
          <div class="tooltip-content">
            <div class="max-w-xs whitespace-normal">
              {{ lastRunDate() }}
            </div>
            <div class="max-w-xs whitespace-normal">
              {{ nextRunDate() }}
            </div>
          </div>
        </div>
        <div class="font-medium badge badge-primary">
          beta
        </div>
      </div>

      <div class="mb-1 text-xs font-semibold uppercase text-slate-400 dark:text-white">
        {{ t('latest_version') }}
      </div>
      <div v-if="chartData && chartData.latestVersion" class="flex items-start">
        <div id="usage_val" class="mr-2 text-3xl font-bold text-slate-800 dark:text-white">
          {{ chartData.latestVersion?.name }}
        </div>
        <div class="rounded-full bg-emerald-500 px-1.5 text-sm font-semibold text-white">
          {{ chartData.latestVersion?.percentage }}%
        </div>
      </div>
    </div>
    <div class="w-full h-full p-6">
      <Line v-if="!isLoading" :data="{ labels: getLast30Days(), datasets: chartData.datasets }" :options="chartOptions" />
      <div v-else class="flex items-center justify-center h-full">
        <Spinner size="w-40 h-40" />
      </div>
    </div>
  </div>
</template>
