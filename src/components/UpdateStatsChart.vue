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
  return getDayNumbers(cycleStart, cycleEnd)
}

const chartData = computed<ChartData<'bar'>>(() => {
  // Always show breakdown by action type (install/fail/get)
  const actionTypes = ['install', 'fail', 'get']
  const datasets = actionTypes.map((action) => {
    const actionData = props.dataByApp[action] as number[]
    const actionName = props.appNames[action] || action

    let backgroundColor: string
    let borderColor: string

    switch (action) {
      case 'install':
        backgroundColor = 'hsla(210, 50%, 70%, 0.8)'
        borderColor = 'hsl(210, 50%, 55%)'
        break
      case 'fail':
        backgroundColor = 'hsla(0, 50%, 70%, 0.8)'
        borderColor = 'hsl(0, 50%, 55%)'
        break
      case 'get':
        backgroundColor = 'hsla(120, 50%, 70%, 0.8)'
        borderColor = 'hsl(120, 50%, 55%)'
        break
      default:
        backgroundColor = 'hsla(210, 50%, 70%, 0.8)'
        borderColor = 'hsl(210, 50%, 55%)'
    }

    return {
      label: actionName,
      data: actionData || Array.from({ length: monthdays().length }).fill(0) as number[],
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
    tooltip: createTooltipConfig(true),
  },
}))
</script>

<template>
  <div class="w-full h-full">
    <Bar :data="chartData" :options="chartOptions" :plugins="[verticalLinePlugin]" />
  </div>
</template>
