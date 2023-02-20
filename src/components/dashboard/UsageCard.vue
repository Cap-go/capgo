<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import LineChartStats from '~/components/LineChartStats.vue'
import { getDaysInCurrentMonth } from '~/services/date'

const props = defineProps({
  title: { type: String, default: '' },
  unit: { type: String, default: '' },
  colors: { type: Object, default: () => ({}) },
  limits: {
    type: Object,
    default: () => ({
    }),
  },
  datas: {
    type: Array,
    default: () => new Array(getDaysInCurrentMonth()).fill(undefined),
  },
})
const { t } = useI18n()
const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0)
const total = computed(() => {
  // remove undefined values
  const arr = props.datas as number[]
  const arrWithoutUndefined = arr.filter((val: any) => val !== undefined)
  return sum(arrWithoutUndefined as number[])
})
const lastDayEvolution = computed(() => {
  const arr = props.datas as number[]
  const arrWithoutUndefined = arr.filter((val: any) => val !== undefined)
  const oldTotal = sum(arrWithoutUndefined.slice(0, -2))
  const diff = total.value - oldTotal
  const res = diff / (arr.length > 2 ? oldTotal : diff) * 100
  return res
})

// const lastDayEvolution = evolution(props.datas as number[])
</script>

<template>
  <div class="flex flex-col bg-white border rounded-lg shadow-lg col-span-full sm:col-span-6 xl:col-span-4 border-slate-200 dark:bg-gray-800 dark:border-slate-900">
    <div class="px-5 pt-3">
      <div class="flex flex-row">
        <h2 class="mb-2 mr-4 text-2xl font-semibold dark:text-white text-slate-800">
          {{ props.title }}
        </h2>
        <div class="font-medium badge badge-primary">
          beta
        </div>
      </div>

      <div class="mb-1 text-xs font-semibold uppercase dark:text-white text-slate-400">
        {{ t('usage-title') }}
      </div>
      <div class="flex items-start">
        <div class="mr-2 text-3xl font-bold dark:text-white text-slate-800">
          {{ total.toLocaleString() }} {{ unit }}
        </div>
        <div v-if="lastDayEvolution" class="text-sm font-semibold text-white px-1.5 bg-emerald-500 rounded-full">
          {{ lastDayEvolution < 0 ? '-' : '+' }}{{ lastDayEvolution.toFixed(2) }}%
        </div>
      </div>
    </div>
    <!-- Chart built with Chart.js 3 -->

    <!-- Change the height attribute to adjust the chart height -->
    <LineChartStats class="w-full px-3 mx-auto aspect-square" :title="props.title" :colors="props.colors" :limits="props.limits" :data="props.datas" />
  </div>
</template>
