<script setup lang="ts">
import type { Database } from '~/types/supabase.types'
import dayjs from 'dayjs'
import { storeToRefs } from 'pinia'
import colors from 'tailwindcss/colors'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import ArrowPathIcon from '~icons/heroicons/arrow-path'
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

  // Update URL without triggering navigation
  router.replace({ query })
}

// Function to clear dashboard-specific query parameters
function clearDashboardParams() {
  const query = { ...route.query }
  delete query.cumulative
  delete query.billingPeriod
  router.replace({ query })
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
  await dashboardAppsStore.fetchApps()

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

async function getUsages() {
  const { global: globalStats, byApp: byAppStats, appNames: appNamesMap } = await getAppStats()

  // Always work with last 30 days of data - normalize first for consistency
  const last30DaysEnd = new Date()
  last30DaysEnd.setHours(0, 0, 0, 0)
  const last30DaysStart = new Date(last30DaysEnd)
  last30DaysStart.setDate(last30DaysStart.getDate() - 29) // 30 days including today

  // Get billing period dates for filtering
  const billingStart = new Date(organizationStore.currentOrganization?.subscription_start ?? new Date())
  // Reset to start of day to match calculation in store
  billingStart.setHours(0, 0, 0, 0)

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
  datas.value.mau = Array.from({ length: 30 }).fill(undefined) as number[]
  datas.value.storage = Array.from({ length: 30 }).fill(undefined) as number[]
  datas.value.bandwidth = Array.from({ length: 30 }).fill(undefined) as number[]

  // Populate with data from last 30 days
  finalData.forEach((item) => {
    const index = getDaysBetweenDates(last30DaysStart, item.date)
    if (index >= 0 && index < 30) {
      datas.value.mau[index] = item.mau
      datas.value.storage[index] = bytesToGb(item.storage ?? 0, 2)
      datas.value.bandwidth[index] = bytesToGb(item.bandwidth ?? 0, 2)
    }
  })

  // Process by-app data if available
  appNames.value = appNamesMap
  datasByApp.value.mau = {}
  datasByApp.value.storage = {}
  datasByApp.value.bandwidth = {}

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
      datasByApp.value.mau[appId] = Array.from({ length: 30 }).fill(undefined) as number[]
      datasByApp.value.storage[appId] = Array.from({ length: 30 }).fill(undefined) as number[]
      datasByApp.value.bandwidth[appId] = Array.from({ length: 30 }).fill(undefined) as number[]

      appGroups[appId].forEach((item) => {
        const index = getDaysBetweenDates(last30DaysStart, item.date)
        if (index >= 0 && index < 30) {
          datasByApp.value.mau[appId][index] = item.mau
          datasByApp.value.storage[appId][index] = bytesToGb(item.storage ?? 0, 2)
          datasByApp.value.bandwidth[appId][index] = bytesToGb(item.bandwidth ?? 0, 2)
        }
      })
    })
  }

  // Filter data based on billing period mode
  if (useBillingPeriod.value) {
    // Show only data within billing period
    const filteredData = filterToBillingPeriod(datas.value, last30DaysStart, billingStart)
    datas.value = filteredData.data

    // Filter by-app data too
    if (Object.keys(datasByApp.value.mau).length > 0) {
      Object.keys(datasByApp.value.mau).forEach((appId) => {
        const appData = {
          mau: datasByApp.value.mau[appId],
          storage: datasByApp.value.storage[appId],
          bandwidth: datasByApp.value.bandwidth[appId],
        }
        const filteredAppData = filterToBillingPeriod(appData, last30DaysStart, billingStart)
        datasByApp.value.mau[appId] = filteredAppData.data.mau
        datasByApp.value.storage[appId] = filteredAppData.data.storage
        datasByApp.value.bandwidth[appId] = filteredAppData.data.bandwidth
      })
    }
  }
}

async function loadData() {
  isLoading.value = true

  await getPlans().then((pls) => {
    plans.value.length = 0
    plans.value.push(...pls)
  })
  await getUsages()
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
    await getUsages()
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

  // Only reload data if billing period changed (this affects the underlying data)
  // Cumulative vs daily changes don't need data reload, just reprocessing
  if (loadedAlready.value && newBillingPeriod !== oldBillingPeriod && oldBillingPeriod !== null) {
    await getUsages()
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
  <div v-if="!noData && !isLoading" class="mb-4">
    <div class="flex flex-nowrap items-center justify-end gap-2 sm:gap-4">
      <!-- Daily vs Cumulative Switch -->
      <div class="flex items-center space-x-1 bg-gray-200 dark:bg-gray-800 rounded-lg p-1">
        <button
          class="px-2 sm:px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap text-center flex items-center justify-center gap-0.5 sm:gap-1.5"
          :class="[!showCumulative || !useBillingPeriod ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white']"
          :aria-label="t('daily')"
          @click="showCumulative = false"
        >
          <CalendarDaysIcon class="h-4 w-4" />
          <span class="hidden sm:inline">{{ t('daily') }}</span>
        </button>
        <button
          class="px-2 sm:px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap text-center flex items-center justify-center gap-0.5 sm:gap-1.5"
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
          class="px-2 sm:px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap text-center flex items-center justify-center gap-0.5 sm:gap-1.5" :class="[useBillingPeriod ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white']"
          :aria-label="t('billing-period')"
          @click="useBillingPeriod = true"
        >
          <BanknotesIcon class="h-4 w-4" />
          <span class="hidden sm:inline">{{ t('billing-period') }}</span>
        </button>
        <button
          class="px-2 sm:px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap text-center flex items-center justify-center gap-0.5 sm:gap-1.5" :class="[!useBillingPeriod ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white']"
          :aria-label="t('last-30-days')"
          @click="useBillingPeriod = false"
        >
          <ArrowPathIcon class="h-4 w-4" />
          <span class="hidden sm:inline">{{ t('last-30-days') }}</span>
        </button>
      </div>

      <!-- Usage Info Tooltip -->
      <div class="relative group flex items-center">
        <button
          type="button"
          class="flex h-8 w-8 items-center justify-center rounded-md bg-white text-gray-700 shadow-sm transition-colors hover:bg-gray-50 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 dark:hover:text-white dark:focus:ring-blue-400 sm:h-9 sm:w-9"
          :aria-label="t('info')"
        >
          <InformationInfo class="h-4 w-4" />
        </button>
        <div class="pointer-events-none absolute right-0 top-full z-10 hidden w-[min(320px,calc(100vw-32px))] translate-y-2 rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-800 shadow-2xl group-hover:block group-focus-within:block dark:border-gray-600 dark:bg-gray-800 dark:text-white">
          <div class="space-y-3">
            <div class="flex items-start space-x-2">
              <div class="mt-2 h-2 w-2 flex-shrink-0 rounded-full bg-green-500" />
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
              <div class="mt-2 h-2 w-2 flex-shrink-0 rounded-full bg-blue-500" />
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
                <div class="mt-2 h-2 w-2 flex-shrink-0 rounded-full bg-purple-500" />
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
    <DevicesStats v-if="appId" :use-billing-period="useBillingPeriod" :accumulated="useBillingPeriod && showCumulative" class="col-span-full sm:col-span-6 xl:col-span-4" />
    <BundleUploadsCard v-if="!appId" :use-billing-period="useBillingPeriod" :accumulated="useBillingPeriod && showCumulative" class="col-span-full sm:col-span-6 xl:col-span-4" />
    <UpdateStatsCard v-if="!appId" :use-billing-period="useBillingPeriod" :accumulated="useBillingPeriod && showCumulative" class="col-span-full sm:col-span-6 xl:col-span-4" />
    <DeploymentStatsCard v-if="!appId" :use-billing-period="useBillingPeriod" :accumulated="useBillingPeriod && showCumulative" class="col-span-full sm:col-span-6 xl:col-span-4" />
  </div>
</template>
