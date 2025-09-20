<script setup lang="ts">
import type { ChartData, ChartOptions } from 'chart.js'
import type { AnnotationOptions } from '../services/chartAnnotations'
import { useDark } from '@vueuse/core'
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Filler,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js'
import { computed } from 'vue'
import { Bar, Line } from 'vue-chartjs'
import { useI18n } from 'vue-i18n'
import { getCurrentDayMonth, getDaysInCurrentMonth } from '~/services/date'
import { useOrganizationStore } from '~/stores/organization'
import { inlineAnnotationPlugin } from '../services/chartAnnotations'
import { createTooltipConfig, verticalLinePlugin } from '../services/chartTooltip'

const props = defineProps({
  accumulated: {
    type: Boolean,
    default: true,
  },
  useBillingPeriod: {
    type: Boolean,
    default: true,
  },
  title: { type: String, default: '' },
  colors: { type: Object, default: () => ({}) },
  limits: { type: Object, default: () => ({}) },
  data: { type: Array, default: Array.from({ length: getDaysInCurrentMonth() }).fill(undefined) as number[] },
  datasByApp: {
    type: Object,
    default: () => ({}),
  },
  appNames: {
    type: Object,
    default: () => ({}),
  },
})
const isDark = useDark()
const { t } = useI18n()
const organizationStore = useOrganizationStore()
const cycleStart = new Date(organizationStore.currentOrganization?.subscription_start ?? new Date())
const cycleEnd = new Date(organizationStore.currentOrganization?.subscription_end ?? new Date())
// Reset to start of day for consistent date handling
cycleStart.setHours(0, 0, 0, 0)
cycleEnd.setHours(0, 0, 0, 0)

// View mode is now controlled by parent component
const viewMode = computed(() => props.accumulated ? 'cumulative' : 'daily')

Chart.register(
  Tooltip,
  BarController,
  BarElement,
  LineController,
  PointElement,
  CategoryScale,
  LinearScale,
  LineElement,
  Filler,
)

const accumulateData = computed(() => {
  const monthDay = getCurrentDayMonth()
  if (viewMode.value === 'daily')
    return props.data as number[]
  return (props.data as number[]).reduce((acc: number[], val: number, i: number) => {
    const last = acc[acc.length - 1] ?? 0
    let newVal
    if (val !== undefined)
      newVal = last + val
    else if (i < monthDay)
      newVal = last
    return acc.concat([newVal as number])
  }, [])
})

const evolution = computed(() => {
  if (accumulateData.value.length === 0)
    return [0, 0, 0]
  const arrWithoutUndefined = accumulateData.value.filter((val: any) => val !== undefined)
  // calculate evolution of all value except the first one
  const res = arrWithoutUndefined.map((val: number, i: number) => {
    const last = arrWithoutUndefined[i - 1] ?? 0
    return i > 0 ? val - last : 0
  })
  const median = res.reduce((a, b) => a + b, 0.0) / accumulateData.value.length
  const min = Math.min(...res)
  const max = Math.max(...res)
  return [min, max, median]
})

function getRandomArbitrary(min: number, max: number) {
  return Math.random() * (max - min) + min
}

const projectionData = computed(() => {
  if (accumulateData.value.length === 0)
    return []
  const monthDay = getCurrentDayMonth()
  const arrWithoutUndefined = accumulateData.value.filter((val: any) => val !== undefined)
  const lastDay = arrWithoutUndefined[arrWithoutUndefined.length - 1]
  // create a projection of the evolution, start after the last value of the array, put undefined for the beginning of the month
  // each value is the previous value + the evolution, the first value is the last value of the array
  // eslint-disable-next-line unicorn/no-new-array
  let res = new Array(getDaysInCurrentMonth()).fill(undefined)
  res = res.reduce((acc: number[], val: number, i: number) => {
    let newVal
    const last = acc[acc.length - 1] ?? 0
    // randomize Evolution from (half evolutio) to full evolution
    const randomizedEvolution = getRandomArbitrary((evolution.value[0] + evolution.value[2]) / 2, (evolution.value[1] + evolution.value[2]) / 2)
    if (i === monthDay - 1)
      newVal = lastDay
    else if (i >= monthDay)
      newVal = last + randomizedEvolution
    return acc.concat([newVal as number])
  }, [])
  res = res.filter(i => i)
  for (let i = 0; i < arrWithoutUndefined.length - 1; i++)
    res.unshift(undefined)

  return res
})

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
  // eslint-disable-next-line unicorn/no-new-array
  let keys = [...(new Array(getDaysInCurrentMonth() + 1).keys())]
  if (cycleStart && cycleEnd)
    keys = getDayNumbers(cycleStart, cycleEnd)
  else
    keys.shift()

  return [...keys]
}

function createAnotation(id: string, y: number, title: string, lineColor: string, bgColor: string) {
  const obj: any = {}
  obj[`line_${id}`] = {
    type: 'line',
    yMin: y,
    yMax: y,
    borderColor: lineColor,
    borderWidth: 2,
    borderDash: [5, 5], // Make dashed line to distinguish from data lines
  }
  obj[`label_${id}`] = {
    type: 'label',
    xValue: getDaysInCurrentMonth() / 2,
    yValue: y,
    backgroundColor: bgColor,
    content: [title],
    font: {
      size: 12,
      weight: 'bold',
    },
    color: `${isDark.value ? '#fff' : '#1f2937'}`, // Better contrast
    borderColor: lineColor,
    borderWidth: 1,
    borderRadius: 4,
    padding: 6,
  }
  return obj
}

const generateAnnotations = computed(() => {
  // Don't show plan limits in daily mode - they only make sense for cumulative data
  if (!props.accumulated) {
    return {}
  }

  // find biggest value in data
  let annotations: any = {}
  const min = Math.min(...accumulateData.value.filter((val: any) => val !== undefined) as number[])
  const max = Math.max(...projectionData.value.filter((val: any) => val !== undefined) as number[])

  // Use consistent white color for all limit lines for simplicity
  const lineColor = isDark.value ? 'rgba(255, 255, 255, 0.8)' : 'rgba(255, 255, 255, 0.9)'
  const bgColor = isDark.value ? 'rgba(31, 41, 55, 0.9)' : 'rgba(255, 255, 255, 0.95)'

  Object.entries(props.limits as { [key: string]: number }).forEach(([key, val]) => {
    if (val && val > min && val < (max * 1.2)) {
      annotations = {
        ...annotations,
        ...createAnotation(key, val, key, lineColor, bgColor),
      }
    }
  })
  return annotations
})

// Generate infinite distinct pastel colors starting with blue
function generateAppColors(appCount: number) {
  const colors = []

  for (let i = 0; i < appCount; i++) {
    // Start with blue (210°) and use golden ratio for distribution
    const hue = (210 + i * 137.508) % 360 // Start at blue, then golden angle

    // Use pastel-friendly saturation and lightness values
    const saturation = 50 + (i % 3) * 8 // 50%, 58%, 66% - softer colors
    const lightness = 60 + (i % 4) * 5 // 60%, 65%, 70%, 75% - lighter, more pastel

    const borderColor = `hsl(${hue}, ${saturation + 15}%, ${lightness - 15}%)`
    const backgroundColor = `hsla(${hue}, ${saturation}%, ${lightness}%, 0.6)`

    colors.push({
      border: borderColor,
      bg: backgroundColor,
    })
  }

  return colors
}

const chartData = computed<ChartData<'line' | 'bar'>>(() => {
  const appIds = Object.keys(props.datasByApp || {})
  const datasets = []

  if (appIds.length > 0) {
    // Create stacked area datasets for each app
    const appColors = generateAppColors(appIds.length)
    appIds.forEach((appId, index) => {
      const appData = props.datasByApp[appId]
      if (appData) {
        // Process app data with accumulation if needed
        let processedData = appData
        if (viewMode.value === 'cumulative') {
          processedData = appData.reduce((acc: number[], val: number, i: number) => {
            const last = acc[acc.length - 1] ?? 0
            let newVal
            if (val !== undefined)
              newVal = last + val
            else if (i < getCurrentDayMonth())
              newVal = last
            return acc.concat([newVal as number])
          }, [])
        }

        let backgroundColor: string
        let borderColor: string

        if (props.accumulated) {
          // Use existing line chart colors for line mode
          backgroundColor = appColors[index].bg
          borderColor = appColors[index].border
        } else {
          // Use existing bar chart colors for bar mode
          const hue = (210 + index * 137.508) % 360
          const saturation = 50 + (index % 3) * 8
          const lightness = 60 + (index % 4) * 5
          backgroundColor = `hsla(${hue}, ${saturation}%, ${lightness}%, 0.8)`
          borderColor = backgroundColor.replace('hsla', 'hsl').replace(', 0.8)', ')').replace(/(\d+)%\)/, (_, lightness) => {
            const newLightness = Math.max(Number(lightness) - 15, 30)
            return `${newLightness}%)`
          })
        }

        const baseDataset = {
          label: props.appNames[appId] || appId,
          data: processedData,
          borderColor,
          backgroundColor,
          borderWidth: 1,
        }

        // Add chart-type specific properties
        const dataset = props.accumulated ? {
          ...baseDataset,
          fill: index === 0 ? 'origin' : '-1', // First fills from bottom, others fill from previous dataset
          tension: 0.3,
          pointRadius: 0,
          pointBorderWidth: 0,
        } : {
          ...baseDataset,
          borderWidth: 1,
        }

        datasets.push(dataset)
      }
    })
  }
  else {
    // Fallback to single dataset if no app data
    const mainDataset = {
      label: props.title,
      data: accumulateData.value,
      borderColor: props.colors[400],
      backgroundColor: props.colors[200],
    }

    // Add chart-type specific properties for main dataset
    const dataset = props.accumulated ? {
      ...mainDataset,
      fill: false, // No fill for single app line
      tension: 0.3,
      pointRadius: 2,
      pointBorderWidth: 0,
    } : {
      ...mainDataset,
      borderWidth: 1,
    }

    datasets.push(dataset)

    // Only add prediction for line charts (accumulated mode)
    if (props.accumulated) {
      datasets.push({
        label: t('prediction'),
        data: projectionData.value,
        borderColor: 'transparent',
        backgroundColor: props.colors[200],
        fill: false, // No fill for prediction line either
        tension: 0.9,
        pointRadius: 2,
        pointBorderWidth: 0,
      })
    }
  }

  return {
    labels: monthdays(),
    datasets,
  }
})
const chartOptions = computed<ChartOptions & { plugins: { inlineAnnotationPlugin: AnnotationOptions } }>(() => {
  const hasAppData = Object.keys(props.datasByApp || {}).length > 0

  return {
    maintainAspectRatio: false,
    scales: {
      y: {
        stacked: hasAppData, // Stack when there are multiple apps
        beginAtZero: true,
        ticks: {
          color: `${isDark.value ? 'white' : 'black'}`,
          // Remove stepSize to let Chart.js auto-calculate optimal steps
        },
        grid: {
          color: `${isDark.value ? '#424e5f' : '#bfc9d6'}`,
        },
      },
      x: {
        stacked: hasAppData, // Stack when there are multiple apps
        ticks: {
          color: `${isDark.value ? 'white' : 'black'}`,
        },
        grid: {
          color: `${isDark.value ? '#323e4e' : '#cad5e2'}`,
        },
      },
    },
    plugins: {
      inlineAnnotationPlugin: generateAnnotations.value,
      legend: {
        display: hasAppData,
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
      tooltip: createTooltipConfig(hasAppData, props.accumulated),
      filler: {
        propagate: false,
      },
    },
  }
})
</script>

<template>
  <Line v-if="accumulated" :data="chartData as any" height="auto" :options="(chartOptions as any)" :plugins="[inlineAnnotationPlugin, verticalLinePlugin]" />
  <Bar v-else :data="chartData as any" height="auto" :options="(chartOptions as any)" :plugins="[inlineAnnotationPlugin, verticalLinePlugin]" />
</template>
