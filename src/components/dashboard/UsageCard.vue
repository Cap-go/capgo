<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

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
  accumulated: {
    type: Boolean,
    default: true,
  },
  useBillingPeriod: {
    type: Boolean,
    default: true,
  },
  datas: {
    type: Array,
    default: () => Array.from({ length: getDaysInCurrentMonth() }).fill(undefined) as number[],
  },
  datasByApp: {
    type: Object,
    default: () => ({}),
  },
  appNames: {
    type: Object,
    default: () => ({}),
  },
})
const { t } = useI18n()

const total = computed(() => {
  const dataArray = props.datas as number[]
  const hasData = dataArray.some(val => val !== undefined)
  const sumValues = (values: number[]) => values.reduce((acc, val) => (typeof val === 'number' ? acc + val : acc), 0)

  if (hasData) {
    return sumValues(dataArray)
  }

  if (props.datasByApp && Object.keys(props.datasByApp).length > 0) {
    return Object.values(props.datasByApp).reduce((totalSum, appValues: any) => {
      return totalSum + sumValues(appValues)
    }, 0)
  }

  return 0
})

const lastDayEvolution = computed(() => {
  const arr = props.datas as number[]
  const arrWithoutUndefined = arr.filter((val: any) => val !== undefined)

  if (arrWithoutUndefined.length < 2) {
    return 0
  }

  const lastValue = arrWithoutUndefined[arrWithoutUndefined.length - 1] ?? 0
  const previousValue = arrWithoutUndefined[arrWithoutUndefined.length - 2] ?? 0

  if (previousValue === 0) {
    return lastValue > 0 ? 100 : 0
  }

  return ((lastValue - previousValue) / previousValue) * 100
})
</script>

<template>
  <div class="flex flex-col bg-white border rounded-lg shadow-lg col-span-full border-slate-300 sm:col-span-6 xl:col-span-4 dark:border-slate-900 dark:bg-gray-800 h-[460px]">
    <div class="px-5 pt-3">
      <div class="flex flex-row items-center">
        <h2 class="mb-2 mr-2 text-2xl font-semibold text-slate-800 dark:text-white">
          {{ props.title }}
        </h2>
      </div>

      <div class="mb-1 text-xs font-semibold uppercase text-slate-400 dark:text-white">
        {{ t('usage-title') }}
      </div>
      <div class="flex items-start">
        <div id="usage_val" class="mr-2 text-3xl font-bold text-slate-800 dark:text-white">
          {{ total?.toLocaleString() }} {{ unit }}
        </div>
        <div v-if="lastDayEvolution" class="rounded-full bg-emerald-500 px-1.5 text-sm font-semibold text-white">
          {{ lastDayEvolution < 0 ? '-' : '+' }}{{ Math.abs(lastDayEvolution).toFixed(2) }}%
        </div>
      </div>
    </div>
    <!-- Chart built with Chart.js 3 -->

    <!-- Change the height attribute to adjust the chart height -->
    <div class="w-full h-full p-6">
      <LineChartStats v-if="props.datas?.length" :title="props.title" :colors="props.colors" :limits="props.limits" :data="props.datas" :datas-by-app="props.datasByApp" :app-names="props.appNames" :accumulated="accumulated" :use-billing-period="useBillingPeriod" />
      <div v-else class="flex flex-col items-center justify-center h-full">
        {{ t('no-data') }}
      </div>
    </div>
  </div>
</template>
