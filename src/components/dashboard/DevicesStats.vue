<script setup lang="ts">
import type { ChartData, ChartOptions } from 'chart.js'
import type { Organization } from '~/stores/organization'
import { useDark } from '@vueuse/core'
import { CategoryScale, Chart, Filler, LinearScale, LineElement, PointElement, Tooltip } from 'chart.js'
import { computed, ref, watch } from 'vue'
import { Line } from 'vue-chartjs'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useChartData } from '~/services/chartDataService'
import { createTooltipConfig, verticalLinePlugin } from '~/services/chartTooltip'
import { useSupabase } from '~/services/supabase'
import { useOrganizationStore } from '~/stores/organization'

const props = defineProps({
  useBillingPeriod: {
    type: Boolean,
    default: true,
  },
  accumulated: {
    type: Boolean,
    default: true,
  },
})

interface ChartDataset {
  label: string
  data: Array<number | undefined>
}

interface ChartApiData {
  labels: string[]
  datasets: ChartDataset[]
}

Chart.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler)

const isDark = useDark()
const { t } = useI18n()
const route = useRoute('/app/p/[package]')
const organizationStore = useOrganizationStore()
const supabase = useSupabase()

const appId = ref('')
const isLoading = ref(true)
const rawChartData = ref<ChartApiData | null>(null)
const currentRange = ref<{ startDate: Date, endDate: Date } | null>(null)
let requestToken = 0

const latestVersion = computed(() => {
  const chartData = rawChartData.value
  const datasets = chartData?.datasets ?? []

  if (!datasets.length)
    return null

  const lastIndexWithData = datasets.reduce((maxIndex, dataset) => {
    const values = dataset.data ?? []

    for (let index = values.length - 1; index >= 0; index--) {
      const value = values[index]
      if (typeof value === 'number' && !Number.isNaN(value))
        return Math.max(maxIndex, index)
    }

    return maxIndex
  }, -1)

  if (lastIndexWithData < 0)
    return null

  const datasetAtLastDay = datasets.reduce<{ name: string, percentage: number } | null>((current, dataset) => {
    const value = dataset.data?.[lastIndexWithData]
    const numericValue = typeof value === 'number' && !Number.isNaN(value) ? value : null

    if (numericValue === null)
      return current

    if (!current || numericValue > current.percentage)
      return { name: dataset.label, percentage: numericValue }

    return current
  }, null)

  if (datasetAtLastDay)
    return datasetAtLastDay

  const fallbackDataset = datasets.find(dataset => dataset.data && dataset.data[lastIndexWithData] !== undefined)
  if (fallbackDataset) {
    const fallbackValue = fallbackDataset.data?.[lastIndexWithData]
    const numericFallback = typeof fallbackValue === 'number' && !Number.isNaN(fallbackValue) ? fallbackValue : 0
    return {
      name: fallbackDataset.label,
      percentage: numericFallback,
    }
  }

  return null
})
const latestVersionPercentageDisplay = computed(() => {
  const rawPercentage = latestVersion.value?.percentage ?? 0
  if (rawPercentage === null || rawPercentage === undefined)
    return ''

  const percentage = typeof rawPercentage === 'number' ? rawPercentage.toString() : rawPercentage
  const hasSymbol = percentage.includes('%')

  const match = percentage.match(/(\d+(?:\.\d+)?)/)
  if (!match)
    return hasSymbol ? percentage : `${percentage}%`

  const numeric = Number(match[1])
  if (Number.isNaN(numeric))
    return hasSymbol ? percentage : `${percentage}%`

  const rounded = Number(numeric.toFixed(1))
  const formatted = Number.isInteger(rounded) ? Math.trunc(rounded).toString() : rounded.toFixed(1)
  const replaced = percentage.replace(match[1], formatted)
  return hasSymbol ? replaced : `${formatted}%`
})

function normalizeToStartOfDay(date: Date) {
  const normalized = new Date(date)
  normalized.setHours(0, 0, 0, 0)
  return normalized
}

function resolveOrganizationForCurrentContext(): Organization | undefined {
  if (appId.value) {
    const org = organizationStore.getOrgByAppId(appId.value)
    if (org)
      return org
  }
  return organizationStore.currentOrganization
}

function getDateRange() {
  const activeOrganization = resolveOrganizationForCurrentContext()
  if (props.useBillingPeriod) {
    const startDate = normalizeToStartOfDay(new Date(activeOrganization?.subscription_start ?? new Date()))
    const endDate = normalizeToStartOfDay(new Date(activeOrganization?.subscription_end ?? new Date()))

    if (endDate.getTime() < startDate.getTime())
      return { startDate, endDate: startDate }

    return { startDate, endDate }
  }

  const endDate = normalizeToStartOfDay(new Date())
  const startDate = new Date(endDate)
  startDate.setDate(startDate.getDate() - 29)
  return { startDate, endDate }
}

const totalDays = computed(() => {
  if (!currentRange.value) {
    return rawChartData.value?.labels.length ?? 0
  }

  const { startDate, endDate } = currentRange.value
  const diff = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
  const rawLength = rawChartData.value?.labels.length ?? 0
  return Math.max(diff, rawLength)
})

function generateDayLabels(totalLength: number) {
  if (!currentRange.value)
    return Array.from({ length: totalLength }, (_value, index) => index + 1)

  const labels: number[] = []
  const { startDate, endDate } = currentRange.value

  let cursor = new Date(startDate)
  cursor.setHours(0, 0, 0, 0)
  const finalDate = new Date(endDate)
  finalDate.setHours(0, 0, 0, 0)

  const dayInMs = 24 * 60 * 60 * 1000
  while (cursor.getTime() <= finalDate.getTime()) {
    labels.push(cursor.getDate())
    cursor = new Date(cursor.getTime() + dayInMs)
  }

  if (labels.length < totalLength) {
    const lastDay = labels[labels.length - 1] ?? 1
    const remaining = totalLength - labels.length
    for (let i = 1; i <= remaining; i++)
      labels.push(lastDay + i)
  }

  return labels.slice(0, totalLength)
}

function roundPercentageInString(text: string) {
  if (!text)
    return text

  return text.replace(/(\d+(?:\.\d+)?)(?=%)/g, (match) => {
    const numeric = Number(match)
    if (Number.isNaN(numeric))
      return match

    const rounded = Number(numeric.toFixed(1))
    return Number.isInteger(rounded) ? Math.trunc(rounded).toString() : rounded.toFixed(1)
  })
}

const processedChartData = computed<ChartData<'line'> | null>(() => {
  if (!rawChartData.value)
    return null

  const targetLength = Math.max(totalDays.value, rawChartData.value.labels.length)
  let globalLastDataIndex = -1
  const normalizedDatasets = rawChartData.value.datasets.map((dataset) => {
    const rawValues = dataset.data ?? []
    const limitIndex = (() => {
      if (!props.useBillingPeriod)
        return rawValues.length - 1

      if (!currentRange.value)
        return rawValues.length - 1

      const today = normalizeToStartOfDay(new Date())
      const diff = Math.floor((today.getTime() - currentRange.value.startDate.getTime()) / (24 * 60 * 60 * 1000))

      if (Number.isNaN(diff))
        return -1

      if (diff < 0)
        return -1

      return Math.min(diff, rawValues.length - 1)
    })()
    const normalizedValues = rawValues.map((value) => {
      if (typeof value === 'number')
        return value
      if (value === null || value === undefined)
        return undefined
      const parsed = Number(value)
      return Number.isNaN(parsed) ? undefined : parsed
    }).map((value, index) => {
      if (limitIndex < 0)
        return undefined
      if (index > limitIndex)
        return undefined
      return value
    })

    for (let index = normalizedValues.length - 1; index >= 0; index--) {
      const candidate = normalizedValues[index]
      if (typeof candidate === 'number' && Number.isFinite(candidate)) {
        globalLastDataIndex = Math.max(globalLastDataIndex, index)
        break
      }
    }

    return { dataset, normalizedValues }
  })
  const formattedLabels = generateDayLabels(targetLength)
  const datasets: ChartData<'line'>['datasets'] = []

  normalizedDatasets.forEach(({ dataset, normalizedValues }, datasetIndex) => {
    const paddedValues = Array.from({ length: targetLength }, (_val, index) => normalizedValues[index])
    const previousDataset = datasetIndex > 0 ? datasets[datasetIndex - 1] : null
    const previousDatasetData = previousDataset && Array.isArray(previousDataset.data)
      ? previousDataset.data as Array<number | null | undefined>
      : undefined
    let lastKnownBaseValue = 0
    let hasSeenValue = false
    const tooltipBaseValues: Array<number | null> = []
    const processedData = props.accumulated
      ? paddedValues.map((value, pointIndex) => {
          if (globalLastDataIndex < 0) {
            tooltipBaseValues.push(null)
            return null
          }
          if (globalLastDataIndex >= 0 && pointIndex > globalLastDataIndex) {
            tooltipBaseValues.push(null)
            return null
          }
          if (typeof value === 'number' && Number.isFinite(value)) {
            lastKnownBaseValue = value
            hasSeenValue = true
          }

          const hasValidValue = typeof value === 'number' && Number.isFinite(value)
          const baseValue = hasValidValue
            ? value
            : hasSeenValue
              ? lastKnownBaseValue
              : null
          tooltipBaseValues.push(baseValue)
          const previousValueRaw = previousDatasetData?.[pointIndex]
          const hasPreviousValue = typeof previousValueRaw === 'number' && Number.isFinite(previousValueRaw)
          const previousValue = hasPreviousValue ? previousValueRaw : 0
          if (baseValue === null)
            return null

          const stackedValue = datasetIndex === 0 ? baseValue : baseValue + previousValue

          if (!Number.isFinite(stackedValue))
            return datasetIndex > 0 && hasPreviousValue ? previousValue : null

          return stackedValue
        })
      : paddedValues.map((val, pointIndex) => {
          if (globalLastDataIndex >= 0 && pointIndex > globalLastDataIndex) {
            tooltipBaseValues.push(null)
            return null
          }
          const numericValue = typeof val === 'number' && Number.isFinite(val) ? val : null
          tooltipBaseValues.push(numericValue)
          return numericValue
        })

    const chartDataset = {
      ...dataset,
      data: processedData,
      fill: props.accumulated ? (datasetIndex === 0 ? 'origin' : '-1') : false,
      tension: 0.3,
      pointRadius: props.accumulated ? 0 : 2,
      pointBorderWidth: 0,
      borderWidth: 1,
    } as ChartData<'line'>['datasets'][number]
    Object.assign(chartDataset, { metaBaseValues: tooltipBaseValues })
    datasets.push(chartDataset)
  })

  return {
    labels: formattedLabels,
    datasets,
  }
})

const chartOptions = computed<ChartOptions<'line'>>(() => {
  const hasMultipleDatasets = (processedChartData.value?.datasets.length ?? 0) > 1
  const tooltipOptions = createTooltipConfig(hasMultipleDatasets, props.accumulated)

  return {
    maintainAspectRatio: false,
    scales: {
      x: {
        grid: {
          color: `${isDark.value ? '#424e5f' : '#bfc9d6'}`,
        },
        ticks: {
          color: isDark.value ? 'white' : 'black',
          maxRotation: 0,
          autoSkip: true,
        },
      },
      y: {
        beginAtZero: true,
        suggestedMax: 100,
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
      legend: {
        display: hasMultipleDatasets,
        position: 'bottom',
        labels: {
          color: isDark.value ? 'white' : 'black',
          padding: 10,
          font: {
            size: 11,
          },
          generateLabels(chart) {
            const original = Chart.defaults.plugins.legend.labels.generateLabels(chart)
            return original.map(item => ({
              ...item,
              text: roundPercentageInString(item.text),
            }))
          },
        },
      },
      title: { display: false },
      tooltip: tooltipOptions,
      filler: {
        propagate: false,
      },
    },
  } as ChartOptions<'line'>
})

async function loadData() {
  if (!appId.value) {
    rawChartData.value = null
    return
  }

  try {
    await organizationStore.dedupFetchOrganizations()
    await organizationStore.awaitInitialLoad()
  }
  catch (error) {
    console.error('Error preparing organization data for mobile stats:', error)
  }

  const { startDate, endDate } = getDateRange()
  currentRange.value = { startDate, endDate }
  const currentToken = ++requestToken
  isLoading.value = true
  rawChartData.value = null

  try {
    const data = await useChartData(supabase, appId.value, startDate, endDate)
    if (currentToken !== requestToken)
      return
    rawChartData.value = data
  }
  catch (error) {
    console.error(error)
    if (currentToken !== requestToken)
      return
    rawChartData.value = null
  }
  finally {
    if (currentToken === requestToken)
      isLoading.value = false
  }
}

watch(() => props.useBillingPeriod, async () => {
  if (appId.value)
    await loadData()
})

watch(
  () => [route.path, route.params.package as string | undefined] as const,
  async ([path, packageId]) => {
    if (path.includes('/p/') && packageId) {
      appId.value = packageId
      await loadData()
    }
    else {
      appId.value = ''
      requestToken++
      rawChartData.value = null
      isLoading.value = true
    }
  },
  { immediate: true },
)
</script>

<template>
  <div class="flex flex-col bg-white border rounded-lg shadow-lg col-span-full border-slate-300 sm:col-span-6 xl:col-span-4 dark:border-slate-900 dark:bg-gray-800 h-[460px]">
    <div class="pt-4 px-4 flex items-start justify-between gap-2">
      <h2 class="text-2xl font-semibold text-white">
        {{ t('active_users_by_version') }}
      </h2>

      <div class="flex flex-col items-end text-right">
        <div
          class="inline-flex items-center justify-center rounded-full px-2 py-1 bg-emerald-500 text-xs font-bold text-white shadow-lg whitespace-nowrap"
        >
          {{ latestVersionPercentageDisplay }}
        </div>
        <div v-if="latestVersion" class="text-3xl font-bold text-white">
          {{ latestVersion.name }}
        </div>
      </div>
    </div>
    <div class="w-full h-full p-6 pt-2">
      <div v-if="isLoading" class="flex items-center justify-center h-full">
        <Spinner size="w-40 h-40" />
      </div>
      <Line
        v-else-if="processedChartData && processedChartData.datasets.length"
        :data="processedChartData!"
        :options="chartOptions"
        :plugins="[verticalLinePlugin]"
      />
      <div v-else class="flex h-full items-center justify-center text-sm text-slate-500 dark:text-slate-300">
        {{ t('no-data') }}
      </div>
    </div>
  </div>
</template>
