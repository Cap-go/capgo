<script setup lang="ts">
import { computed } from 'vue'
import { getDaysInCurrentMonth } from '~/services/date'
import {
  calculateDemoEvolution,
  DEMO_APP_NAMES,
  generateDemoBandwidthData,
  generateDemoDataByApp,
  generateDemoMauData,
  generateDemoStorageData,
} from '~/services/demoChartData'
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
    default: () => Array.from({ length: getDaysInCurrentMonth() }).fill(undefined) as number[],
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

// Check if we have real data
const hasRealData = computed(() => {
  const dataArray = props.data as number[]
  // Has data if there's at least one defined, non-zero value
  const hasDefinedData = dataArray.some(val => val !== undefined && val !== null && val > 0)
  // Or has data by app with at least one defined value
  const hasAppData = props.dataByApp && Object.values(props.dataByApp).some((appValues: any) =>
    appValues.some((val: any) => val !== undefined && val !== null && val > 0),
  )
  return hasDefinedData || hasAppData
})

// Generate demo data based on title/type
const demoData = computed(() => {
  const days = getDaysInCurrentMonth()
  const titleLower = props.title.toLowerCase()

  if (titleLower.includes('active') || titleLower.includes('mau') || titleLower.includes('user')) {
    return generateDemoMauData(days)
  }
  if (titleLower.includes('storage')) {
    return generateDemoStorageData(days)
  }
  if (titleLower.includes('bandwidth')) {
    return generateDemoBandwidthData(days)
  }
  // Default to MAU-like data
  return generateDemoMauData(days)
})

const demoDataByApp = computed(() => {
  const days = getDaysInCurrentMonth()
  const titleLower = props.title.toLowerCase()

  if (titleLower.includes('active') || titleLower.includes('mau') || titleLower.includes('user')) {
    return generateDemoDataByApp(days, generateDemoMauData)
  }
  if (titleLower.includes('storage')) {
    return generateDemoDataByApp(days, generateDemoStorageData)
  }
  if (titleLower.includes('bandwidth')) {
    return generateDemoDataByApp(days, generateDemoBandwidthData)
  }
  return generateDemoDataByApp(days, generateDemoMauData)
})

// Use real data or demo data
const isDemoMode = computed(() => !hasRealData.value && !props.isLoading)
const effectiveData = computed(() => isDemoMode.value ? demoData.value : props.data as number[])
const effectiveDataByApp = computed(() => isDemoMode.value ? demoDataByApp.value : props.dataByApp)
const effectiveAppNames = computed(() => isDemoMode.value ? DEMO_APP_NAMES : props.appNames)

const total = computed(() => {
  const dataArray = effectiveData.value
  const hasData = dataArray.some(val => val !== undefined)
  const sumValues = (values: number[]) => values.reduce((acc, val) => (typeof val === 'number' ? acc + val : acc), 0)

  if (hasData) {
    return sumValues(dataArray)
  }

  if (effectiveDataByApp.value && Object.keys(effectiveDataByApp.value).length > 0) {
    return Object.values(effectiveDataByApp.value).reduce((totalSum, appValues: any) => {
      return totalSum + sumValues(appValues)
    }, 0)
  }

  return 0
})

const lastDayEvolution = computed(() => {
  if (isDemoMode.value) {
    return calculateDemoEvolution(effectiveData.value)
  }

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

const hasData = computed(() => effectiveData.value.length > 0)
</script>

<template>
  <ChartCard
    :title="title"
    :total="total"
    :unit="unit"
    :last-day-evolution="lastDayEvolution"
    :has-data="hasData"
    :is-loading="isLoading"
    :is-demo-data="isDemoMode"
  >
    <LineChartStats
      :key="`${useBillingPeriod}-${accumulated}-${isDemoMode}`"
      :title="title"
      :colors="colors"
      :limits="isDemoMode ? {} : limits"
      :data="effectiveData"
      :data-by-app="effectiveDataByApp"
      :app-names="effectiveAppNames"
      :accumulated="accumulated"
      :use-billing-period="useBillingPeriod"
    />
  </ChartCard>
</template>
