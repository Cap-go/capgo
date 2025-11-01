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
}>()

const plans = ref<Database['public']['Tables']['plans']['Row'][]>([])
const { t } = useI18n()

const noData = computed(() => false)
const loadedAlready = ref(false)
const storageDisplayGb = ref(true)
const storageUnit = computed(() => storageDisplayGb.value ? 'GB' : 'MB')
// const noData = computed(() => datas.value.mau.length == 0)

const datas = ref({
  mau: [] as number[],
  storage: [] as number[],
  bandwidth: [] as number[],
})

const datasByApp = ref({
  mau: {} as { [appId: string]: number[] },
  storage: {} as { [appId: string]: number[] },
  bandwidth: {} as { [appId: string]: number[] },
})

const creditsV2Enabled = import.meta.env.VITE_FEATURE_CREDITS_V2

const appNames = ref<{ [appId: string]: string }>({})

// Create computed properties to ensure reactivity when switching between modes
const mauData = computed(() => datas.value.mau)
const storageData = computed(() => datas.value.storage)
const bandwidthData = computed(() => datas.value.bandwidth)
const mauDataByApp = computed(() => datasByApp.value.mau)
const storageDataByApp = computed(() => datasByApp.value.storage)
const bandwidthDataByApp = computed(() => datasByApp.value.bandwidth)

const isLoading = ref(true)
const chartsLoaded = ref({
  usage: false,
  bundles: false,
  updates: false,
  deployments: false,
})
const reloadTrigger = ref(0) // Increment this to trigger reload in all charts

// Cache for 30-day data (to avoid refetching when switching modes)
const cached30DayData = ref<{
  mau: number[]
  storage: number[]
  bandwidth: number[]
} | null>(null)

const cached30DayDataByApp = ref<{
  mau: { [appId: string]: number[] }
  storage: { [appId: string]: number[] }
  bandwidth: { [appId: string]: number[] }
} | null>(null)

// View mode selectors for charts
const route = useRoute()
const router = useRouter()

// Initialize from URL parameters (default: cumulative=false, billingPeriod=true)
const showCumulative = ref(route.query.cumulative === 'true') // Switch 1: Daily vs Cumulative (daily by default)
const useBillingPeriod = ref(route.query.billingPeriod !== 'false') // Switch 2: Billing Period vs Last 30 Days
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

const creditTotal = computed(() => Number(organizationStore.currentOrganization?.credit_total ?? 0))
const creditAvailable = computed(() => Number(organizationStore.currentOrganization?.credit_available ?? 0))
const creditUsed = computed(() => Math.max(creditTotal.value - creditAvailable.value, 0))
const creditUsagePercent = computed(() => {
  if (creditTotal.value <= 0)
    return 0
  return Math.min(100, Math.round((creditUsed.value / creditTotal.value) * 100))
})
const creditNextExpiration = computed(() => {
  const expiresAt = organizationStore.currentOrganization?.credit_next_expiration
  return expiresAt ? dayjs(expiresAt).format('MMMM D, YYYY') : null
})
const hasCreditSummary = computed(() => creditTotal.value > 0 || creditAvailable.value > 0)

function formatCredits(value: number) {
  return new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
}

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

  if (!useBillingPeriod.value) {
    query.billingPeriod = 'false'
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
  const last30DaysEnd = new Date()
  const last30DaysStart = new Date()
  last30DaysStart.setDate(last30DaysStart.getDate() - 29) // 30 days including today

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
  // Always work with last 30 days of data - normalize first for consistency
  const last30DaysEnd = new Date()
  last30DaysEnd.setHours(0, 0, 0, 0)
  const last30DaysStart = new Date(last30DaysEnd)
  last30DaysStart.setDate(last30DaysStart.getDate() - 29) // 30 days including today

  // Get billing period dates for filtering
  const billingStart = new Date(organizationStore.currentOrganization?.subscription_start ?? new Date())
  // Reset to start of day to match calculation in store
  billingStart.setHours(0, 0, 0, 0)

  // Use cached 30-day data if available and not forcing refetch
  if (cached30DayData.value && !forceRefetch) {
    // Filter data based on billing period mode
    if (useBillingPeriod.value) {
      // Show only data within billing period
      const filteredData = filterToBillingPeriod(cached30DayData.value, last30DaysStart, billingStart)
      datas.value = filteredData.data

      // Filter by-app data too if available
      if (cached30DayDataByApp.value && Object.keys(cached30DayDataByApp.value.mau).length > 0) {
        Object.keys(cached30DayDataByApp.value.mau).forEach((appId) => {
          const appData = {
            mau: cached30DayDataByApp.value!.mau[appId],
            storage: cached30DayDataByApp.value!.storage[appId],
            bandwidth: cached30DayDataByApp.value!.bandwidth[appId],
          }
          const filteredAppData = filterToBillingPeriod(appData, last30DaysStart, billingStart)
          datasByApp.value.mau[appId] = filteredAppData.data.mau
          datasByApp.value.storage[appId] = filteredAppData.data.storage
          datasByApp.value.bandwidth[appId] = filteredAppData.data.bandwidth
        })
      }
    }
    else {
      // Show all 30 days from cache
      datas.value = { ...cached30DayData.value }
      if (cached30DayDataByApp.value) {
        datasByApp.value = { ...cached30DayDataByApp.value }
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

  // Cache the full 30-day data
  cached30DayData.value = full30DayData

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

  // Cache the full 30-day by-app data
  cached30DayDataByApp.value = full30DayDataByApp
  datasByApp.value = full30DayDataByApp

  // Filter data based on billing period mode
  if (useBillingPeriod.value) {
    // Show only data within billing period
    const filteredData = filterToBillingPeriod(full30DayData, last30DaysStart, billingStart)
    datas.value = filteredData.data

    // Filter by-app data too
    if (Object.keys(full30DayDataByApp.mau).length > 0) {
      Object.keys(full30DayDataByApp.mau).forEach((appId) => {
        const appData = {
          mau: full30DayDataByApp.mau[appId],
          storage: full30DayDataByApp.storage[appId],
          bandwidth: full30DayDataByApp.bandwidth[appId],
        }
        const filteredAppData = filterToBillingPeriod(appData, last30DaysStart, billingStart)
        datasByApp.value.mau[appId] = filteredAppData.data.mau
        datasByApp.value.storage[appId] = filteredAppData.data.storage
        datasByApp.value.bandwidth[appId] = filteredAppData.data.bandwidth
      })
    }
  }
  else {
    // Show all 30 days
    datas.value = full30DayData
  }
}

async function loadData() {
  const startTime = Date.now()
  isLoading.value = true

  await getPlans().then((pls) => {
    plans.value.length = 0
    plans.value.push(...pls)
  })
  await getUsages(true) // Initial load - force fetch

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

watch(dashboard, async (_dashboard) => {
  if (loadedAlready.value) {
    await getUsages(true) // Dashboard data changed, force refetch
  }
  else {
    loadedAlready.value = true
    await loadData()
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

  // Use cached data when billing period mode changes (no refetch needed)
  // The getUsages function will automatically use cache when forceRefetch=false
  if (loadedAlready.value && newBillingPeriod !== oldBillingPeriod && oldBillingPeriod !== null) {
    await getUsages(false) // Use cache
  }

  // Update URL parameters
  updateUrlParams()
})

// Watch for URL parameter changes (e.g., browser back/forward)
watch(() => route.query, (newQuery) => {
  const newCumulative = newQuery.cumulative === 'true' // daily is default
  const newBillingPeriod = newQuery.billingPeriod !== 'false'

  if (showCumulative.value !== newCumulative) {
    showCumulative.value = newCumulative
  }
  if (useBillingPeriod.value !== newBillingPeriod) {
    useBillingPeriod.value = newBillingPeriod
  }
}, { deep: true })

onMounted(() => {
  if (main.dashboardFetched) {
    loadData()
  }
})
</script>

<template>
  <!-- View Mode Selectors -->
  <div v-if="!noData" class="mb-4">
    <div class="flex flex-nowrap items-center justify-end gap-2 sm:gap-4">
      <!-- Daily vs Cumulative Switch -->
      <div class="flex items-center space-x-1 bg-gray-200 dark:bg-gray-800 rounded-lg p-1">
        <button
          class="px-2 sm:px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap text-center flex items-center justify-center gap-0.5 sm:gap-1.5 cursor-pointer"
          :class="[!showCumulative || !useBillingPeriod ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white']"
          :aria-label="t('daily')"
          @click="showCumulative = false"
        >
          <CalendarDaysIcon class="h-4 w-4" />
          <span class="hidden sm:inline">{{ t('daily') }}</span>
        </button>
        <button
          class="px-2 sm:px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap text-center flex items-center justify-center gap-0.5 sm:gap-1.5 cursor-pointer"
          :class="[
            showCumulative && useBillingPeriod
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white',
          ]"
          :aria-label="t('cumulative')"
          @click="handleCumulativeClick"
        >
          <ChartBarIcon class="h-4 w-4" />
          <span class="hidden sm:inline">{{ t('cumulative') }}</span>
        </button>
      </div>

      <!-- Billing Period vs Last 30 Days Switch -->
      <div class="flex items-center space-x-1 bg-gray-200 dark:bg-gray-800 rounded-lg p-1">
        <button
          class="px-2 sm:px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap text-center flex items-center justify-center gap-0.5 sm:gap-1.5 cursor-pointer" :class="[useBillingPeriod ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white']"
          :aria-label="t('billing-period')"
          @click="useBillingPeriod = true"
        >
          <BanknotesIcon class="h-4 w-4" />
          <span class="hidden sm:inline">{{ t('billing-period') }}</span>
        </button>
        <button
          class="px-2 sm:px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap text-center flex items-center justify-center gap-0.5 sm:gap-1.5 cursor-pointer" :class="[!useBillingPeriod ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white']"
          :aria-label="t('last-30-days')"
          @click="useBillingPeriod = false"
        >
          <CalendarDaysIcon class="h-4 w-4" />
          <span class="hidden sm:inline">{{ t('last-30-days') }}</span>
        </button>
      </div>

      <!-- Reload Button -->
      <button
        type="button"
        class="flex h-8 w-8 items-center justify-center rounded-md bg-white text-gray-700 shadow-sm transition-colors hover:bg-gray-50 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 dark:hover:text-white dark:focus:ring-blue-400 sm:h-9 sm:w-9 cursor-pointer"
        :aria-label="t('reload')"
        @click="reloadAllCharts"
      >
        <ArrowPathIconSolid class="h-4 w-4" />
      </button>

      <!-- Usage Info Tooltip -->
      <div class="relative group flex items-center">
        <button
          type="button"
          class="flex h-8 w-8 items-center justify-center rounded-md bg-white text-gray-700 shadow-sm transition-colors hover:bg-gray-50 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 dark:hover:text-white dark:focus:ring-blue-400 sm:h-9 sm:w-9 cursor-pointer"
          :aria-label="t('info')"
        >
          <InformationInfo class="h-4 w-4" />
        </button>
        <div class="pointer-events-none absolute right-0 top-full z-10 hidden w-[min(320px,calc(100vw-32px))] translate-y-2 rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-800 shadow-2xl group-hover:block group-focus-within:block dark:border-gray-600 dark:bg-gray-800 dark:text-white">
          <div class="space-y-3">
            <div class="flex items-start space-x-2">
              <div class="mt-2 h-2 w-2 shrink-0 rounded-full bg-green-500" />
              <div>
                <div class="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  {{ t('last-run') }}
                </div>
                <div class="text-sm font-medium">
                  {{ lastRunDisplay }}
                </div>
              </div>
            </div>
            <div class="flex items-start space-x-2">
              <div class="mt-2 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
              <div>
                <div class="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  {{ t('next-run') }}
                </div>
                <div class="text-sm font-medium">
                  {{ nextRunDisplay }}
                </div>
              </div>
            </div>
            <div class="border-t border-gray-200 pt-2 dark:border-gray-600">
              <div class="flex items-start space-x-2">
                <div class="mt-2 h-2 w-2 shrink-0 rounded-full bg-purple-500" />
                <div>
                  <div class="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
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

  <div v-if="creditsV2Enabled && !isLoading && creditAvailable" class="mb-6">
    <div class="grid grid-cols-1 sm:grid-cols-12 gap-4">
      <div class="col-span-full sm:col-span-6 xl:col-span-4 bg-white border border-gray-200 rounded-lg p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div class="flex items-start justify-between gap-4">
          <div>
            <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              <BanknotesIcon class="h-4 w-4 text-emerald-500" />
              {{ t('credits-balance') }}
            </div>
            <div class="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
              {{ formatCredits(creditAvailable) }}
            </div>
            <p class="text-sm text-gray-500 dark:text-gray-400">
              {{ t('credits-available') }}
              <span class="font-medium text-gray-900 dark:text-white">/ {{ formatCredits(creditTotal) }}</span>
            </p>
          </div>
          <div v-if="creditNextExpiration" class="text-right">
            <div class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {{ t('credits-next-expiration') }}
            </div>
            <div class="mt-1 text-sm font-medium text-gray-900 dark:text-white">
              {{ creditNextExpiration }}
            </div>
          </div>
        </div>
        <div class="mt-4">
          <div class="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
            <span>{{ t('credits-used-in-period') }}</span>
            <span class="font-medium text-gray-900 dark:text-white">
              {{ formatCredits(creditUsed) }}
            </span>
          </div>
          <div class="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
            <div
              class="h-full rounded-full bg-emerald-500 transition-all"
              :style="{ width: `${creditUsagePercent}%` }"
            />
          </div>
        </div>
        <p v-if="!hasCreditSummary" class="mt-4 text-sm text-gray-500 dark:text-gray-400">
          {{ t('no-credits-available') }}
        </p>
      </div>
    </div>
  </div>

  <div
    v-if="!noData || isLoading"
    class="grid grid-cols-1 sm:grid-cols-12 gap-6 mb-6"
    :class="appId ? 'xl:grid-cols-16' : 'xl:grid-cols-12'"
  >
    <UsageCard
      id="mau-stat" :limits="allLimits.mau" :colors="colors.emerald" :accumulated="useBillingPeriod && showCumulative"
      :datas="mauData" :datas-by-app="mauDataByApp" :app-names="appNames" :title="`${t('monthly-active')}`" :unit="t('units-users')"
      :use-billing-period="useBillingPeriod"
      :is-loading="isLoading"
      class="col-span-full sm:col-span-6 xl:col-span-4"
    />
    <UsageCard
      :limits="allLimits.storage" :colors="colors.blue" :datas="storageData" :datas-by-app="storageDataByApp" :app-names="appNames" :accumulated="useBillingPeriod && showCumulative"
      :title="t('Storage')" :unit="storageUnit"
      :use-billing-period="useBillingPeriod"
      :is-loading="isLoading"
      class="col-span-full sm:col-span-6 xl:col-span-4"
    />
    <UsageCard
      :limits="allLimits.bandwidth" :colors="colors.orange" :datas="bandwidthData" :datas-by-app="bandwidthDataByApp" :app-names="appNames" :accumulated="useBillingPeriod && showCumulative"
      :title="t('Bandwidth')" :unit="t('units-gb')"
      :use-billing-period="useBillingPeriod"
      :is-loading="isLoading"
      class="col-span-full sm:col-span-6 xl:col-span-4"
    />
    <DevicesStats v-show="appId" :use-billing-period="useBillingPeriod" :accumulated="useBillingPeriod && showCumulative" :reload-trigger="reloadTrigger" class="col-span-full sm:col-span-6 xl:col-span-4" />
    <BundleUploadsCard v-show="!appId" :use-billing-period="useBillingPeriod" :accumulated="useBillingPeriod && showCumulative" :reload-trigger="reloadTrigger" class="col-span-full sm:col-span-6 xl:col-span-4" />
    <UpdateStatsCard v-show="!appId" :use-billing-period="useBillingPeriod" :accumulated="useBillingPeriod && showCumulative" :reload-trigger="reloadTrigger" class="col-span-full sm:col-span-6 xl:col-span-4" />
    <DeploymentStatsCard v-show="!appId" :use-billing-period="useBillingPeriod" :accumulated="useBillingPeriod && showCumulative" :reload-trigger="reloadTrigger" class="col-span-full sm:col-span-6 xl:col-span-4" />
  </div>
</template>
