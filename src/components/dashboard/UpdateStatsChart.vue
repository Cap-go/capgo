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
import { getDaysInCurrentMonth } from '~/services/date'
import { useOrganizationStore } from '~/stores/organization'
import { createTooltipConfig, todayLinePlugin, verticalLinePlugin } from '../../services/chartTooltip'

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

const ACTION_STYLES: Record<string, { barBackground: string, barBorder: string, lineBackground: string, lineBorder: string }> = {
  requested: {
    barBackground: 'hsla(210, 65%, 60%, 0.8)',
    barBorder: 'hsl(210, 65%, 45%)',
    lineBackground: 'hsla(210, 65%, 60%, 0.35)',
    lineBorder: 'hsl(210, 70%, 50%)',
  },
  install: {
    barBackground: 'hsla(135, 60%, 60%, 0.8)',
    barBorder: 'hsl(135, 60%, 45%)',
    lineBackground: 'hsla(135, 60%, 60%, 0.35)',
    lineBorder: 'hsl(135, 65%, 45%)',
  },
  fail: {
    barBackground: 'hsla(0, 65%, 65%, 0.8)',
    barBorder: 'hsl(0, 65%, 50%)',
    lineBackground: 'hsla(0, 65%, 65%, 0.35)',
    lineBorder: 'hsl(0, 70%, 50%)',
  },
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

const chartData = computed<ChartData<'bar' | 'line'>>(() => {
  // Always show breakdown by action type (requested/install/fail)
  const labels = monthdays()
  const labelCount = labels.length
  const actionTypes: Array<'requested' | 'install' | 'fail'> = ['requested', 'install', 'fail']
  const datasets = actionTypes.map((action, index) => {
    const actionData = props.dataByApp[action] as number[] | undefined
    const actionName = props.appNames[action] || action
    const style = ACTION_STYLES[action] ?? ACTION_STYLES.requested
    const rawData = actionData && actionData.length ? actionData : Array.from({ length: labels.length }).fill(0) as Array<number>
    const processed = transformSeries(rawData, props.accumulated, labelCount)

    const backgroundColor = props.accumulated ? style.lineBackground : style.barBackground
    const borderColor = props.accumulated ? style.lineBorder : style.barBorder

    const baseDataset: any = {
      label: actionName,
      data: processed.display,
      backgroundColor,
      borderColor,
      borderWidth: 1,
      metaBaseValues: processed.base,
    } as ChartData<'bar' | 'line'>['datasets'][number]

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
  const axisTicksColor = isDark.value ? 'white' : 'black'

  return {
    maintainAspectRatio: false,
    scales: {
      y: {
        beginAtZero: true,
        stacked: true,
        ticks: {
          color: axisTicksColor,
        },
        grid: {
          color: `${isDark.value ? '#424e5f' : '#bfc9d6'}`,
        },
      },
      x: {
        stacked: true,
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
        display: true,
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
      tooltip: createTooltipConfig(true, props.accumulated),
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
      :data="chartData as any"
      :options="lineChartOptions as any"
      :plugins="linePlugins"
    />
    <Bar
      v-else
      :data="chartData as any"
      :options="barChartOptions as any"
      :plugins="barPlugins"
    />
  </div>
</template>
