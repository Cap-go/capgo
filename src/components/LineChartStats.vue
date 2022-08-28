<script setup lang="ts">
import type { ChartData } from 'chart.js'
import { computed, ref } from 'vue'
import { Line } from 'vue-chartjs'

const props = defineProps({
  title: { type: String, default: '' },
  colors: { type: Object, default: () => ({}) },
  limits: { type: Object, default: () => ({}) },
  data: { type: Array, default: new Array(new Date().getDate()).fill(0) },
})

const daysInCurrentMonth = () => new Date().getDate()

const accumulateData = computed(() => {
  return (props.data as number[]).reduce((acc: number[], val: number) => {
    const last = acc[acc.length - 1] || 0
    return [...acc, last + val]
  }, [])
})
const monthdays = () => {
  const arr = [...Array(daysInCurrentMonth() + 1).keys()]
  arr.pop()
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
    xValue: daysInCurrentMonth() / 2,
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
  const min = Math.min(...accumulateData.value as number[])
  const max = Math.max(...accumulateData.value as number[])
  // const annotations: any = {}
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
    borderColor: props.colors[100],
    backgroundColor: props.colors[200],
  }],
})
const chartOptions = {
  plugins: {
    title: {
      display: true,
      text: `${props.title} usage`,
    },
    annotation: {
      annotations: generateAnnotations.value,
    },
  },
}
// chartData.value.datasets[0].data = props.data as number[]
</script>

<template>
  <Line class="my-8 mx-auto w-100 h-100" :chart-data="chartData" :chart-options="chartOptions" />
</template>
