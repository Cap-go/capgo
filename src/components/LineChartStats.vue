<script setup lang="ts">
import type { ChartData } from 'chart.js'
import { computed, ref } from 'vue'
import { Line } from 'vue-chartjs'
import { isDark } from '~/composables'
import { getDaysInCurrentMonth } from '~/services/date'

const props = defineProps({
  title: { type: String, default: '' },
  colors: { type: Object, default: () => ({}) },
  limits: { type: Object, default: () => ({}) },
  data: { type: Array, default: new Array(getDaysInCurrentMonth()).fill(undefined) },
})

const accumulateData = computed(() => {
  // console.log('accumulateData', props.data)
  return (props.data as number[]).reduce((acc: number[], val: number) => {
    const last = acc[acc.length - 1] || 0
    const newVal = val !== undefined ? last + val : undefined
    // console.log('accumulateData', i, val, last, newVal)
    return [...acc, newVal] as number[]
  }, [])
})
// find median difference of evolution between each element of the array
const evolution = computed(() => {
  const arr = props.data as number[]
  const arrWithoutFirst = arr.slice(1)
  const arrWithoutUndefined = arrWithoutFirst.filter((val: any) => val !== undefined)
  const median = arrWithoutUndefined.reduce((a, b) => a + b, 0) / arrWithoutUndefined.length
  return median
})
const projectionData = computed(() => {
  const res = accumulateData.value.reduce((acc: number[], val: number, i: number) => {
    const last = acc[acc.length - 1] || 0
    const lastAcc = accumulateData.value[i - 1] || 0
    const newVal = val ? undefined : lastAcc + last + evolution.value
    return [...acc, newVal] as number[]
  }, [])
  return res
})
const monthdays = () => {
  const keys = [...(Array(getDaysInCurrentMonth() + 1).keys())]
  keys.shift()
  const arr = [...keys]
  return arr
}
const createAnotation = (id: string, y: number, title: string, lineColor: string, bgColor: string) => {
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
  },
  {
    label: `${props.title} projection`,
    data: projectionData.value,
    borderColor: props.colors[400],
    borderDash: [10, 5],
    pointBackgroundColor: 'transparent',
    // backgroundColor: props.colors[200],
  },
  ],
})
const chartOptions = {
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
  },
}
// chartData.value.datasets[0].data = props.data as number[]
</script>

<template>
  <Line class="" :chart-data="chartData" :chart-options="chartOptions" />
</template>
