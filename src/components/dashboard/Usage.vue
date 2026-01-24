<script setup lang="ts">
import type { Database } from '~/types/supabase.types'
import dayjs from 'dayjs'
import { storeToRefs } from 'pinia'
import colors from 'tailwindcss/colors'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import ArrowPathIconSolid from '~icons/heroicons/arrow-path-solid'
import BanknotesIcon from '~icons/heroicons/banknotes'
import CalendarDaysIcon from '~icons/heroicons/calendar-days'
import ChartBarIcon from '~icons/heroicons/chart-bar'
import InformationInfo from '~icons/heroicons/information-circle'
import { bytesToGb, getDaysBetweenDates } from '~/services/conversion'
import { DEMO_APP_NAMES, generateDemoBandwidthData, generateDemoMauData, generateDemoStorageData } from '~/services/demoChartData'
import { getPlans } from '~/services/supabase'
import { useDashboardAppsStore } from '~/stores/dashboardApps'
import { useDialogV2Store } from '~/stores/dialogv2'
import { useMainStore } from '~/stores/main'
import { useOrganizationStore } from '~/stores/organization'
import DeploymentStatsCard from './DeploymentStatsCard.vue'
import UpdateStatsCard from './UpdateStatsCard.vue'
import UsageCard from './UsageCard.vue'

const props = defineProps<{
  appId?: string
  forceDemo?: boolean
}>()

const plans = ref<Database['public']['Tables']['plans']['Row'][]>([])
const { t } = useI18n()

const noData = computed(() => false)
const loadedAlready = ref(false)
const storageDisplayGb = ref(true)
const storageUnit = computed(() => storageDisplayGb.value ? 'GB' : 'MB')
// const noData = computed(() => data.value.mau.length == 0)

const data = ref({
  mau: [] as number[],
  storage: [] as number[],
  bandwidth: [] as number[],
})

const dataByApp = ref({
  mau: {} as { [appId: string]: number[] },
  storage: {} as { [appId: string]: number[] },
  bandwidth: {} as { [appId: string]: number[] },
})

const appNames = ref<{ [appId: string]: string }>({})

// Create computed properties to ensure reactivity when switching between modes
const mauData = computed(() => data.value.mau)
const storageData = computed(() => data.value.storage)
const bandwidthData = computed(() => data.value.bandwidth)
const mauDataByApp = computed(() => dataByApp.value.mau)
const storageDataByApp = computed(() => dataByApp.value.storage)
const bandwidthDataByApp = computed(() => dataByApp.value.bandwidth)

const isLoading = ref(true)
const chartsLoaded = ref({
  usage: false,
  bundles: false,
  updates: false,
  deployments: false,
})
const reloadTrigger = ref(0) // Increment this to trigger reload in all charts

// Per-org cache for 30-day data: Map<orgId, cachedData>
const cacheByOrg = new Map<string, {
  mau: number[]
  storage: number[]
  bandwidth: number[]
}>()

const cacheByOrgByApp = new Map<string, {
  mau: { [appId: string]: number[] }
  storage: { [appId: string]: number[] }
  bandwidth: { [appId: string]: number[] }
}>()

// Track current org for change detection
const currentCacheOrgId = ref<string | null>(null)

// View mode selectors for charts
const route = useRoute()
const router = useRouter()

// Initialize from URL parameters (default: cumulative=false, billingPeriod=false)
const showCumulative = ref(route.query.cumulative === 'true') // Switch 1: Daily vs Cumulative (daily by default)
const useBillingPeriod = ref(route.query.billingPeriod === 'true') // Switch 2: Billing Period vs Last 30 Days (last 30 days by default)

// Handle refresh=true parameter (used after demo app creation to ensure fresh data)
const needsForceRefresh = ref(route.query.refresh === 'true')
if (needsForceRefresh.value) {
  // Clear all caches to ensure fresh data is fetched
  cacheByOrg.clear()
  cacheByOrgByApp.clear()
  // Remove the refresh parameter from URL to prevent re-clearing on back navigation
  const query = { ...route.query }
  delete query.refresh
  router.replace({ query })
}

const main = useMainStore()
const organizationStore = useOrganizationStore()
const dashboardAppsStore = useDashboardAppsStore()
const dialogStore = useDialogV2Store()

const { dashboard } = storeToRefs(main)

const subscriptionAnchorStart = computed(() => {
  const start = organizationStore.currentOrganization?.subscription_start
  return start ? dayjs(start).format('YYYY/MM/D') : t('unknown')
})
const subscriptionAnchorEnd = computed(() => {
  const end = organizationStore.currentOrganization?.subscription_end
  return end ? dayjs(end).format('YYYY/MM/D') : t('unknown')
})
const lastRunDisplay = computed(() => {
  const source = organizationStore.currentOrganization?.stats_updated_at
  return source ? dayjs(source).format('MMMM D, YYYY HH:mm') : t('unknown')
})
const nextRunDisplay = computed(() => {
  const source = organizationStore.currentOrganization?.next_stats_update_at
  return source ? dayjs(source).format('MMMM D, YYYY HH:mm') : t('unknown')
})

// Confirmation logic for cumulative mode in 30-day view
async function handleCumulativeClick() {
  if (!useBillingPeriod.value) {
    // Show confirmation dialog when trying to enable cumulative in 30-day mode
    dialogStore.openDialog({
      title: t('cumulative'),
      description: t('confirm-switch-to-billing-period-for-cumulative'),
      buttons: [
        {
          text: t('cancel'),
          role: 'cancel',
        },
        {
          text: t('switch-to-billing-period'),
          role: 'primary',
          handler: () => {
            // Switch to billing period first, then enable cumulative
            useBillingPeriod.value = true
            showCumulative.value = true
          },
        },
      ],
    })
  }
  else {
    // Already in billing period, just toggle cumulative mode
    showCumulative.value = true
  }
}

// Function to update URL query parameters
function updateUrlParams() {
  const query = { ...route.query }

  // Only add to URL if different from defaults (daily is default)
  if (showCumulative.value) {
    query.cumulative = 'true'
  }
  else {
    delete query.cumulative
  }

  // Only add to URL if different from default (last 30 days is default)
  if (useBillingPeriod.value) {
    query.billingPeriod = 'true'
  }
  else {
    delete query.billingPeriod
  }

  // Use window.history.replaceState to avoid triggering route guards
  // This updates the URL without triggering navigation events
  const url = new URL(window.location.href)
  url.search = new URLSearchParams(query as Record<string, string>).toString()
  window.history.replaceState({}, '', url.toString())
}

// Function to clear dashboard-specific query parameters
function clearDashboardParams() {
  const query = { ...route.query }
  delete query.cumulative
  delete query.billingPeriod
  router.replace({ query })
}

// Function to reload all chart data
async function reloadAllCharts() {
  // Force reload of main dashboard data
  // End date should be tomorrow at midnight to include all of today's data
  const last30DaysEnd = new Date()
  last30DaysEnd.setHours(0, 0, 0, 0)
  last30DaysEnd.setDate(last30DaysEnd.getDate() + 1) // Tomorrow midnight
  // Start date should be 29 days ago at midnight (to get 30 days total including today)
  const last30DaysStart = new Date()
  last30DaysStart.setHours(0, 0, 0, 0)
  last30DaysStart.setDate(last30DaysStart.getDate() - 29)

  const orgId = organizationStore.currentOrganization?.gid
  if (orgId) {
    await main.updateDashboard(orgId, last30DaysStart.toISOString(), last30DaysEnd.toISOString())
  }

  // Force reload apps data
  await dashboardAppsStore.fetchApps(true)

  // Increment reload trigger for all chart components
  reloadTrigger.value++

  // Also reload usage data - force refetch
  await getUsages(true)
}

// Expose function and state for parent components
defineExpose({
  clearDashboardParams,
  useBillingPeriod,
  showCumulative,
})

const allLimits = computed(() => {
  return plans.value.reduce((p, plan) => {
    const newP = {
      ...p,
    }
    newP.mau[plan.name] = plan.mau
    newP.storage[plan.name] = plan.storage
    newP.bandwidth[plan.name] = plan.bandwidth
    return newP
  }, {
    mau: {} as any,
    storage: {} as any,
    bandwidth: {} as any,
  })
})

async function getAppStats() {
  if (props.appId) {
    return {
      global: main.filterDashboard(props.appId),
      byApp: {},
      appNames: {},
    }
  }

  // Use store for apps data
  // Only fetch if not already loaded
  if (!dashboardAppsStore.isLoaded) {
    await dashboardAppsStore.fetchApps()
  }

  return {
    global: main.dashboard,
    byApp: main.dashboardByapp,
    appNames: dashboardAppsStore.appNames,
  }
}

// Helper function to filter 30-day data to billing period
function filterToBillingPeriod(fullData: { mau: number[], storage: number[], bandwidth: number[] }, last30DaysStart: Date, billingStart: Date) {
  const currentDate = new Date()
  // Reset current date to start of day for consistent comparison
  currentDate.setHours(0, 0, 0, 0)

  // Calculate billing period length - use getDaysBetweenDates for consistency
  // Simply calculate days between billing start and current date + 1 (to include today)
  const currentBillingDay = getDaysBetweenDates(billingStart, currentDate) + 1

  // Create arrays for billing period length
  const billingData = {
    mau: Array.from({ length: currentBillingDay }).fill(undefined) as number[],
    storage: Array.from({ length: currentBillingDay }).fill(undefined) as number[],
    bandwidth: Array.from({ length: currentBillingDay }).fill(undefined) as number[],
  }

  // Map 30-day data to billing period
  for (let i = 0; i < 30; i++) {
    const dataDate = new Date(last30DaysStart)
    dataDate.setDate(dataDate.getDate() + i)
    // Reset to start of day for consistent comparison
    dataDate.setHours(0, 0, 0, 0)

    // Check if this date falls within current billing period
    if (dataDate >= billingStart && dataDate <= currentDate) {
      const billingIndex = getDaysBetweenDates(billingStart, dataDate)
      if (billingIndex >= 0 && billingIndex < currentBillingDay) {
        billingData.mau[billingIndex] = fullData.mau[i]
        billingData.storage[billingIndex] = fullData.storage[i]
        billingData.bandwidth[billingIndex] = fullData.bandwidth[i]
      }
    }
  }

  return { data: billingData }
}

async function getUsages(forceRefetch = false) {
  // Always work with last 30 days of data
  // End date should be tomorrow at midnight to include all of today's data
  const last30DaysEnd = new Date()
  last30DaysEnd.setHours(0, 0, 0, 0)
  last30DaysEnd.setDate(last30DaysEnd.getDate() + 1) // Tomorrow midnight
  // Start date should be 29 days ago at midnight (to get 30 days total including today)
  const last30DaysStart = new Date()
  last30DaysStart.setHours(0, 0, 0, 0)
  last30DaysStart.setDate(last30DaysStart.getDate() - 29)

  // Get billing period dates for filtering
  const billingStart = new Date(organizationStore.currentOrganization?.subscription_start ?? new Date())
  // Reset to start of day to match calculation in store
  billingStart.setHours(0, 0, 0, 0)

  const currentOrgId = organizationStore.currentOrganization?.gid ?? null
  currentCacheOrgId.value = currentOrgId

  // Check per-org cache - only use if not forcing refetch
  const cachedData = currentOrgId ? cacheByOrg.get(currentOrgId) : null
  const cachedDataByApp = currentOrgId ? cacheByOrgByApp.get(currentOrgId) : null

  if (cachedData && !forceRefetch) {
    // Filter data based on billing period mode
    if (useBillingPeriod.value) {
      // Show only data within billing period
      const filteredData = filterToBillingPeriod(cachedData, last30DaysStart, billingStart)
      data.value = filteredData.data

      // Filter by-app data too if available
      if (cachedDataByApp && Object.keys(cachedDataByApp.mau).length > 0) {
        const newDataByApp = {
          mau: {} as { [appId: string]: number[] },
          storage: {} as { [appId: string]: number[] },
          bandwidth: {} as { [appId: string]: number[] },
        }
        Object.keys(cachedDataByApp.mau).forEach((appId) => {
          const appData = {
            mau: cachedDataByApp.mau[appId],
            storage: cachedDataByApp.storage[appId],
            bandwidth: cachedDataByApp.bandwidth[appId],
          }
          const filteredAppData = filterToBillingPeriod(appData, last30DaysStart, billingStart)
          newDataByApp.mau[appId] = filteredAppData.data.mau
          newDataByApp.storage[appId] = filteredAppData.data.storage
          newDataByApp.bandwidth[appId] = filteredAppData.data.bandwidth
        })
        dataByApp.value = newDataByApp
      }
    }
    else {
      // Show all 30 days from cache - deep copy to ensure reactivity
      data.value = {
        mau: [...cachedData.mau],
        storage: [...cachedData.storage],
        bandwidth: [...cachedData.bandwidth],
      }
      if (cachedDataByApp) {
        // Deep copy the by-app data to ensure reactivity
        const newDataByApp = {
          mau: {} as { [appId: string]: number[] },
          storage: {} as { [appId: string]: number[] },
          bandwidth: {} as { [appId: string]: number[] },
        }
        Object.keys(cachedDataByApp.mau).forEach((appId) => {
          newDataByApp.mau[appId] = [...cachedDataByApp.mau[appId]]
          newDataByApp.storage[appId] = [...cachedDataByApp.storage[appId]]
          newDataByApp.bandwidth[appId] = [...cachedDataByApp.bandwidth[appId]]
        })
        dataByApp.value = newDataByApp
      }
    }

    return
  }

  const { global: globalStats, byApp: byAppStats, appNames: appNamesMap } = await getAppStats()

  const finalData = globalStats.map((item: any) => {
    const itemDate = new Date(item.date)
    // Reset to start of day for consistent date handling
    itemDate.setHours(0, 0, 0, 0)
    return {
      ...item,
      date: itemDate,
    } as { mau: number, storage: number, bandwidth: number, date: Date }
  })

  // Create 30-day arrays
  const full30DayData = {
    mau: Array.from({ length: 30 }).fill(undefined) as number[],
    storage: Array.from({ length: 30 }).fill(undefined) as number[],
    bandwidth: Array.from({ length: 30 }).fill(undefined) as number[],
  }

  // Populate with data from last 30 days
  finalData.forEach((item) => {
    const index = getDaysBetweenDates(last30DaysStart, item.date)
    if (index >= 0 && index < 30) {
      full30DayData.mau[index] = item.mau
      full30DayData.storage[index] = bytesToGb(item.storage ?? 0, 2)
      full30DayData.bandwidth[index] = bytesToGb(item.bandwidth ?? 0, 2)
    }
  })

  // Store in per-org cache
  if (currentOrgId) {
    cacheByOrg.set(currentOrgId, full30DayData)
  }

  // Process by-app data if available
  appNames.value = appNamesMap
  const full30DayDataByApp = {
    mau: {} as { [appId: string]: number[] },
    storage: {} as { [appId: string]: number[] },
    bandwidth: {} as { [appId: string]: number[] },
  }

  if (byAppStats && Array.isArray(byAppStats) && byAppStats.length > 0 && !props.appId) {
    // Group by app_id
    const appGroups: { [appId: string]: any[] } = {}
    byAppStats.forEach((item: any) => {
      if (!appGroups[item.app_id]) {
        appGroups[item.app_id] = []
      }
      appGroups[item.app_id].push({
        ...item,
        date: new Date(item.date),
      })
    })

    // Process each app's data for 30 days
    Object.keys(appGroups).forEach((appId) => {
      full30DayDataByApp.mau[appId] = Array.from({ length: 30 }).fill(undefined) as number[]
      full30DayDataByApp.storage[appId] = Array.from({ length: 30 }).fill(undefined) as number[]
      full30DayDataByApp.bandwidth[appId] = Array.from({ length: 30 }).fill(undefined) as number[]

      appGroups[appId].forEach((item) => {
        const index = getDaysBetweenDates(last30DaysStart, item.date)
        if (index >= 0 && index < 30) {
          full30DayDataByApp.mau[appId][index] = item.mau
          full30DayDataByApp.storage[appId][index] = bytesToGb(item.storage ?? 0, 2)
          full30DayDataByApp.bandwidth[appId][index] = bytesToGb(item.bandwidth ?? 0, 2)
        }
      })
    })
  }

  // Store in per-org cache
  if (currentOrgId) {
    cacheByOrgByApp.set(currentOrgId, full30DayDataByApp)
  }
  dataByApp.value = full30DayDataByApp

  // Filter data based on billing period mode
  if (useBillingPeriod.value) {
    // Show only data within billing period
    const filteredData = filterToBillingPeriod(full30DayData, last30DaysStart, billingStart)
    data.value = filteredData.data

    // Filter by-app data too
    if (Object.keys(full30DayDataByApp.mau).length > 0) {
      const newDataByApp = {
        mau: {} as { [appId: string]: number[] },
        storage: {} as { [appId: string]: number[] },
        bandwidth: {} as { [appId: string]: number[] },
      }
      Object.keys(full30DayDataByApp.mau).forEach((appId) => {
        const appData = {
          mau: full30DayDataByApp.mau[appId],
          storage: full30DayDataByApp.storage[appId],
          bandwidth: full30DayDataByApp.bandwidth[appId],
        }
        const filteredAppData = filterToBillingPeriod(appData, last30DaysStart, billingStart)
        newDataByApp.mau[appId] = filteredAppData.data.mau
        newDataByApp.storage[appId] = filteredAppData.data.storage
        newDataByApp.bandwidth[appId] = filteredAppData.data.bandwidth
      })
      dataByApp.value = newDataByApp
    }
  }
  else {
    // Show all 30 days
    data.value = full30DayData
  }
}

async function loadDemoData() {
  // Generate demo data for payment failed state
  const demoMau = generateDemoMauData(30)
  const demoStorage = generateDemoStorageData(30).map(v => v / 1000) // Convert MB to GB
  const demoBandwidth = generateDemoBandwidthData(30)

  data.value = {
    mau: demoMau,
    storage: demoStorage,
    bandwidth: demoBandwidth,
  }

  // Generate by-app breakdown for demo
  dataByApp.value = {
    mau: {
      'demo-app-1': generateDemoMauData(30).map(v => Math.round(v * 0.6)),
      'demo-app-2': generateDemoMauData(30).map(v => Math.round(v * 0.4)),
    },
    storage: {
      'demo-app-1': generateDemoStorageData(30).map(v => v / 1000 * 0.6),
      'demo-app-2': generateDemoStorageData(30).map(v => v / 1000 * 0.4),
    },
    bandwidth: {
      'demo-app-1': generateDemoBandwidthData(30).map(v => v * 0.6),
      'demo-app-2': generateDemoBandwidthData(30).map(v => v * 0.4),
    },
  }
  appNames.value = DEMO_APP_NAMES
}

async function loadData() {
  const startTime = Date.now()
  isLoading.value = true

  await getPlans().then((pls) => {
    plans.value.length = 0
    plans.value.push(...pls)
  })

  // If forceDemo is true, use demo data instead of fetching real data
  if (props.forceDemo) {
    await loadDemoData()
  }
  else {
    await getUsages(true) // Initial load - force fetch
  }

  // Ensure spinner shows for at least 300ms for better UX
  const elapsed = Date.now() - startTime
  if (elapsed < 300) {
    await new Promise(resolve => setTimeout(resolve, 300 - elapsed))
  }
  isLoading.value = false
  chartsLoaded.value.usage = true
  loadedAlready.value = true // Mark as loaded so watcher can reload data on mode changes

  // Stagger additional charts loading to improve perceived performance
  setTimeout(() => {
    chartsLoaded.value.bundles = true
  }, 100)

  setTimeout(() => {
    chartsLoaded.value.updates = true
  }, 200)

  setTimeout(() => {
    chartsLoaded.value.deployments = true
  }, 300)
}

// Watch for organization changes - show loading immediately when org switches
watch(() => organizationStore.currentOrganization?.gid, (newOrgId, oldOrgId) => {
  if (newOrgId && oldOrgId && newOrgId !== oldOrgId && loadedAlready.value) {
    // Show loading state immediately when org changes (before data is fetched)
    isLoading.value = true
    // Increment reload trigger to force all child charts to refetch
    reloadTrigger.value++
  }
})

watch(dashboard, async (_dashboard) => {
  if (loadedAlready.value) {
    // Data has been refreshed (e.g., after org switch) - process it
    await getUsages(true) // Dashboard data changed, force refetch
    isLoading.value = false
  }
  else {
    loadedAlready.value = true
    // If refresh parameter was present, force a complete reload to fetch fresh data from server
    if (needsForceRefresh.value) {
      needsForceRefresh.value = false
      await reloadAllCharts()
    }
    else {
      await loadData()
    }
  }
})

// Watch view mode changes and refetch data only when needed
watch([showCumulative, useBillingPeriod], async (newValues, oldValues) => {
  const [, newBillingPeriod] = newValues
  const [, oldBillingPeriod] = oldValues || [null, null]

  // Force daily mode when switching to Last 30 Days (cumulative doesn't make sense)
  if (!newBillingPeriod && oldBillingPeriod !== null) {
    showCumulative.value = false
  }

  // Reprocess data when billing period mode changes - use cached data if available
  if (loadedAlready.value && newBillingPeriod !== oldBillingPeriod && oldBillingPeriod !== null) {
    await getUsages(false) // Use cache if available
  }

  // Update URL parameters
  updateUrlParams()
})

// Watch for URL parameter changes (e.g., browser back/forward)
watch(() => route.query, (newQuery) => {
  const newCumulative = newQuery.cumulative === 'true' // daily is default
  const newBillingPeriod = newQuery.billingPeriod === 'true' // last 30 days is default

  if (showCumulative.value !== newCumulative) {
    showCumulative.value = newCumulative
  }
  if (useBillingPeriod.value !== newBillingPeriod) {
    useBillingPeriod.value = newBillingPeriod
  }
}, { deep: true })

onMounted(async () => {
  // If forceDemo is true, load immediately with demo data
  if (props.forceDemo) {
    loadData()
  }
  else if (main.dashboardFetched) {
    // If refresh parameter was present, force a complete reload including store refresh
    if (needsForceRefresh.value) {
      needsForceRefresh.value = false
      await reloadAllCharts()
    }
    else {
      loadData()
    }
  }
  // If dashboard not fetched yet, the watcher on 'dashboard' will handle loading
  // and will check needsForceRefresh there
})
</script>

<template>
  <!-- View Mode Selectors -->
  <div v-if="!noData" class="mb-4">
    <div class="flex items-center justify-end gap-2 flex-nowrap sm:gap-4">
      <!-- Daily vs Cumulative Switch -->
      <div class="flex items-center p-1 space-x-1 bg-gray-200 rounded-lg dark:bg-gray-800">
        <button
          class="flex gap-0.5 justify-center items-center py-1 px-2 text-xs font-medium text-center whitespace-nowrap rounded-md transition-colors cursor-pointer sm:gap-1.5 sm:px-3"
          :class="[!showCumulative || !useBillingPeriod ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white']"
          :aria-label="t('daily')"
          @click="showCumulative = false"
        >
          <CalendarDaysIcon class="w-4 h-4" />
          <span class="hidden sm:inline">{{ t('daily') }}</span>
        </button>
        <button
          class="flex gap-0.5 justify-center items-center py-1 px-2 text-xs font-medium text-center whitespace-nowrap rounded-md transition-colors cursor-pointer sm:gap-1.5 sm:px-3"
          :class="[
            showCumulative && useBillingPeriod
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white',
          ]"
          :aria-label="t('cumulative')"
          @click="handleCumulativeClick"
        >
          <ChartBarIcon class="w-4 h-4" />
          <span class="hidden sm:inline">{{ t('cumulative') }}</span>
        </button>
      </div>

      <!-- Billing Period vs Last 30 Days Switch -->
      <div class="flex items-center p-1 space-x-1 bg-gray-200 rounded-lg dark:bg-gray-800">
        <button
          class="flex gap-0.5 justify-center items-center py-1 px-2 text-xs font-medium text-center whitespace-nowrap rounded-md transition-colors cursor-pointer sm:gap-1.5 sm:px-3" :class="[useBillingPeriod ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white']"
          :aria-label="t('billing-period')"
          @click="useBillingPeriod = true"
        >
          <BanknotesIcon class="w-4 h-4" />
          <span class="hidden sm:inline">{{ t('billing-period') }}</span>
        </button>
        <button
          class="flex gap-0.5 justify-center items-center py-1 px-2 text-xs font-medium text-center whitespace-nowrap rounded-md transition-colors cursor-pointer sm:gap-1.5 sm:px-3" :class="[!useBillingPeriod ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white']"
          :aria-label="t('last-30-days')"
          @click="useBillingPeriod = false"
        >
          <CalendarDaysIcon class="w-4 h-4" />
          <span class="hidden sm:inline">{{ t('last-30-days') }}</span>
        </button>
      </div>

      <!-- Reload Button -->
      <button
        type="button"
        class="flex items-center justify-center w-8 h-8 text-gray-700 transition-colors bg-white rounded-md shadow-sm cursor-pointer sm:w-9 sm:h-9 dark:text-gray-200 dark:bg-gray-700 hover:text-gray-900 hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:outline-none dark:hover:bg-gray-600 dark:hover:text-white dark:focus:ring-blue-400"
        :aria-label="t('reload')"
        @click="reloadAllCharts"
      >
        <ArrowPathIconSolid class="w-4 h-4" />
      </button>

      <!-- Usage Info Tooltip -->
      <div class="relative flex items-center group">
        <button
          type="button"
          class="flex items-center justify-center w-8 h-8 text-gray-700 transition-colors bg-white rounded-md shadow-sm cursor-pointer sm:w-9 sm:h-9 dark:text-gray-200 dark:bg-gray-700 hover:text-gray-900 hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:outline-none dark:hover:bg-gray-600 dark:hover:text-white dark:focus:ring-blue-400"
          :aria-label="t('info')"
        >
          <InformationInfo class="w-4 h-4" />
        </button>
        <div class="hidden absolute right-0 top-full z-10 p-4 text-sm text-gray-800 bg-white rounded-lg border border-gray-200 shadow-2xl translate-y-2 pointer-events-none dark:text-white dark:bg-gray-800 dark:border-gray-600 group-hover:block w-[min(320px,calc(100vw-32px))] group-focus-within:block">
          <div class="space-y-3">
            <div class="flex items-start space-x-2">
              <div class="w-2 h-2 mt-2 bg-green-500 rounded-full shrink-0" />
              <div>
                <div class="text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
                  {{ t('last-run') }}
                </div>
                <div class="text-sm font-medium">
                  {{ lastRunDisplay }}
                </div>
              </div>
            </div>
            <div class="flex items-start space-x-2">
              <div class="w-2 h-2 mt-2 bg-blue-500 rounded-full shrink-0" />
              <div>
                <div class="text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
                  {{ t('next-run') }}
                </div>
                <div class="text-sm font-medium">
                  {{ nextRunDisplay }}
                </div>
              </div>
            </div>
            <div class="pt-2 border-t border-gray-200 dark:border-gray-600">
              <div class="flex items-start space-x-2">
                <div class="w-2 h-2 mt-2 bg-purple-500 rounded-full shrink-0" />
                <div>
                  <div class="text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
                    {{ t('billing-cycle') }}
                  </div>
                  <div class="text-sm font-medium">
                    {{ subscriptionAnchorStart }} {{ t('to') }} {{ subscriptionAnchorEnd }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div
    v-if="!noData || isLoading"
    class="grid grid-cols-1 gap-6 mb-6 sm:grid-cols-12"
    :class="appId ? 'xl:grid-cols-16' : 'xl:grid-cols-12'"
  >
    <UsageCard
      id="mau-stat" :limits="allLimits.mau" :colors="colors.cyan" :accumulated="useBillingPeriod && showCumulative"
      :data="mauData" :data-by-app="mauDataByApp" :app-names="appNames" :title="`${t('monthly-active')}`" :unit="t('units-users')"
      :use-billing-period="useBillingPeriod"
      :is-loading="isLoading"
      :force-demo="forceDemo"
      class="col-span-full sm:col-span-6 xl:col-span-4"
    />
    <UsageCard
      :limits="allLimits.storage" :colors="colors.blue" :data="storageData" :data-by-app="storageDataByApp" :app-names="appNames" :accumulated="useBillingPeriod && showCumulative"
      :title="t('Storage')" :unit="storageUnit"
      :use-billing-period="useBillingPeriod"
      :is-loading="isLoading"
      :force-demo="forceDemo"
      class="col-span-full sm:col-span-6 xl:col-span-4"
    />
    <UsageCard
      :limits="allLimits.bandwidth" :colors="colors.orange" :data="bandwidthData" :data-by-app="bandwidthDataByApp" :app-names="appNames" :accumulated="useBillingPeriod && showCumulative"
      :title="t('Bandwidth')" :unit="t('units-gb')"
      :use-billing-period="useBillingPeriod"
      :is-loading="isLoading"
      :force-demo="forceDemo"
      class="col-span-full sm:col-span-6 xl:col-span-4"
    />
    <DevicesStats v-show="appId" :use-billing-period="useBillingPeriod" :accumulated="useBillingPeriod && showCumulative" :reload-trigger="reloadTrigger" :force-demo="forceDemo" class="col-span-full sm:col-span-6 xl:col-span-4" />
    <BundleUploadsCard v-show="!appId" :use-billing-period="useBillingPeriod" :accumulated="useBillingPeriod && showCumulative" :reload-trigger="reloadTrigger" :force-demo="forceDemo" class="col-span-full sm:col-span-6 xl:col-span-4" />
    <UpdateStatsCard v-show="!appId" :use-billing-period="useBillingPeriod" :accumulated="useBillingPeriod && showCumulative" :reload-trigger="reloadTrigger" :force-demo="forceDemo" class="col-span-full sm:col-span-6 xl:col-span-4" />
    <DeploymentStatsCard v-show="!appId" :use-billing-period="useBillingPeriod" :accumulated="useBillingPeriod && showCumulative" :reload-trigger="reloadTrigger" :force-demo="forceDemo" class="col-span-full sm:col-span-6 xl:col-span-4" />
  </div>
</template>
