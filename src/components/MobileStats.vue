<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Line } from 'vue-chartjs'
import {
  CategoryScale,
  Chart,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js'
import colors from 'tailwindcss/colors'
import type { appUsageByVersion } from '~/services/supabase'
import { getDailyVersion, getVersionNames } from '~/services/supabase'
import { urlToAppId } from '~/services/conversion'

const { t } = useI18n()
const route = useRoute()

const appId = ref('')
const isLoading = ref(true)
const SKIP_COLOR = 10
const colorKeys = Object.keys(colors)
const dailyUsage = ref<appUsageByVersion[]>([])
const versionNames = ref<{ id: string, name: string, created_at: string }[]>([])

const organizationStore = useOrganizationStore()
const cycleStart = computed(() => new Date(organizationStore.currentOrganization?.subscription_start ?? ''))
const cycleEnd = computed(() => new Date(organizationStore.currentOrganization?.subscription_end ?? ''))

Chart.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip)

async function loadData() {
  isLoading.value = true

  dailyUsage.value = await getDailyVersion(appId.value, cycleStart.value.toISOString(), cycleEnd.value.toISOString())
  versionNames.value = await getVersionNames(appId.value, dailyUsage.value.map(d => d.version_id))
  isLoading.value = false
}

const chartData = computed(() => {
  // Get unique version IDs and dates from the dailyUsage data
  const versions = [...new Set(dailyUsage.value.map(d => d.version_id))]
  const dates = [...new Set(dailyUsage.value.map(d => d.date))]

  // Create an object to store the accumulated data for each version by date
  const accumulatedDataByVersionAndDate: { [date: string]: { [version: number]: number } } = {}

  // Calculate the accumulated data for each version by date
  dailyUsage.value.forEach((usage) => {
    const { date, version_id, install, uninstall } = usage
    if (!accumulatedDataByVersionAndDate[date]) {
      accumulatedDataByVersionAndDate[date] = {}
    }
    const lastTotal = accumulatedDataByVersionAndDate[date][version_id] || 0
    const currentTotal = lastTotal + (install ?? 0) - (uninstall ?? 0)
    accumulatedDataByVersionAndDate[date][version_id] = currentTotal
  })

  // Calculate the total accumulated value for each date
  const totalAccumulatedByDate: { [date: string]: number } = {}
  dates.forEach((date) => {
    const totalAccumulated = Object.values(accumulatedDataByVersionAndDate[date] || {}).reduce(
      (sum, value) => sum + value,
      0,
    )
    totalAccumulatedByDate[date] = totalAccumulated
  })

  // Filter out versions with 0 active users on every day
  const activeVersions = versions.filter((version) => {
    return dates.some((date) => {
      // version is more than 0 and version name is not 'builtin'
      return accumulatedDataByVersionAndDate[date]?.[version] > 0 && versionNames.value.find(v => v.id === version)?.name !== 'builtin'
    })
  })

  // Create a dataset for each active version
  const datasets = activeVersions.map((version, i) => {
    // Calculate the percentage of the maximum total accumulated value for each date
    const percentageData = dates.map((date) => {
      const versionAccumulated = accumulatedDataByVersionAndDate[date]?.[version] || 0
      const totalAccumulated = totalAccumulatedByDate[date] || 0
      return totalAccumulated > 0 ? (versionAccumulated / totalAccumulated) * 100 : 0
    })

    // Get a color from the colorKeys array based on the version index
    const color = colorKeys[(i + SKIP_COLOR) % colorKeys.length]

    const versionName = versionNames.value.find(v => v.id === version)?.name || version
    // Return the dataset object for the current version
    return {
      label: versionName,
      data: percentageData,
      borderColor: colors[color][400],
      backgroundColor: colors[color][200],
      tension: 0.3,
      pointRadius: 2,
      pointBorderWidth: 0,
    }
  })

  // Find the maximum accumulated value across all versions and dates
  const maxAccumulatedValue = Math.max(...datasets.map(dataset => Math.max(...dataset.data)))

  // Normalize the data to represent percentages
  const normalizedDatasets = datasets.map((dataset) => {
    const normalizedData = dataset.data.map(value => (value / maxAccumulatedValue) * 100)
    return {
      ...dataset,
      data: normalizedData,
    }
  })

  // Find the latest released version based on the created_at field
  const latestVersion = versionNames.value.reduce((latest, current) => {
    return new Date(current.created_at) > new Date(latest.created_at) ? current : latest
  }, versionNames.value[0])

  // Find the dataset corresponding to the latest version
  const latestVersionDataset = normalizedDatasets.find(dataset => dataset.label === latestVersion?.name)

  // Get the current percentage of the latest version (last data point)
  const latestVersionPercentage = latestVersionDataset ? latestVersionDataset.data[latestVersionDataset.data.length - 1] : 0

  // Return the chart data object
  return {
    labels: dates,
    datasets: normalizedDatasets,
    latestVersion: {
      name: latestVersion?.name,
      percentage: latestVersionPercentage.toFixed(2),
    },
  }
})

const chartOptions = ref({
  maintainAspectRatio: false,
  scales: {
    x: {
      grid: {
        display: false,
      },
      ticks: {
        color: `${isDark.value ? 'white' : 'black'}`,
      },
    },
    y: {
      min: 0,
      max: 100,
      ticks: {
        callback: (value: number) => `${value}%`,
        color: `${isDark.value ? 'white' : 'black'}`,
      },
    },
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
    appId.value = route.params.package as string
    appId.value = urlToAppId(appId.value)
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
  <div class="flex flex-col bg-white border rounded-lg shadow-lg col-span-full border-slate-200 sm:col-span-6 xl:col-span-4 dark:border-slate-900 dark:bg-gray-800 h-[460px]">
    <div class="px-5 pt-3">
      <div class="flex flex-row">
        <h2 class="mb-2 mr-4 text-2xl font-semibold text-slate-800 dark:text-white">
          {{ t('active_users_by_version') }}
        </h2>
        <div class="font-medium badge badge-primary">
          beta
        </div>
      </div>

      <div class="mb-1 text-xs font-semibold uppercase text-slate-400 dark:text-white">
        {{ t('latest_version') }}
      </div>
      <div v-if="chartData.latestVersion" class="flex items-start">
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
