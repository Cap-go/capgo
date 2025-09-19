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

// Generate distinct colors for apps
function generateAppColors(appCount: number) {
  const colors = [
    'rgba(59, 130, 246, 0.8)', // blue
    'rgba(34, 197, 94, 0.8)', // green
    'rgba(168, 85, 247, 0.8)', // purple
    'rgba(251, 146, 60, 0.8)', // orange
    'rgba(236, 72, 153, 0.8)', // pink
    'rgba(20, 184, 166, 0.8)', // teal
    'rgba(251, 191, 36, 0.8)', // amber
    'rgba(239, 68, 68, 0.8)', // red
    'rgba(99, 102, 241, 0.8)', // indigo
    'rgba(14, 165, 233, 0.8)', // sky
  ]

  const result = []
  for (let i = 0; i < appCount; i++) {
    result.push(colors[i % colors.length])
  }
  return result
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
  return getDayNumbers(cycleStart, cycleEnd)
}

const chartData = computed<ChartData<'bar'>>(() => {
  const appIds = Object.keys(props.dataByApp)

  if (appIds.length === 0) {
    // Fallback to single dataset if no app data
    return {
      labels: monthdays(),
      datasets: [{
        label: props.title,
        data: props.data as number[],
        backgroundColor: props.colors[400],
        borderColor: props.colors[200],
        borderWidth: 1,
      }],
    }
  }

  // Create stacked datasets for each app
  const appColors = generateAppColors(appIds.length)
  const datasets = appIds.map((appId, index) => {
    const appData = props.dataByApp[appId] as number[]

    return {
      label: props.appNames[appId] || appId,
      data: appData,
      backgroundColor: appColors[index],
      borderColor: appColors[index].replace('0.8', '1'),
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
    tooltip: {
      mode: 'index' as const,
      intersect: false,
    },
  },
}))

</script>

<template>
  <div class="w-full h-full">
    <Bar :data="chartData" :options="chartOptions" />
  </div>
</template>
