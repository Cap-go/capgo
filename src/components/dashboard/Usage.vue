<script setup lang="ts">
import type { Database } from '~/types/supabase.types'
import { storeToRefs } from 'pinia'
import colors from 'tailwindcss/colors'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { bytesToGb, getDaysBetweenDates } from '~/services/conversion'
import { getPlans } from '~/services/supabase'
import { useDashboardAppsStore } from '~/stores/dashboardApps'
import { useMainStore } from '~/stores/main'
import { useOrganizationStore } from '~/stores/organization'
import { useDialogV2Store } from '~/stores/dialogv2'
import DeploymentStatsCard from './DeploymentStatsCard.vue'
import UpdateStatsCard from './UpdateStatsCard.vue'
import UsageCard from './UsageCard.vue'

const props = defineProps<{
  appId?: string
  showMobileStats?: boolean
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
          role: 'cancel'
        },
        {
          text: t('switch-to-billing-period'),
          role: 'primary',
          handler: () => {
            // Switch to billing period first, then enable cumulative
            useBillingPeriod.value = true
            showCumulative.value = true
          }
        }
      ]
    })
  } else {
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
  } else {
    delete query.cumulative
  }

  if (!useBillingPeriod.value) {
    query.billingPeriod = 'false'
  } else {
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
  showCumulative
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

  // Calculate billing period length
  let currentBillingDay: number

  if (billingStart.getDate() === 1) {
    currentBillingDay = currentDate.getDate()
  } else {
    const billingStartDay = billingStart.getUTCDate()
    const daysInMonth = new Date(Date.UTC(currentDate.getUTCFullYear(), currentDate.getUTCMonth() + 1, 0)).getUTCDate()
    currentBillingDay = (currentDate.getUTCDate() - billingStartDay + 1 + daysInMonth) % daysInMonth
    if (currentBillingDay === 0)
      currentBillingDay = daysInMonth
  }

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

  // Always work with last 30 days of data
  const last30DaysEnd = new Date()
  const last30DaysStart = new Date()
  last30DaysStart.setDate(last30DaysStart.getDate() - 29) // 30 days including today
  last30DaysStart.setHours(0, 0, 0, 0)
  last30DaysEnd.setHours(23, 59, 59, 999)

  // Get billing period dates for filtering
  const billingStart = new Date(organizationStore.currentOrganization?.subscription_start ?? new Date())

  const finalData = globalStats.map((item: any) => {
    return {
      ...item,
      date: new Date(item.date),
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

// Watch for billing period mode changes and force daily mode for Last 30 Days
watch(useBillingPeriod, (newUseBillingPeriod) => {
  // Force daily mode when switching to Last 30 Days (cumulative doesn't make sense)
  if (!newUseBillingPeriod) {
    showCumulative.value = false
  }
})

// Watch view mode changes and refetch data
watch([showCumulative, useBillingPeriod], async () => {
  if (loadedAlready.value) {
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

if (main.dashboardFetched)
  loadData()
</script>

<template>
  <!-- View Mode Selectors -->
  <div v-if="!noData && !isLoading" class="flex justify-end mb-4 space-x-4">
    <!-- Daily vs Cumulative Switch -->
    <div class="flex items-center space-x-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
      <button
        class="px-3 py-1 text-xs font-medium rounded-md transition-colors first-letter:uppercase" :class="[!showCumulative || !useBillingPeriod ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white']"
        @click="showCumulative = false"
      >
        {{ t('daily') }}
      </button>
      <button
        class="px-3 py-1 text-xs font-medium rounded-md transition-colors first-letter:uppercase"
        :class="[
          showCumulative && useBillingPeriod
            ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
        ]"
        @click="handleCumulativeClick"
      >
        {{ t('cumulative') }}
      </button>
    </div>

    <!-- Billing Period vs Last 30 Days Switch -->
    <div class="flex items-center space-x-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
      <button
        class="px-3 py-1 text-xs font-medium rounded-md transition-colors first-letter:uppercase" :class="[useBillingPeriod ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white']"
        @click="useBillingPeriod = true"
      >
        {{ t('billing-period') }}
      </button>
      <button
        class="px-3 py-1 text-xs font-medium rounded-md transition-colors first-letter:uppercase" :class="[!useBillingPeriod ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white']"
        @click="useBillingPeriod = false"
      >
        {{ t('last-30-days') }}
      </button>
    </div>
  </div>

  <div
    v-if="!noData || isLoading"
    class="grid grid-cols-1 sm:grid-cols-12 gap-6 mb-6"
    :class="appId && showMobileStats ? 'xl:grid-cols-16' : 'xl:grid-cols-12'"
  >
    <UsageCard
      v-if="!isLoading" id="mau-stat" :limits="allLimits.mau" :colors="colors.emerald" :accumulated="useBillingPeriod && showCumulative"
      :datas="datas.mau" :datas-by-app="datasByApp.mau" :app-names="appNames" :title="`${t('monthly-active')}`" :unit="t('units-users')"
      :use-billing-period="useBillingPeriod"
      class="col-span-full sm:col-span-6 xl:col-span-4"
    />
    <div
      v-else
      class="col-span-full h-[460px] flex flex-col items-center justify-center border border-slate-300 rounded-lg bg-white shadow-lg sm:col-span-6 xl:col-span-4 dark:border-slate-900 dark:bg-gray-800"
    >
      <Spinner size="w-40 h-40" />
    </div>
    <UsageCard
      v-if="!isLoading" :limits="allLimits.storage" :colors="colors.blue" :datas="datas.storage" :datas-by-app="datasByApp.storage" :app-names="appNames" :accumulated="useBillingPeriod && showCumulative"
      :title="t('Storage')" :unit="storageUnit"
      :use-billing-period="useBillingPeriod"
      class="col-span-full sm:col-span-6 xl:col-span-4"
    />
    <div
      v-else
      class="col-span-full h-[460px] flex flex-col items-center justify-center border border-slate-300 rounded-lg bg-white shadow-lg sm:col-span-6 xl:col-span-4 dark:border-slate-900 dark:bg-gray-800"
    >
      <Spinner size="w-40 h-40" />
    </div>
    <UsageCard
      v-if="!isLoading" :limits="allLimits.bandwidth" :colors="colors.orange" :datas="datas.bandwidth" :datas-by-app="datasByApp.bandwidth" :app-names="appNames" :accumulated="useBillingPeriod && showCumulative"
      :title="t('Bandwidth')" :unit="t('units-gb')"
      :use-billing-period="useBillingPeriod"
      class="col-span-full sm:col-span-6 xl:col-span-4"
    />
    <div
      v-else
      class="col-span-full h-[460px] flex flex-col items-center justify-center border border-slate-300 rounded-lg bg-white shadow-lg sm:col-span-6 xl:col-span-4 dark:border-slate-900 dark:bg-gray-800"
    >
      <Spinner size="w-40 h-40" />
    </div>
    <MobileStats v-if="appId && showMobileStats" :use-billing-period="useBillingPeriod" class="col-span-full sm:col-span-6 xl:col-span-4" />
    <BundleUploadsCard v-if="!isLoading && !appId && chartsLoaded.bundles" :use-billing-period="useBillingPeriod" :accumulated="useBillingPeriod && showCumulative" class="col-span-full sm:col-span-6 xl:col-span-4" />
    <div
      v-else-if="!appId"
      class="col-span-full h-[460px] flex flex-col items-center justify-center border border-slate-300 rounded-lg bg-white shadow-lg sm:col-span-6 xl:col-span-4 dark:border-slate-900 dark:bg-gray-800"
    >
      <Spinner size="w-40 h-40" />
    </div>
    <UpdateStatsCard v-if="!isLoading && !appId && chartsLoaded.updates" :use-billing-period="useBillingPeriod" :accumulated="useBillingPeriod && showCumulative" class="col-span-full sm:col-span-6 xl:col-span-4" />
    <div
      v-else-if="!appId"
      class="col-span-full h-[460px] flex flex-col items-center justify-center border border-slate-300 rounded-lg bg-white shadow-lg sm:col-span-6 xl:col-span-4 dark:border-slate-900 dark:bg-gray-800"
    >
      <Spinner size="w-40 h-40" />
    </div>
    <DeploymentStatsCard v-if="!isLoading && !appId && chartsLoaded.deployments" :use-billing-period="useBillingPeriod" :accumulated="useBillingPeriod && showCumulative" class="col-span-full sm:col-span-6 xl:col-span-4" />
    <div
      v-else-if="!appId"
      class="col-span-full h-[460px] flex flex-col items-center justify-center border border-slate-300 rounded-lg bg-white shadow-lg sm:col-span-6 xl:col-span-4 dark:border-slate-900 dark:bg-gray-800"
    >
      <Spinner size="w-40 h-40" />
    </div>
  </div>
</template>
