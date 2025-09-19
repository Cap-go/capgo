<script setup lang="ts">
import type { ChartData, ChartOptions } from 'chart.js'
import { useDark } from '@vueuse/core'
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  LinearScale,
  Tooltip,
} from 'chart.js'
import { computed } from 'vue'
import { Bar } from 'vue-chartjs'
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
})

const isDark = useDark()
const organizationStore = useOrganizationStore()
const cycleStart = new Date(organizationStore.currentOrganization?.subscription_start ?? new Date())
const cycleEnd = new Date(organizationStore.currentOrganization?.subscription_end ?? new Date())

Chart.register(
  Tooltip,
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
)

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

const chartData = computed<ChartData<'bar'>>(() => {
  const appIds = Object.keys(props.dataByApp)

  if (appIds.length === 0) {
    // Single app view - show total deployments
    return {
      labels: monthdays(),
      datasets: [
        {
          label: 'Deployments',
          data: props.data as number[],
          backgroundColor: 'hsla(210, 50%, 70%, 0.8)',
          borderColor: 'hsl(210, 50%, 55%)',
          borderWidth: 1,
        },
      ],
    }
  }

  // Multiple apps view - show breakdown by app
  const appColors = generateAppColors(appIds.length)
  const datasets = appIds.map((appId, index) => {
    const appData = props.dataByApp[appId] as number[]

    const backgroundColor = appColors[index]
    // Create a slightly darker border for better definition
    const borderColor = backgroundColor.replace('hsla', 'hsl').replace(', 0.8)', ')').replace(/(\d+)%\)/, (_, lightness) => {
      const newLightness = Math.max(Number(lightness) - 15, 30)
      return `${newLightness}%)`
    })

    return {
      label: props.appNames[appId] || appId,
      data: appData,
      backgroundColor,
      borderColor,
      borderWidth: 1,
    }
  })

  return {
    labels: monthdays(),
    datasets,
  }
})

const chartOptions = computed<ChartOptions<'bar'>>(() => ({
  maintainAspectRatio: false,
  scales: {
    y: {
      beginAtZero: true,
      stacked: true,
      ticks: {
        color: `${isDark.value ? 'white' : 'black'}`,
        stepSize: 1,
      },
      grid: {
        color: `${isDark.value ? '#424e5f' : '#bfc9d6'}`,
      },
    },
    x: {
      stacked: true,
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
    tooltip: createTooltipConfig(Object.keys(props.dataByApp).length > 0),
  },
}))
</script>

<template>
  <div class="w-full h-full">
    <Bar :data="chartData" :options="chartOptions" :plugins="[verticalLinePlugin]" />
  </div>
</template>