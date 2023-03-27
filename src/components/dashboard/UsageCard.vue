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
  <div class="col-span-full flex flex-col border border-slate-200 rounded-lg bg-white shadow-lg sm:col-span-6 xl:col-span-4 dark:border-slate-900 dark:bg-gray-800">
    <div class="px-5 pt-3">
      <div class="flex flex-row">
        <h2 class="mb-2 mr-4 text-2xl font-semibold text-slate-800 dark:text-white">
          {{ props.title }}
        </h2>
        <div class="badge badge-primary font-medium">
          beta
        </div>
      </div>

      <div class="mb-1 text-xs font-semibold uppercase text-slate-400 dark:text-white">
        {{ t('usage-title') }}
      </div>
      <div class="flex items-start">
        <div class="mr-2 text-3xl font-bold text-slate-800 dark:text-white">
          {{ total.toLocaleString() }} {{ unit }}
        </div>
        <div v-if="lastDayEvolution" class="rounded-full bg-emerald-500 px-1.5 text-sm font-semibold text-white">
          {{ lastDayEvolution < 0 ? '-' : '+' }}{{ lastDayEvolution.toFixed(2) }}%
        </div>
      </div>
    </div>
    <!-- Chart built with Chart.js 3 -->

    <!-- Change the height attribute to adjust the chart height -->
    <LineChartStats class="mx-auto aspect-square w-full px-3" :title="props.title" :colors="props.colors" :limits="props.limits" :data="props.datas" />
  </div>
</template>
