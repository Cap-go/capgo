<script setup lang="ts">
import dayjs from 'dayjs'
import { useI18n } from 'petite-vue-i18n'
import { computed } from 'vue'
import IcBaselineInfo from '~icons/ic/baseline-info'
import { getDaysInCurrentMonth } from '~/services/date'
import { useMainStore } from '~/stores/main'

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
  datas: {
    type: Array,
    default: () => Array.from({ length: getDaysInCurrentMonth() }).fill(undefined) as number[],
  },
})
const { t } = useI18n()
const main = useMainStore()
function sum(arr: number[]) {
  return arr.reduce((a, b) => a + b, 0)
}
const total = computed(() => {
  // remove undefined values
  const arr = props.datas as number[]
  const arrWithoutUndefined = arr.filter((val: any) => val !== undefined)

  if (arrWithoutUndefined.length === 0) {
    return 0
  }

  if (!props.accumulated) {
    return arrWithoutUndefined[arrWithoutUndefined.length - 1] || 0
  }
  return sum(arrWithoutUndefined)
})
const lastDayEvolution = computed(() => {
  const arr = props.datas as number[]
  const arrWithoutUndefined = arr.filter((val: any) => val !== undefined)

  if (arrWithoutUndefined.length < 2) {
    return 0
  }

  const oldTotal = props.accumulated ? sum(arrWithoutUndefined.slice(0, -2)) : arrWithoutUndefined[arrWithoutUndefined.length - 2] || 0
  const diff = (total.value as number) - oldTotal

  // Prevent division by zero
  if (oldTotal === 0 && diff === 0) {
    return 0
  }

  const denominator = arr.length > 2 ? oldTotal : diff
  // Prevent division by zero
  if (denominator === 0) {
    return diff > 0 ? 100 : -100
  }

  return diff / denominator * 100
})

function lastRunDate() {
  const lastRun = dayjs(main.statsTime.last_run).format('MMMM D, YYYY HH:mm')
  return `${t('last-run')}: ${lastRun}`
}
function nextRunDate() {
  const nextRun = dayjs(main.statsTime.next_run).format('MMMM D, YYYY HH:mm')
  return `${t('next-run')}: ${nextRun}`
}
</script>

<template>
  <div class="flex flex-col bg-white border rounded-lg shadow-lg col-span-full border-slate-300 sm:col-span-6 xl:col-span-4 dark:border-slate-900 dark:bg-gray-800 h-[460px]">
    <div class="px-5 pt-3">
      <div class="flex flex-row items-center">
        <h2 class="mb-2 mr-2 text-2xl font-semibold text-slate-800 dark:text-white">
          {{ props.title }}
        </h2>
        <div class="tooltip">
          <div class="tooltip-content">
            <div class="max-w-xs whitespace-normal">
              {{ lastRunDate() }}
            </div>
            <div class="max-w-xs whitespace-normal">
              {{ nextRunDate() }}
            </div>
          </div>
          <div class="flex items-center justify-center w-5 h-5 cursor-pointer">
            <IcBaselineInfo class="w-4 h-4 text-slate-400 dark:text-white" />
          </div>
        </div>
      </div>

      <div class="mb-1 text-xs font-semibold uppercase text-slate-400 dark:text-white">
        {{ t('usage-title') }}
      </div>
      <div class="flex items-start">
        <div id="usage_val" class="mr-2 text-3xl font-bold text-slate-800 dark:text-white">
          {{ total?.toLocaleString() }} {{ unit }}
        </div>
        <div v-if="lastDayEvolution" class="rounded-full bg-emerald-500 px-1.5 text-sm font-semibold text-white">
          {{ lastDayEvolution < 0 ? '-' : '+' }}{{ lastDayEvolution.toFixed(2) }}%
        </div>
      </div>
    </div>
    <!-- Chart built with Chart.js 3 -->

    <!-- Change the height attribute to adjust the chart height -->
    <div class="w-full h-full p-6">
      <LineChartStats v-if="props.datas?.length" :title="props.title" :colors="props.colors" :limits="props.limits" :data="props.datas" :accumulated="accumulated" />
      <div v-else class="flex flex-col items-center justify-center h-full">
        {{ t('no-data') }}
      </div>
    </div>
  </div>
</template>
