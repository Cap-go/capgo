<script setup lang="ts">
import { computed } from 'vue'
import { getDaysInCurrentMonth } from '~/services/date'
import ChartCard from './ChartCard.vue'
import LineChartStats from './LineChartStats.vue'

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
  data: {
    type: Array,
    default: undefined,
  },
  dataByApp: {
    type: Object,
    default: () => ({}),
  },
  appNames: {
    type: Object,
    default: () => ({}),
  },
  isLoading: {
    type: Boolean,
    default: false,
  },
})

const dataArray = computed(() => {
  if (!props.data || props.data.length === 0) {
    return Array.from({ length: getDaysInCurrentMonth() }).fill(undefined) as number[]
  }
  return props.data as number[]
})

const total = computed(() => {
  const hasData = dataArray.value.some(val => val !== undefined)
  const sumValues = (values: number[]) => values.reduce((acc, val) => (typeof val === 'number' ? acc + val : acc), 0)

  if (hasData) {
    return sumValues(dataArray.value)
  }

  if (props.dataByApp && Object.keys(props.dataByApp).length > 0) {
    return Object.values(props.dataByApp).reduce((totalSum, appValues: any) => {
      return totalSum + sumValues(appValues)
    }, 0)
  }

  return 0
})

const lastDayEvolution = computed(() => {
  const arr = props.data as number[]
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

const hasData = computed(() => (props.data as number[]).length > 0)
</script>

<template>
  <ChartCard
    :title="title"
    :total="total"
    :unit="unit"
    :last-day-evolution="lastDayEvolution"
    :has-data="hasData"
    :is-loading="isLoading"
  >
    <LineChartStats
      :key="`${useBillingPeriod}-${accumulated}`"
      :title="title"
      :colors="colors"
      :limits="limits"
      :data="data"
      :data-by-app="dataByApp"
      :app-names="appNames"
      :accumulated="accumulated"
      :use-billing-period="useBillingPeriod"
    />
  </ChartCard>
</template>
