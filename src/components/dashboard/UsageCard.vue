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
    <div class="pt-4 px-4 flex items-start justify-between gap-2">
      <h2 class="flex-1 min-w-0 text-2xl font-semibold leading-tight text-white">
        {{ props.title }}
      </h2>

      <div class="flex flex-col items-end text-right flex-shrink-0">
        <div
          v-if="lastDayEvolution"
          class="inline-flex items-center justify-center rounded-full px-2 py-1 text-xs font-bold text-white shadow-lg whitespace-nowrap"
          :class="{ 'bg-emerald-500': lastDayEvolution >= 0, 'bg-yellow-500': lastDayEvolution < 0 }"
        >
          {{ lastDayEvolution < 0 ? '-' : '+' }}{{ Math.abs(lastDayEvolution).toFixed(2) }}%
        </div>
        <div v-else class="inline-flex rounded-full px-2 py-1 text-xs font-semibold opacity-0" aria-hidden="true">
          +0.00%
        </div>
        <div class="text-3xl font-bold text-white">
          {{ total?.toLocaleString() }} <span class="text-2xl font-normal">{{ unit }}</span>
        </div>
      </div>
    </div>
    <!-- Chart built with Chart.js 3 -->

    <!-- Change the height attribute to adjust the chart height -->
    <div class="w-full h-full p-6 pt-2">
      <LineChartStats v-if="props.datas?.length" :title="props.title" :colors="props.colors" :limits="props.limits" :data="props.datas" :datas-by-app="props.datasByApp" :app-names="props.appNames" :accumulated="accumulated" :use-billing-period="useBillingPeriod" />
      <div v-else class="flex flex-col items-center justify-center h-full">
        {{ t('no-data') }}
      </div>
    </div>
  </div>
</template>
