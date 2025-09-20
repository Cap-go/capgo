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
import { createTooltipConfig, verticalLinePlugin } from '../services/chartTooltip'

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

// Generate infinite distinct pastel colors starting with blue
function generateAppColors(appCount: number) {
  const colors = []

  for (let i = 0; i < appCount; i++) {
    // Start with blue (210°) and use golden ratio for distribution
    const hue = (210 + i * 137.508) % 360 // Start at blue, then golden angle

    // Use pastel-friendly saturation and lightness values
    const saturation = 50 + (i % 3) * 8  // 50%, 58%, 66% - softer colors
    const lightness = 60 + (i % 4) * 5   // 60%, 65%, 70%, 75% - lighter, more pastel

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
  return data.reduce((acc: number[], val: number, i: number) => {
    const last = acc[acc.length - 1] ?? 0
    const newVal = last + (val ?? 0)
    return acc.concat([newVal])
  }, [])
}

const chartData = computed<ChartData<'bar' | 'line'>>(() => {
  const appIds = Object.keys(props.dataByApp)

  if (appIds.length === 0) {
    // Fallback to single dataset if no app data
    let backgroundColor: string
    let borderColor: string
    let processedData: number[]

    // Process data for cumulative mode
    if (props.accumulated) {
      processedData = accumulateData(props.data as number[])
      // Use LineChartStats color scheme for line mode
      borderColor = `hsl(210, 65%, 45%)`
      backgroundColor = `hsla(210, 50%, 60%, 0.6)`
    } else {
      processedData = props.data as number[]
      // Use existing bar chart colors for bar mode
      backgroundColor = props.colors[400]
      borderColor = props.colors[200]
    }

    const baseDataset = {
      label: props.title,
      data: processedData,
      backgroundColor,
      borderColor,
      borderWidth: 1,
    }

    // Add line-specific properties for accumulated mode (match UsageCard styling)
    const dataset = props.accumulated ? {
      ...baseDataset,
      fill: 'origin', // Fill from bottom for single dataset
      tension: 0.3,
      pointRadius: 0,
      pointBorderWidth: 0,
      borderWidth: 1,
    } : baseDataset

    return {
      labels: monthdays(),
      datasets: [dataset],
    }
  }

  // Create stacked datasets for each app
  const appColors = generateAppColors(appIds.length)
  const datasets = appIds.map((appId, index) => {
    const appData = props.dataByApp[appId] as number[]

    let backgroundColor: string
    let borderColor: string
    let processedData: number[]

    // Process data for cumulative mode
    if (props.accumulated) {
      processedData = accumulateData(appData)
      // Use LineChartStats color scheme for line mode
      const hue = (210 + index * 137.508) % 360
      const saturation = 50 + (index % 3) * 8
      const lightness = 60 + (index % 4) * 5
      borderColor = `hsl(${hue}, ${saturation + 15}%, ${lightness - 15}%)`
      backgroundColor = `hsla(${hue}, ${saturation}%, ${lightness}%, 0.6)`
    } else {
      processedData = appData
      // Use existing bar chart colors for bar mode
      backgroundColor = appColors[index]
      borderColor = backgroundColor.replace('hsla', 'hsl').replace(', 0.8)', ')').replace(/(\d+)%\)/, (_, lightness) => {
        const newLightness = Math.max(Number(lightness) - 15, 30)
        return `${newLightness}%)`
      })
    }

    const baseDataset = {
      label: props.appNames[appId] || appId,
      data: processedData,
      backgroundColor,
      borderColor,
      borderWidth: 1,
    }

    // Add line-specific properties for accumulated mode (match UsageCard styling)
    return props.accumulated ? {
      ...baseDataset,
      fill: index === 0 ? 'origin' : '-1', // First fills from bottom, others fill from previous dataset
      tension: 0.3,
      pointRadius: 0,
      pointBorderWidth: 0,
      borderWidth: 1,
    } : baseDataset
  })

  return {
    labels: monthdays(),
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
      display: Object.keys(props.dataByApp).length > 0,
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
    tooltip: createTooltipConfig(Object.keys(props.dataByApp).length > 0, props.accumulated),
  },
}))

</script>

<template>
  <div class="w-full h-full">
    <Line v-if="accumulated" :data="chartData as any" :options="chartOptions as any" :plugins="[verticalLinePlugin]" />
    <Bar v-else :data="chartData as any" :options="chartOptions as any" :plugins="[verticalLinePlugin]" />
  </div>
</template>
