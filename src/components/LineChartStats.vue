<script setup lang="ts">
import type { ChartData } from 'chart.js'
import {
  CategoryScale,
  Chart,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
  // AnimationEvent,
} from 'chart.js'
import { computed, ref, watch } from 'vue'
import { Line } from 'vue-chartjs'
import annotationPlugin from 'chartjs-plugin-annotation'
import { useI18n } from 'vue-i18n'
import { isDark } from '../composables/dark'
import { getCurrentDayMonth, getDaysInCurrentMonth } from '~/services/date'

const props = defineProps({
  title: { type: String, default: '' },
  colors: { type: Object, default: () => ({}) },
  limits: { type: Object, default: () => ({}) },
  data: { type: Array, default: Array.from({ length: getDaysInCurrentMonth() }).fill(undefined) as number[] },
})

const { t } = useI18n()

Chart.register(
  // Colors,
  // BarController,
  // BarElement,
  Tooltip,
  PointElement,
  CategoryScale,
  LinearScale,
  LineElement,
  annotationPlugin,
  // Legend,
)

// console.log('title', props.title, props.data)
const accumulateData = computed(() => {
  // console.log('accumulateData', props.data)
  const monthDay = getCurrentDayMonth()
  // console.log('accumulateData', monthDay, props.data.length)
  return (props.data as number[]).reduce((acc: number[], val: number, i: number) => {
    const last = acc[acc.length - 1] || 0
    let newVal
    if (val !== undefined)
      newVal = last + val
    else if (i < monthDay)
      newVal = last
    // console.log('accumulateData', i, monthDay, val, last, newVal)
    // console.log('accumulateData', i, val, last, newVal)
    // return [...acc, newVal] as number[]
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
  const res = [...Array(getDaysInCurrentMonth()).fill(undefined)].reduce((acc: number[], val: number, i: number) => {
    const last = acc[acc.length - 1] || 0
    let newVal
    // randomize Evolution from (half evolutio) to full evolution
    const randomizedEvolution = getRandomArbitrary((evolution.value[0] + evolution.value[2]) / 2, (evolution.value[1] + evolution.value[2]) / 2)
    if (i === monthDay - 1)
      newVal = lastDay
    else if (i >= monthDay)
      newVal = last + randomizedEvolution
    // return [...acc, newVal] as number[]
    return acc.concat([newVal as number])
  }, [])
  return res
})

function monthdays() {
  const keys = [...(Array(getDaysInCurrentMonth() + 1).keys())]
  keys.shift()
  const arr = [...keys]
  return arr
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
    // color: '#fff',
    content: [title],
    font: {
      size: 10,
    },
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
  // console.log('generateAnnotations', annotations)
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
  },
  {
    label: t('prediction'),
    data: projectionData.value,
    borderColor: 'transparent',
    backgroundColor: props.colors[200],
    tension: 0.9,
    pointRadius: 2,
    pointBorderWidth: 0,
  },
  ],
})
const chartOptions = ref({
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
    }
    ,
  },
  plugins: {
    annotation: {
      annotations: generateAnnotations.value,
    },
    legend: {
      display: false,
    },
    title: {
      display: false,
    },
  },
})

watch(isDark, (value) => {
  const newColor = `${value ? 'white' : 'black'}`
  console.log(newColor)
  chartOptions.value.scales.y.ticks.color = newColor
  chartOptions.value.scales.x.ticks.color = newColor
})

// chartData.value.datasets[0].data = props.data as number[]
</script>

<template>
  <Line :data="chartData" height="auto" :options="chartOptions" />
</template>
