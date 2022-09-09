<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import LineChartStats from '~/components/LineChartStats.vue'

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
    default: () => new Array(new Date().getDate()).fill(0),
  },
})
const { t } = useI18n()
const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0)
const total = computed(() => {
  return sum(props.datas.slice(0, -1) as number[])
})
const evolution = (arr: number[]) => {
  const oldTotal = sum(arr.slice(0, -2))
  const diff = total.value - oldTotal
  return diff / oldTotal * 100
}

const lastDayEvolution = evolution(props.datas as number[])
</script>

<template>
  <div class="flex flex-col col-span-full sm:col-span-6 xl:col-span-4 bg-white shadow-lg rounded-sm border border-slate-200 dark:bg-gray-800 dark:border-slate-900">
    <div class="px-5 pt-5">
      <h2 class="text-2xl font-semibold dark:text-white text-slate-800 mb-2">
        {{ t('title') }}
      </h2>
      <div class="text-xs font-semibold dark:text-white text-slate-400 uppercase mb-1">
        {{ t('usage.title') }}
      </div>
      <div class="flex items-start">
        <div class="text-3xl font-bold dark:text-white text-slate-800 mr-2">
          {{ total.toLocaleString() }} {{ unit }}
        </div>
        <div class="text-sm font-semibold text-white px-1.5 bg-emerald-500 rounded-full">
          {{ lastDayEvolution < 0 ? '-' : '+' }}{{ lastDayEvolution.toFixed(2) }}%
        </div>
      </div>
    </div>
    <!-- Chart built with Chart.js 3 -->

    <!-- Change the height attribute to adjust the chart height -->
    <LineChartStats class="w-full h-max mx-auto px-3 my-3" :title="props.title" :colors="props.colors" :limits="props.limits" :data="props.datas" />
  </div>
</template>
