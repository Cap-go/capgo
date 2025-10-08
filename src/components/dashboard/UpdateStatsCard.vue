<script setup lang="ts">
import colors from 'tailwindcss/colors'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ArrowDownOnSquareIcon from '~icons/heroicons/arrow-down-on-square'
import GlobeAltIcon from '~icons/heroicons/globe-alt'
import XCircleIcon from '~icons/heroicons/x-circle'
import UpdateStatsChart from '~/components/dashboard/UpdateStatsChart.vue'
import { useSupabase } from '~/services/supabase'
import { useDashboardAppsStore } from '~/stores/dashboardApps'
import { useOrganizationStore } from '~/stores/organization'
import { createUndefinedArray, incrementArrayValue } from '~/utils/chartOptimizations'

const props = defineProps({
  useBillingPeriod: {
    type: Boolean,
    default: true,
  },
  accumulated: {
    type: Boolean,
    default: false,
  },
})

// Helper function to filter 30-day data to billing period
function filterToBillingPeriod(fullData: (number | undefined)[], last30DaysStart: Date, billingStart: Date) {
  const currentDate = new Date()

  // Calculate billing period length
  let currentBillingDay: number

  if (billingStart.getDate() === 1) {
    currentBillingDay = currentDate.getDate()
  }
  else {
    const billingStartDay = billingStart.getUTCDate()
    const daysInMonth = new Date(Date.UTC(currentDate.getUTCFullYear(), currentDate.getUTCMonth() + 1, 0)).getUTCDate()
    currentBillingDay = (currentDate.getUTCDate() - billingStartDay + 1 + daysInMonth) % daysInMonth
    if (currentBillingDay === 0)
      currentBillingDay = daysInMonth
  }

  // Create arrays for billing period length
  const billingData = Array.from({ length: currentBillingDay }).fill(undefined) as (number | undefined)[]

  // Map 30-day data to billing period
  for (let i = 0; i < 30; i++) {
    const dataDate = new Date(last30DaysStart)
    dataDate.setDate(dataDate.getDate() + i)

    // Check if this date falls within current billing period
    if (dataDate >= billingStart && dataDate <= currentDate) {
      const billingIndex = Math.floor((dataDate.getTime() - billingStart.getTime()) / (1000 * 60 * 60 * 24))
      if (billingIndex >= 0 && billingIndex < currentBillingDay) {
        billingData[billingIndex] = fullData[i]
      }
    }
  }

  return { data: billingData }
}

const { t } = useI18n()
const organizationStore = useOrganizationStore()

const totalInstalled = ref(0)
const totalFailed = ref(0)
const totalRequested = ref(0)
const lastDayEvolution = ref(0)
const updateData = ref<(number | undefined)[]>([])
const updateDataByApp = ref<{ [appId: string]: (number | undefined)[] }>({})
const updateDataByAction = ref<{ [action: string]: (number | undefined)[] }>({})
const appNames = ref<{ [appId: string]: string }>({})
const isLoading = ref(true)

const dashboardAppsStore = useDashboardAppsStore()

// Convert undefined values to 0 for chart consumption
function capitalize(text: string) {
  if (!text)
    return ''
  return text.charAt(0).toUpperCase() + text.slice(1)
}

const chartUpdateData = computed(() => updateData.value.map(v => v ?? 0))
const chartUpdateDataByAction = computed(() => {
  const result: { [action: string]: number[] } = {}
  Object.keys(updateDataByAction.value).forEach((action) => {
    result[action] = updateDataByAction.value[action].map(v => v ?? 0)
  })
  return result
})
const actionDisplayNames = computed(() => ({
  requested: capitalize(t('get')),
  install: capitalize(t('installed')),
  fail: capitalize(t('failed')),
}))

async function calculateStats() {
  isLoading.value = true
  totalInstalled.value = 0
  totalFailed.value = 0
  totalRequested.value = 0

  // Reset data
  updateDataByApp.value = {}
  updateDataByAction.value = {}
  appNames.value = {}
  updateData.value = []

  // Always work with last 30 days of data
  const last30DaysEnd = new Date()
  const last30DaysStart = new Date()
  last30DaysStart.setDate(last30DaysStart.getDate() - 29) // 30 days including today
  last30DaysStart.setHours(0, 0, 0, 0)
  last30DaysEnd.setHours(23, 59, 59, 999)

  // Get billing period dates for filtering
  const billingStart = new Date(organizationStore.currentOrganization?.subscription_start ?? new Date())
  billingStart.setHours(0, 0, 0, 0)

  // Initialize arrays for 30 days
  const dailyCounts = createUndefinedArray(30) as (number | undefined)[]

  // Initialize action-specific data arrays for 30 days
  updateDataByAction.value = {
    install: createUndefinedArray(30) as (number | undefined)[],
    fail: createUndefinedArray(30) as (number | undefined)[],
    requested: createUndefinedArray(30) as (number | undefined)[],
  }

  const startDate = last30DaysStart.toISOString().split('T')[0]
  const endDate = last30DaysEnd.toISOString().split('T')[0]

  try {
    // Use store for shared apps data to avoid redundant queries
    await dashboardAppsStore.fetchApps()
    appNames.value = dashboardAppsStore.appNames

    if (dashboardAppsStore.appIds.length === 0) {
      updateData.value = dailyCounts
      isLoading.value = false
      return
    }

    // Initialize app data arrays for 30 days
    dashboardAppsStore.appIds.forEach((appId) => {
      updateDataByApp.value[appId] = createUndefinedArray(30) as (number | undefined)[]
    })

    // Get update stats from daily_version table for last 30 days
    const { data } = await useSupabase()
      .from('daily_version')
      .select('date, app_id, install, fail, get')
      .in('app_id', dashboardAppsStore.appIds)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date')

    if (data && data.length > 0) {
      // Process each stat entry for 30-day period
      data.forEach((stat: any) => {
        if (stat.date) {
          const statDate = new Date(stat.date)

          // Calculate days since start of 30-day period
          const daysDiff = Math.floor((statDate.getTime() - last30DaysStart.getTime()) / (1000 * 60 * 60 * 24))

          if (daysDiff >= 0 && daysDiff < 30) {
            const installedCount = stat.install || 0
            const failedCount = stat.fail || 0
            const requestedCount = stat.get || 0
            const totalForDay = installedCount + failedCount + requestedCount

            // Increment arrays for 30-day data
            incrementArrayValue(dailyCounts, daysDiff, totalForDay)

            totalInstalled.value += installedCount
            totalFailed.value += failedCount
            totalRequested.value += requestedCount

            // Track by action type for dashboard view
            incrementArrayValue(updateDataByAction.value.install, daysDiff, installedCount)
            incrementArrayValue(updateDataByAction.value.fail, daysDiff, failedCount)
            incrementArrayValue(updateDataByAction.value.requested, daysDiff, requestedCount)

            // Also track by app (using total for simplicity in bar chart)
            if (updateDataByApp.value[stat.app_id]) {
              incrementArrayValue(updateDataByApp.value[stat.app_id], daysDiff, totalForDay)
            }
          }
        }
      })

      // Filter data based on billing period mode
      if (props.useBillingPeriod) {
        // Show only data within billing period
        const filteredData = filterToBillingPeriod(dailyCounts, last30DaysStart, billingStart)
        updateData.value = filteredData.data

        // Filter by-action data too
        Object.keys(updateDataByAction.value).forEach((action) => {
          const filteredActionData = filterToBillingPeriod(updateDataByAction.value[action], last30DaysStart, billingStart)
          updateDataByAction.value[action] = filteredActionData.data
        })

        // Filter by-app data too
        Object.keys(updateDataByApp.value).forEach((appId) => {
          const filteredAppData = filterToBillingPeriod(updateDataByApp.value[appId], last30DaysStart, billingStart)
          updateDataByApp.value[appId] = filteredAppData.data
        })

        // Recalculate totals for billing period only
        totalInstalled.value = 0
        totalFailed.value = 0
        totalRequested.value = 0

        const installData = updateDataByAction.value.install
        const failData = updateDataByAction.value.fail
        const requestedData = updateDataByAction.value.requested

        installData.forEach(count => totalInstalled.value += count || 0)
        failData.forEach(count => totalFailed.value += count || 0)
        requestedData.forEach(count => totalRequested.value += count || 0)
      }
      else {
        // Show all 30 days
        updateData.value = dailyCounts
      }

      // Calculate evolution (compare last two days with data)
      const nonZeroDays = updateData.value.filter(count => (count || 0) > 0)
      if (nonZeroDays.length >= 2) {
        const lastDayCount = nonZeroDays[nonZeroDays.length - 1] || 0
        const previousDayCount = nonZeroDays[nonZeroDays.length - 2] || 0
        if (previousDayCount > 0) {
          lastDayEvolution.value = ((lastDayCount - previousDayCount) / previousDayCount) * 100
        }
      }
    }
    else {
      updateData.value = dailyCounts
    }
  }
  catch (error) {
    console.error('Error fetching update stats:', error)
    updateData.value = dailyCounts
  }
  finally {
    isLoading.value = false
  }
}

// Watch for billing period mode changes and recalculate
watch(() => props.useBillingPeriod, async () => {
  await calculateStats()
})

// Watch for accumulated mode changes and recalculate
watch(() => props.accumulated, async () => {
  await calculateStats()
})

onMounted(async () => {
  await calculateStats()
})
</script>

<template>
  <div class="flex flex-col bg-white border rounded-lg shadow-lg col-span-full border-slate-300 sm:col-span-6 xl:col-span-4 dark:border-slate-900 dark:bg-gray-800 h-[460px]">
    <div class="pt-4 px-4 flex items-start justify-between gap-2">
      <div class="flex flex-col items-start justify-between gap-2">
        <h2 class="flex-1 min-w-0 text-2xl font-semibold leading-tight text text-slate-600 dark:text-white">
          {{ t('update_statistics') }}
        </h2>
        <div class="flex flex-wrap items-center gap-3 sm:flex-nowrap sm:gap-4">
          <div class="flex items-center gap-2">
            <div class="w-3 h-3 rounded-full" style="background-color: hsl(210, 65%, 55%)" />
            <div
              class="flex items-center gap-1 text-sm text-slate-600 dark:text-slate-300"
              :aria-label="`${actionDisplayNames.requested}: ${totalRequested.toLocaleString()}`"
            >
              <GlobeAltIcon class="h-4 w-4" aria-hidden="true" />
              <span>{{ totalRequested.toLocaleString() }}</span>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <div class="w-3 h-3 rounded-full" style="background-color: hsl(135, 55%, 50%)" />
            <div
              class="flex items-center gap-1 text-sm text-slate-600 dark:text-slate-300"
              :aria-label="`${actionDisplayNames.install}: ${totalInstalled.toLocaleString()}`"
            >
              <ArrowDownOnSquareIcon class="h-4 w-4" aria-hidden="true" />
              <span>{{ totalInstalled.toLocaleString() }}</span>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <div class="w-3 h-3 rounded-full" style="background-color: hsl(0, 50%, 60%)" />
            <div
              class="flex items-center gap-1 text-sm text-slate-600 dark:text-slate-300"
              :aria-label="`${actionDisplayNames.fail}: ${totalFailed.toLocaleString()}`"
            >
              <XCircleIcon class="h-4 w-4" aria-hidden="true" />
              <span>{{ totalFailed.toLocaleString() }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="flex flex-col items-end text-right flex-shrink-0">
        <div
          v-if="lastDayEvolution"
          class="inline-flex items-center justify-center rounded-full px-2 py-1 text-xs font-bold text-white shadow-lg whitespace-nowrap"
          :class="{ 'bg-emerald-500': lastDayEvolution >= 0, 'bg-yellow-500': lastDayEvolution < 0 }"
        >
          {{ lastDayEvolution < 0 ? '-' : '+' }}{{ Math.abs(lastDayEvolution).toFixed(2) }}%
        </div>
        <div v-else class="inline-flex rounded-full px-2 py-1 text-xs font-semibold opacity-0" aria-hidden="true" />
        <div class="text-3xl font-bold text-slate-600 dark:text-white">
          {{ (totalInstalled + totalFailed + totalRequested).toLocaleString() }}
        </div>
      </div>
    </div>
    <!-- Chart built with Chart.js 3 -->

    <!-- Change the height attribute to adjust the chart height -->
    <div class="w-full h-full p-6 pt-2">
      <div v-if="isLoading" class="flex items-center justify-center h-full">
        <div class="loading loading-spinner loading-lg text-blue-500" />
      </div>
      <UpdateStatsChart
        v-else-if="chartUpdateData?.length"
        :key="JSON.stringify(chartUpdateDataByAction)"
        :title="t('update_statistics')"
        :colors="colors.blue"
        :data="chartUpdateData"
        :use-billing-period="useBillingPeriod"
        :accumulated="accumulated"
        :data-by-app="chartUpdateDataByAction"
        :app-names="actionDisplayNames"
      />
      <div v-else class="flex flex-col items-center justify-center h-full">
        {{ t('no-data') }}
      </div>
    </div>
  </div>
</template>
