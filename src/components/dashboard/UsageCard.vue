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
import { useDashboardAppsStore } from '~/stores/dashboardApps'
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
  // When true, show demo data (payment failed state)
  forceDemo: {
    type: Boolean,
    default: false,
  },
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
  const dataLength = (props.data as number[]).length
  const days = getDemoDayCount(props.useBillingPeriod, dataLength)
  const generator = getDataGenerator(props.title)
  return generateConsistentDemoData(days, generator)
})

// Demo data accessors that ensure consistency
const demoData = computed(() => consistentDemoData.value.total)
const demoDataByApp = computed(() => consistentDemoData.value.byApp)

// Demo mode: show demo data only when forceDemo is true OR user has no apps
// If user has apps, ALWAYS show real data (even if empty)
const dashboardAppsStore = useDashboardAppsStore()
const isDemoMode = computed(() => {
  if (props.forceDemo)
    return true
  // If user has apps, never show demo data
  if (dashboardAppsStore.apps.length > 0)
    return false
  // No apps and store is loaded = show demo
  return dashboardAppsStore.isLoaded
})
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

// Check if there's actual chart data (values in the array), not just a total
// This handles cases like Storage where total can be > 0 but no activity in current period
const hasChartData = computed(() => {
  if (isDemoMode.value)
    return true
  const dataArray = effectiveData.value
  // Check if any value in the array is defined and > 0
  return dataArray.some(val => typeof val === 'number' && val > 0)
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
