<script setup lang="ts">
import type { ChartData, ChartOptions } from 'chart.js'
import { useDark } from '@vueuse/core'
import {
  CategoryScale,
  Chart,
  Filler,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js'
import { computed } from 'vue'
import { Line } from 'vue-chartjs'

interface DataSeries {
  label: string
  data: Array<{ date: string, value: number }>
  color: string
}

const props = defineProps({
  series: {
    type: Array as () => DataSeries[],
    required: true,
  },
  isLoading: {
    type: Boolean,
    default: false,
  },
})

const isDark = useDark()

Chart.register(
  Tooltip,
  LineController,
  PointElement,
  CategoryScale,
  LinearScale,
  LineElement,
  Filler,
  Legend,
)

const chartData = computed<ChartData<'line'>>(() => {
  if (props.series.length === 0 || props.series[0].data.length === 0) {
    return {
      labels: [],
      datasets: [],
    }
  }

  const labels = props.series[0].data.map(item => item.date)

  const datasets = props.series.map(serie => ({
    label: serie.label,
    data: serie.data.map(item => item.value),
    borderColor: serie.color,
    backgroundColor: `${serie.color}33`, // 20% opacity
    fill: false,
    tension: 0.4,
    pointRadius: 3,
    pointBackgroundColor: serie.color,
    pointBorderWidth: 0,
    borderWidth: 2,
  }))

  return {
    labels,
    datasets,
  }
})

const chartOptions = computed<ChartOptions<'line'>>(() => ({
  responsive: true,
  maintainAspectRatio: false,
  layout: {
    padding: {
      left: 0,
      right: 0,
      top: 10,
      bottom: 10,
    },
  },
  interaction: {
    mode: 'index',
    intersect: false,
  },
  plugins: {
    legend: {
      display: true,
      position: 'bottom',
      labels: {
        color: isDark.value ? '#d1d5db' : '#4b5563',
        usePointStyle: true,
        padding: 15,
      },
    },
    tooltip: {
      backgroundColor: isDark.value ? 'rgba(31, 41, 55, 0.95)' : 'rgba(255, 255, 255, 0.95)',
      titleColor: isDark.value ? '#f3f4f6' : '#1f2937',
      bodyColor: isDark.value ? '#d1d5db' : '#4b5563',
      borderColor: isDark.value ? '#374151' : '#e5e7eb',
      borderWidth: 1,
      padding: 12,
      displayColors: true,
      callbacks: {
        label: (context) => {
          const label = context.dataset.label || ''
          const value = context.parsed.y?.toLocaleString() || '0'
          return `${label}: ${value}`
        },
      },
    },
  },
  scales: {
    x: {
      grid: {
        display: false,
      },
      ticks: {
        color: isDark.value ? '#9ca3af' : '#6b7280',
        maxRotation: 0,
        minRotation: 0,
        autoSkip: true,
        maxTicksLimit: 10,
      },
    },
    y: {
      beginAtZero: true,
      grid: {
        color: isDark.value ? 'rgba(75, 85, 99, 0.3)' : 'rgba(229, 231, 235, 0.8)',
      },
      ticks: {
        color: isDark.value ? '#9ca3af' : '#6b7280',
        callback: (value) => {
          if (typeof value === 'number')
            return value.toLocaleString()
          return value
        },
      },
    },
  },
}))
</script>

<template>
  <div class="relative overflow-hidden w-full h-full">
    <div v-if="isLoading" class="flex justify-center items-center h-full">
      <span class="loading loading-spinner loading-lg text-primary" />
    </div>
    <div v-else class="w-full h-full">
      <Line :data="chartData" :options="chartOptions" />
    </div>
  </div>
</template>
