<script setup lang="ts">
import type { ChartData, ChartOptions } from 'chart.js'
import type { AnnotationOptions } from '../services/chartAnnotations'
import {
  CategoryScale,
  Chart,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js'
import { useI18n } from 'petite-vue-i18n'
import { computed, ref } from 'vue'
import { Line } from 'vue-chartjs'
import { getCurrentDayMonth, getDaysInCurrentMonth } from '~/services/date'
import { isDark } from '../composables/dark'
import { inlineAnnotationPlugin } from '../services/chartAnnotations'

const props = defineProps({
  accumulated: {
    type: Boolean,
    default: true,
  },
  title: { type: String, default: '' },
  colors: { type: Object, default: () => ({}) },
  limits: { type: Object, default: () => ({}) },
  data: { type: Array, default: Array.from({ length: getDaysInCurrentMonth() }).fill(undefined) as number[] },
})

const { t } = useI18n()
const organizationStore = useOrganizationStore()
const cycleStart = new Date(organizationStore.currentOrganization?.subscription_start ?? new Date())
const cycleEnd = new Date(organizationStore.currentOrganization?.subscription_end ?? new Date())

Chart.register(
  Tooltip,
  PointElement,
  CategoryScale,
  LinearScale,
  LineElement,
)

const accumulateData = computed(() => {
  const monthDay = getCurrentDayMonth()
  if (!props.accumulated)
    return props.data as number[]
  return (props.data as number[]).reduce((acc: number[], val: number, i: number) => {
    const last = acc[acc.length - 1] || 0
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
    const last = arrWithoutUndefined[i - 1] || 0
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
    const last = acc[acc.length - 1] || 0
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
  }
  obj[`label_${id}`] = {
    type: 'label',
    xValue: getDaysInCurrentMonth() / 2,
    yValue: y,
    backgroundColor: bgColor,
    content: [title],
    font: {
      size: 10,
    },
    color: '#000',
  }
  return obj
}

const generateAnnotations = computed(() => {
  // find biggest value in data
  let annotations: any = {}
  const min = Math.min(...accumulateData.value.filter((val: any) => val !== undefined) as number[])
  const max = Math.max(...projectionData.value.filter((val: any) => val !== undefined) as number[])
  Object.entries(props.limits as { [key: string]: number }).forEach(([key, val], i) => {
    if (val && val > min && val < (max * 1.2)) {
      const color1 = (i + 1) * 100
      const color2 = (i + 2) * 100
      annotations = {
        ...annotations,
        ...createAnotation(key, val, key, props.colors[color1], props.colors[color2]),
      }
    }
  })
  return annotations
})

const chartData = ref<ChartData<'line'>>({
  labels: monthdays(),
  datasets: [{
    label: props.title,
    data: accumulateData.value,
    borderColor: props.colors[400],
    backgroundColor: props.colors[200],
    tension: 0.3,
    pointRadius: 2,
    pointBorderWidth: 0,
  }, {
    label: t('prediction'),
    data: projectionData.value,
    borderColor: 'transparent',
    backgroundColor: props.colors[200],
    tension: 0.9,
    pointRadius: 2,
    pointBorderWidth: 0,
  }],
})
const chartOptions = ref<ChartOptions & { plugins: { inlineAnnotationPlugin: AnnotationOptions } }>({
  maintainAspectRatio: false,
  scales: {
    y: {
      ticks: {
        color: `${isDark.value ? 'white' : 'black'}`,
      },
    },
    x: {
      ticks: {
        color: `${isDark.value ? 'white' : 'black'}`,
      },
    },
  },
  plugins: {
    inlineAnnotationPlugin: generateAnnotations.value,
    legend: {
      display: false,
    },
    title: {
      display: false,
    },
  },
})
</script>

<template>
  <Line :data="chartData" height="auto" :options="chartOptions" :plugins="[inlineAnnotationPlugin]" />
</template>
