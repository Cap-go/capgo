<script setup lang="ts">
import type { ChartData, ChartOptions, Plugin } from 'chart.js'
import { useDark } from '@vueuse/core'
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js'
import { computed } from 'vue'
import { Bar, Line } from 'vue-chartjs'
import { useI18n } from 'vue-i18n'
import { createTooltipConfig, todayLinePlugin, verticalLinePlugin } from '~/services/chartTooltip'
import { getDaysInCurrentMonth } from '~/services/date'
import { useOrganizationStore } from '~/stores/organization'

const props = defineProps({
  title: { type: String, default: '' },
  colors: { type: Object, default: () => ({}) },
  limits: { type: Object, default: () => ({}) },
  data: { type: Array, default: () => Array.from({ length: getDaysInCurrentMonth() }).fill(0) as number[] },
  dataByApp: { type: Object, default: () => ({}) },
  appNames: { type: Object, default: () => ({}) },
  useBillingPeriod: { type: Boolean, default: true },
  accumulated: { type: Boolean, default: false },
})

const isDark = useDark()
const { t } = useI18n()
const organizationStore = useOrganizationStore()
const cycleStart = new Date(organizationStore.currentOrganization?.subscription_start ?? new Date())
const cycleEnd = new Date(organizationStore.currentOrganization?.subscription_end ?? new Date())
// Reset to start of day for consistent date handling
cycleStart.setHours(0, 0, 0, 0)
cycleEnd.setHours(0, 0, 0, 0)

const DAY_IN_MS = 1000 * 60 * 60 * 24

Chart.register(
  Tooltip,
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
)

// Generate infinite distinct pastel colors starting with blue
function generateAppColors(appCount: number) {
  const colors = []

  for (let i = 0; i < appCount; i++) {
    // Start with blue (210°) and use golden ratio for distribution
    const hue = (210 + i * 137.508) % 360 // Start at blue, then golden angle

    // Use pastel-friendly saturation and lightness values
    const saturation = 50 + (i % 3) * 8 // 50%, 58%, 66% - softer colors
    const lightness = 60 + (i % 4) * 5 // 60%, 65%, 70%, 75% - lighter, more pastel

    const backgroundColor = `hsla(${hue}, ${saturation}%, ${lightness}%, 0.8)`

    colors.push(backgroundColor)
  }

  return colors
}

function getDayNumbers(startDate: Date, endDate: Date) {
  const dayNumbers = []
  const currentDate = new Date(startDate)
  while (currentDate.getTime() <= endDate.getTime()) {
    dayNumbers.push(currentDate.getDate())
    currentDate.setDate(currentDate.getDate() + 1)
  }
  return dayNumbers
}

function getTodayLimit(labelCount: number) {
  if (!props.useBillingPeriod)
    return labelCount - 1

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.floor((today.getTime() - cycleStart.getTime()) / DAY_IN_MS)

  if (Number.isNaN(diff) || diff < 0)
    return -1

  return Math.min(diff, labelCount - 1)
}

function transformSeries(source: number[], accumulated: boolean, labelCount: number) {
  const display: Array<number | null> = Array.from({ length: labelCount }).fill(null) as Array<number | null>
  const base: Array<number | null> = Array.from({ length: labelCount }).fill(null) as Array<number | null>
  const limitIndex = getTodayLimit(labelCount)

  if (limitIndex < 0)
    return { display, base }

  let runningTotal = 0
  for (let index = 0; index <= limitIndex; index++) {
    const hasValue = index < source.length && typeof source[index] === 'number' && Number.isFinite(source[index])
    const numericValue = hasValue ? source[index] as number : 0

    base[index] = numericValue
    if (accumulated) {
      runningTotal += numericValue
      display[index] = runningTotal
    }
    else {
      display[index] = numericValue
    }
  }

  return { display, base }
}

function monthdays() {
  if (!props.useBillingPeriod) {
    // Last 30 days mode - generate actual dates
    const today = new Date()
    const dates = []
    for (let i = 29; i >= 0; i--) {
      const date = new Date(today)
      date.setDate(date.getDate() - i)
      dates.push(date.getDate())
    }
    return dates
  }

  // Billing period mode - use existing logic
  return getDayNumbers(cycleStart, cycleEnd)
}

const chartData = computed<ChartData<any>>(() => {
  const appIds = Object.keys(props.dataByApp)
  const labels = monthdays()
  const labelCount = labels.length

  if (appIds.length === 0) {
    // Fallback to single dataset if no app data
    let backgroundColor: string
    let borderColor: string
    let processed: { display: Array<number | null>, base: Array<number | null> }

    // Process data for cumulative mode
    if (props.accumulated) {
      processed = transformSeries(props.data as number[], true, labelCount)
      // Use LineChartStats color scheme for line mode
      borderColor = `hsl(210, 65%, 45%)`
      backgroundColor = `hsla(210, 50%, 60%, 0.6)`
    }
    else {
      processed = transformSeries(props.data as number[], false, labelCount)
      // Use existing bar chart colors for bar mode
      backgroundColor = props.colors[400]
      borderColor = props.colors[200]
    }

    const baseDataset: any = {
      label: props.title,
      data: processed.display,
      backgroundColor,
      borderColor,
      borderWidth: 1,
      metaBaseValues: processed.base,
    }

    // Add line-specific properties for accumulated mode (match UsageCard styling)
    const dataset = props.accumulated
      ? {
          ...baseDataset,
          fill: 'origin', // Fill from bottom for single dataset
          tension: 0.3,
          pointRadius: 0,
          pointBorderWidth: 0,
          borderWidth: 1,
        }
      : baseDataset
    return {
      labels,
      datasets: [dataset],
    }
  }

  // Create stacked datasets for each app
  const appColors = generateAppColors(appIds.length)
  const datasets = appIds.map((appId, index) => {
    const appData = props.dataByApp[appId] as number[]

    let backgroundColor: string
    let borderColor: string
    let processed: { display: Array<number | null>, base: Array<number | null> }

    // Process data for cumulative mode
    if (props.accumulated) {
      processed = transformSeries(appData, true, labelCount)
      // Use LineChartStats color scheme for line mode
      const hue = (210 + index * 137.508) % 360
      const saturation = 50 + (index % 3) * 8
      const lightness = 60 + (index % 4) * 5
      borderColor = `hsl(${hue}, ${saturation + 15}%, ${lightness - 15}%)`
      backgroundColor = `hsla(${hue}, ${saturation}%, ${lightness}%, 0.6)`
    }
    else {
      processed = transformSeries(appData, false, labelCount)
      // Use existing bar chart colors for bar mode
      backgroundColor = appColors[index]
      borderColor = backgroundColor.replace('hsla', 'hsl').replace(', 0.8)', ')').replace(/(\d+)%\)/, (_, lightness) => {
        const newLightness = Math.max(Number(lightness) - 15, 30)
        return `${newLightness}%)`
      })
    }

    const baseDataset: any = {
      label: props.appNames[appId] || appId,
      data: processed.display,
      backgroundColor,
      borderColor,
      borderWidth: 1,
      metaBaseValues: processed.base,
    }

    // Add line-specific properties for accumulated mode (match UsageCard styling)
    return props.accumulated
      ? {
          ...baseDataset,
          fill: index === 0 ? 'origin' : '-1', // First fills from bottom, others fill from previous dataset
          tension: 0.3,
          pointRadius: 0,
          pointBorderWidth: 0,
          borderWidth: 1,
        }
      : baseDataset
  })

  return {
    labels,
    datasets,
  }
})

const todayLineOptions = computed(() => {
  if (!props.useBillingPeriod)
    return { enabled: false }

  const labels = Array.isArray(chartData.value.labels) ? chartData.value.labels : []
  const index = getTodayLimit(labels.length)

  if (index < 0 || index >= labels.length)
    return { enabled: false }

  const strokeColor = isDark.value ? 'rgba(165, 180, 252, 0.75)' : 'rgba(99, 102, 241, 0.7)'
  const glowColor = isDark.value ? 'rgba(129, 140, 248, 0.35)' : 'rgba(165, 180, 252, 0.35)'
  const badgeFill = isDark.value ? 'rgba(67, 56, 202, 0.45)' : 'rgba(199, 210, 254, 0.85)'
  const textColor = isDark.value ? '#e0e7ff' : '#312e81'

  return {
    enabled: true,
    xIndex: index,
    label: t('today'),
    color: strokeColor,
    glowColor,
    badgeFill,
    textColor,
  }
})

const chartOptions = computed(() => {
  const datasetCount = Object.keys(props.dataByApp).length
  const hasMultipleDatasets = datasetCount > 0
  const axisTicksColor = isDark.value ? 'white' : 'black'
  const stacked = hasMultipleDatasets

  return {
    maintainAspectRatio: false,
    scales: {
      y: {
        beginAtZero: true,
        stacked,
        ticks: {
          color: axisTicksColor,
        },
        grid: {
          color: `${isDark.value ? '#424e5f' : '#bfc9d6'}`,
        },
      },
      x: {
        stacked,
        ticks: {
          color: axisTicksColor,
        },
        grid: {
          color: `${isDark.value ? '#323e4e' : '#cad5e2'}`,
        },
      },
    },
    plugins: {
      legend: {
        display: hasMultipleDatasets,
        position: 'bottom' as const,
        labels: {
          color: axisTicksColor,
          padding: 10,
          font: {
            size: 11,
          },
        },
      },
      title: {
        display: false,
      },
      tooltip: createTooltipConfig(hasMultipleDatasets, props.accumulated),
      todayLine: todayLineOptions.value,
    },
  }
})

const lineChartOptions = computed(() => chartOptions.value as unknown as ChartOptions<'line'>)
const barChartOptions = computed(() => chartOptions.value as unknown as ChartOptions<'bar'>)
const sharedPlugins = [verticalLinePlugin, todayLinePlugin]
const linePlugins = sharedPlugins as unknown as Plugin<'line'>[]
const barPlugins = sharedPlugins as unknown as Plugin<'bar'>[]
</script>

<template>
  <div class="w-full h-full">
    <Line
      v-if="accumulated"
      :data="chartData"
      :options="lineChartOptions"
      :plugins="linePlugins"
    />
    <Bar
      v-else
      :data="chartData"
      :options="barChartOptions"
      :plugins="barPlugins"
    />
  </div>
</template>
