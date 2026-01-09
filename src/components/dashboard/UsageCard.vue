<script setup lang="ts">
import { computed } from 'vue'
import { getDaysInCurrentMonth } from '~/services/date'
import {
  calculateDemoEvolution,
  DEMO_APP_NAMES,
  generateConsistentDemoData,
  generateDemoBandwidthData,
  generateDemoMauData,
  generateDemoStorageData,
  getDemoDayCount,
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
  // When true, show demo data (payment failed state)
  forceDemo: {
    type: Boolean,
    default: false,
  },
})

const dataArray = computed(() => {
  if (!props.data || props.data.length === 0) {
    return Array.from({ length: getDaysInCurrentMonth() }).fill(undefined) as (number | undefined)[]
  }
  return props.data as (number | undefined)[]
})

// Check if we have real data
const hasRealData = computed(() => {
  const arr = dataArray.value ?? []
  // Has data if there's at least one defined, non-zero value
  const hasDefinedData = arr.some(val => val !== undefined && val !== null && val > 0)
  // Or has data by app with at least one defined value
  const hasAppData = props.dataByApp && Object.values(props.dataByApp).some((appValues: any) =>
    appValues.some((val: any) => val !== undefined && val !== null && val > 0),
  )
  return hasDefinedData || hasAppData
})

// Get the appropriate data generator based on chart type
function getDataGenerator(title: string) {
  const titleLower = title.toLowerCase()
  if (titleLower.includes('active') || titleLower.includes('mau') || titleLower.includes('user')) {
    return generateDemoMauData
  }
  if (titleLower.includes('storage')) {
    return generateDemoStorageData
  }
  if (titleLower.includes('bandwidth')) {
    return generateDemoBandwidthData
  }
  return generateDemoMauData
}

// Generate consistent demo data where total is derived from per-app breakdown
// Use existing data length or default based on billing period mode
const consistentDemoData = computed(() => {
  const dataLength = dataArray.value?.length ?? 0
  const days = getDemoDayCount(props.useBillingPeriod, dataLength)
  const generator = getDataGenerator(props.title)
  return generateConsistentDemoData(days, generator)
})

// Demo data accessors that ensure consistency
const demoData = computed(() => consistentDemoData.value.total)
const demoDataByApp = computed(() => consistentDemoData.value.byApp)

// Use real data or demo data
const isDemoMode = computed(() => props.forceDemo || (!hasRealData.value && !props.isLoading))
const effectiveData = computed(() => isDemoMode.value ? demoData.value : dataArray.value)
const effectiveDataByApp = computed(() => isDemoMode.value ? demoDataByApp.value : props.dataByApp)
const effectiveAppNames = computed(() => isDemoMode.value ? DEMO_APP_NAMES : props.appNames)

const total = computed(() => {
  const arr = effectiveData.value
  const hasData = arr.some(val => val !== undefined)
  const sumValues = (values: number[]) => values.reduce((acc, val) => (typeof val === 'number' ? acc + val : acc), 0)

  if (hasData) {
    return sumValues(arr)
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

  const arr = dataArray.value ?? []
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
  <ChartCard
    :title="title"
    :total="total"
    :unit="unit"
    :last-day-evolution="lastDayEvolution"
    :has-data="hasChartData"
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
