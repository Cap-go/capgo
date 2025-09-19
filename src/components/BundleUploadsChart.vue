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

const chartData = computed<ChartData<'bar'>>(() => ({
  labels: monthdays(),
  datasets: [{
    label: props.title,
    data: props.data as number[],
    backgroundColor: props.colors[400],
    borderColor: props.colors[200],
    borderWidth: 1,
  }],
}))

const chartOptions = computed<ChartOptions<'bar'>>(() => ({
  maintainAspectRatio: false,
  scales: {
    y: {
      beginAtZero: true,
      ticks: {
        color: `${isDark.value ? 'white' : 'black'}`,
        stepSize: 1,
      },
      grid: {
        color: `${isDark.value ? '#424e5f' : '#bfc9d6'}`,
      },
    },
    x: {
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
      display: false,
    },
    title: {
      display: false,
    },
  },
}))

</script>

<template>
  <div class="w-full h-full">
    <Bar :data="chartData" :options="chartOptions" />
  </div>
</template>
