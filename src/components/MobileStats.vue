<script setup lang="ts">
import type { ChartOptions } from 'chart.js'
import { useDark } from '@vueuse/core'
import { CategoryScale, Chart, LinearScale, LineElement, PointElement, Tooltip } from 'chart.js'
import { computed, ref, watch, watchEffect } from 'vue'
import { Line } from 'vue-chartjs'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useChartData } from '~/services/chartDataService'
import { useSupabase } from '~/services/supabase'
import { useOrganizationStore } from '~/stores/organization'

const props = defineProps({
  useBillingPeriod: {
    type: Boolean,
    default: true,
  },
})

Chart.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip)

const isDark = useDark()
const { t } = useI18n()
const route = useRoute('/app/p/[package]')

const appId = ref('')
const isLoading = ref(true)

const chartOptions = computed<ChartOptions<'line'>>(() => ({
  maintainAspectRatio: false,
  scales: {
    x: {
      grid: {
        color: `${isDark.value ? '#424e5f' : '#bfc9d6'}`,
      },
      ticks: { color: isDark.value ? 'white' : 'black' },
    },
    y: {
      min: 0,
      max: 100,
      grid: {
        color: `${isDark.value ? '#323e4e' : '#cad5e2'}`,
      },
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
  console.log('loadData mobile data')
  isLoading.value = true

  const { startDate, endDate } = getDateRange()
  chartData.value = await useChartData(useSupabase(), appId.value, startDate, endDate)
  isLoading.value = false
}

function getDateRange() {
  const organizationStore = useOrganizationStore()

  if (props.useBillingPeriod) {
    // Use billing period dates
    const startDate = new Date(organizationStore.currentOrganization?.subscription_start ?? new Date())
    const endDate = new Date(organizationStore.currentOrganization?.subscription_end ?? new Date())
    return { startDate, endDate }
  }
  else {
    // Use last 30 days
    const endDate = new Date()
    const startDate = new Date(endDate)
    startDate.setDate(startDate.getDate() - 30)
    return { startDate, endDate }
  }
}

// Watch for billing period mode changes and reload data
watch(() => props.useBillingPeriod, async () => {
  if (appId.value) {
    await loadData()
  }
})

watchEffect(async () => {
  if (route.path.includes('/p/')) {
    appId.value = route.params.package as string
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
</script>

<template>
  <div class="flex flex-col bg-white border rounded-lg shadow-lg col-span-full border-slate-300 sm:col-span-6 xl:col-span-4 dark:border-slate-900 dark:bg-gray-800 h-[460px]">
    <div class="px-5 pt-3">
      <div class="flex flex-row items-center">
        <h2 class="mb-2 mr-2 text-2xl font-semibold text-slate-800 dark:text-white">
          {{ t('active_users_by_version') }}
        </h2>
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
      <Line v-if="!isLoading" :data="chartData" :options="chartOptions" />
      <div v-else class="flex items-center justify-center h-full">
        <Spinner size="w-40 h-40" />
      </div>
    </div>
  </div>
</template>
