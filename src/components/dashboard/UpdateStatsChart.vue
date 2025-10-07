<script setup lang="ts">
import type { ChartData, ChartOptions } from 'chart.js'
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
import { getDaysInCurrentMonth } from '~/services/date'
import { useOrganizationStore } from '~/stores/organization'
import { createTooltipConfig, verticalLinePlugin } from '../../services/chartTooltip'

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
const organizationStore = useOrganizationStore()
const cycleStart = new Date(organizationStore.currentOrganization?.subscription_start ?? new Date())
const cycleEnd = new Date(organizationStore.currentOrganization?.subscription_end ?? new Date())
// Reset to start of day for consistent date handling
cycleStart.setHours(0, 0, 0, 0)
cycleEnd.setHours(0, 0, 0, 0)

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

// Helper function to accumulate data
function accumulateData(data: number[]): number[] {
  return data.reduce((acc: number[], val: number) => {
    const last = acc[acc.length - 1] ?? 0
    const newVal = last + (val ?? 0)
    return acc.concat([newVal])
  }, [])
}

const chartData = computed<ChartData<'bar' | 'line'>>(() => {
  // Always show breakdown by action type (requested/install/fail)
  const labels = monthdays()
  const actionTypes: Array<'requested' | 'install' | 'fail'> = ['requested', 'install', 'fail']
  const datasets = actionTypes.map((action, index) => {
    const actionData = props.dataByApp[action] as number[] | undefined
    const actionName = props.appNames[action] || action
    const style = ACTION_STYLES[action] ?? ACTION_STYLES.requested
    const rawData = (actionData && actionData.length ? actionData : Array.from({ length: labels.length }).fill(0)) as number[]
    const processedData = props.accumulated ? accumulateData(rawData) : rawData

    const backgroundColor = props.accumulated ? style.lineBackground : style.barBackground
    const borderColor = props.accumulated ? style.lineBorder : style.barBorder

    const baseDataset = {
      label: actionName,
      data: processedData,
      backgroundColor,
      borderColor,
      borderWidth: 1,
    } as ChartData<'bar' | 'line'>['datasets'][number]
    Object.assign(baseDataset, { metaBaseValues: processedData })

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

const chartOptions = computed<ChartOptions<'bar' | 'line'>>(() => ({
  maintainAspectRatio: false,
  scales: {
    y: {
      beginAtZero: true,
      stacked: true, // Always stack when there are multiple datasets
      ticks: {
        color: `${isDark.value ? 'white' : 'black'}`,
        // Remove stepSize to let Chart.js auto-calculate optimal steps
      },
      grid: {
        color: `${isDark.value ? '#424e5f' : '#bfc9d6'}`,
      },
    },
    x: {
      stacked: true, // Always stack when there are multiple datasets
      ticks: {
        color: `${isDark.value ? 'white' : 'black'}`,
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
        color: `${isDark.value ? 'white' : 'black'}`,
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
  },
}))
</script>

<template>
  <div class="w-full h-full">
    <Line v-if="accumulated" :data="chartData as any" :options="chartOptions as any" :plugins="[verticalLinePlugin]" />
    <Bar v-else :data="chartData as any" :options="chartOptions as any" :plugins="[verticalLinePlugin]" />
  </div>
</template>
