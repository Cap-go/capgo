<script setup lang="ts">
import dayjs from 'dayjs'
import colors from 'tailwindcss/colors'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import InformationInfo from '~icons/heroicons/information-circle'
import UpdateStatsChart from '~/components/UpdateStatsChart.vue'
import { useSupabase } from '~/services/supabase'
import { useDashboardAppsStore } from '~/stores/dashboardApps'
import { useMainStore } from '~/stores/main'
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
const main = useMainStore()
const organizationStore = useOrganizationStore()
const subscription_anchor_start = dayjs(organizationStore.currentOrganization?.subscription_start).format('YYYY/MM/D')
const subscription_anchor_end = dayjs(organizationStore.currentOrganization?.subscription_end).format('YYYY/MM/D')

const totalInstalled = ref(0)
const totalFailed = ref(0)
const totalGet = ref(0)
const lastDayEvolution = ref(0)
const updateData = ref<(number | undefined)[]>([])
const updateDataByApp = ref<{ [appId: string]: (number | undefined)[] }>({})
const updateDataByAction = ref<{ [action: string]: (number | undefined)[] }>({})
const appNames = ref<{ [appId: string]: string }>({})
const isLoading = ref(true)

const dashboardAppsStore = useDashboardAppsStore()

// Convert undefined values to 0 for chart consumption
const chartUpdateData = computed(() => updateData.value.map(v => v ?? 0))
const chartUpdateDataByAction = computed(() => {
  const result: { [action: string]: number[] } = {}
  Object.keys(updateDataByAction.value).forEach((action) => {
    result[action] = updateDataByAction.value[action].map(v => v ?? 0)
  })
  return result
})

async function calculateStats() {
  isLoading.value = true
  totalInstalled.value = 0
  totalFailed.value = 0
  totalGet.value = 0

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
    get: createUndefinedArray(30) as (number | undefined)[],
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
            const getCount = stat.get || 0
            const totalForDay = installedCount + failedCount + getCount

            // Increment arrays for 30-day data
            incrementArrayValue(dailyCounts, daysDiff, totalForDay)

            totalInstalled.value += installedCount
            totalFailed.value += failedCount
            totalGet.value += getCount

            // Track by action type for dashboard view
            incrementArrayValue(updateDataByAction.value.install, daysDiff, installedCount)
            incrementArrayValue(updateDataByAction.value.fail, daysDiff, failedCount)
            incrementArrayValue(updateDataByAction.value.get, daysDiff, getCount)

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
        totalGet.value = 0

        const installData = updateDataByAction.value.install
        const failData = updateDataByAction.value.fail
        const getData = updateDataByAction.value.get

        installData.forEach(count => totalInstalled.value += count || 0)
        failData.forEach(count => totalFailed.value += count || 0)
        getData.forEach(count => totalGet.value += count || 0)
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
    <div class="px-5 pt-3">
      <div class="flex flex-row items-center">
        <h2 class="mb-2 mr-2 text-2xl font-semibold text-slate-800 dark:text-white">
          {{ t('update_statistics') }}
        </h2>
        <div class="d-tooltip d-tooltip-bottom">
          <div class="d-tooltip-content bg-white dark:bg-gray-800 text-gray-800 dark:text-white border border-gray-200 dark:border-gray-600 shadow-2xl rounded-lg p-4 min-w-[280px]">
            <div class="space-y-3">
              <!-- Last Run -->
              <div class="flex items-start space-x-2">
                <div class="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0" />
                <div>
                  <div class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    {{ t('last-run') }}
                  </div>
                  <div class="text-sm font-medium">
                    {{ dayjs(main.statsTime.last_run).format('MMMM D, YYYY HH:mm') }}
                  </div>
                </div>
              </div>

              <!-- Next Run -->
              <div class="flex items-start space-x-2">
                <div class="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0" />
                <div>
                  <div class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    {{ t('next-run') }}
                  </div>
                  <div class="text-sm font-medium">
                    {{ dayjs(main.statsTime.next_run).format('MMMM D, YYYY HH:mm') }}
                  </div>
                </div>
              </div>

              <!-- Billing Cycle -->
              <div class="pt-2 border-t border-gray-200 dark:border-gray-600">
                <div class="flex items-start space-x-2">
                  <div class="w-2 h-2 bg-purple-500 rounded-full mt-2 flex-shrink-0" />
                  <div>
                    <div class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      {{ t('billing-cycle') }}
                    </div>
                    <div class="text-sm font-medium">
                      {{ subscription_anchor_start }} {{ t('to') }} {{ subscription_anchor_end }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="flex items-center justify-center w-5 h-5 cursor-pointer">
            <InformationInfo class="text-gray-400 hover:text-blue-500 transition-colors duration-200" />
          </div>
        </div>
      </div>

      <div class="mb-1 text-xs font-semibold uppercase text-slate-400 dark:text-white">
        {{ t('usage-title') }}
      </div>
      <div class="flex flex-col space-y-1">
        <div class="flex items-center space-x-4">
          <div class="flex items-center space-x-2">
            <div class="w-3 h-3 rounded-full" style="background-color: hsl(210, 50%, 60%)" />
            <span class="text-sm text-slate-600 dark:text-slate-300">{{ t('installed') }}: {{ totalInstalled.toLocaleString() }}</span>
          </div>
          <div class="flex items-center space-x-2">
            <div class="w-3 h-3 rounded-full" style="background-color: hsl(0, 50%, 60%)" />
            <span class="text-sm text-slate-600 dark:text-slate-300">{{ t('failed') }}: {{ totalFailed.toLocaleString() }}</span>
          </div>
          <div class="flex items-center space-x-2">
            <div class="w-3 h-3 rounded-full" style="background-color: hsl(120, 50%, 60%)" />
            <span class="text-sm text-slate-600 dark:text-slate-300">{{ t('get') }}: {{ totalGet.toLocaleString() }}</span>
          </div>
        </div>
        <div class="flex items-start">
          <div id="total_update_val" class="mr-2 text-3xl font-bold text-slate-800 dark:text-white">
            {{ (totalInstalled + totalFailed + totalGet).toLocaleString() }}
          </div>
          <div v-if="lastDayEvolution" class="rounded-full bg-emerald-500 px-1.5 text-sm font-semibold text-white">
            {{ lastDayEvolution < 0 ? '-' : '+' }}{{ Math.abs(lastDayEvolution).toFixed(2) }}%
          </div>
        </div>
      </div>
    </div>
    <!-- Chart built with Chart.js 3 -->

    <!-- Change the height attribute to adjust the chart height -->
    <div class="w-full h-full p-6">
      <div v-if="isLoading" class="flex items-center justify-center h-full">
        <div class="loading loading-spinner loading-lg text-blue-500" />
      </div>
      <UpdateStatsChart
        v-else
        :key="JSON.stringify(chartUpdateDataByAction)"
        :title="t('update_statistics')"
        :colors="colors.blue"
        :data="chartUpdateData"
        :use-billing-period="useBillingPeriod"
        :accumulated="accumulated"
        :data-by-app="chartUpdateDataByAction"
        :app-names="{ install: 'Installed', fail: 'Failed', get: 'Get' }"
      />
    </div>
  </div>
</template>
