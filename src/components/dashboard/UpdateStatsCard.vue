<script setup lang="ts">
import dayjs from 'dayjs'
import colors from 'tailwindcss/colors'
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import InformationInfo from '~icons/heroicons/information-circle'
import UpdateStatsChart from '~/components/UpdateStatsChart.vue'
import { useSupabase } from '~/services/supabase'
import { useMainStore } from '~/stores/main'
import { useOrganizationStore } from '~/stores/organization'
import { useDashboardAppsStore } from '~/stores/dashboardApps'
import { createUndefinedArray, createDayDiffCalculator, initializeAppDataArrays, aggregateDataByKey, incrementArrayValue } from '~/utils/chartOptimizations'

const { t } = useI18n()
const main = useMainStore()
const organizationStore = useOrganizationStore()
const subscription_anchor_start = dayjs(organizationStore.currentOrganization?.subscription_start).format('YYYY/MM/D')
const subscription_anchor_end = dayjs(organizationStore.currentOrganization?.subscription_end).format('YYYY/MM/D')

const totalInstalled = ref(0)
const totalFailed = ref(0)
const totalGet = ref(0)
const lastDayEvolution = ref(0)
const updateData = ref<number[]>([])
const updateDataByApp = ref<{ [appId: string]: number[] }>({})
const updateDataByAction = ref<{ [action: string]: number[] }>({})
const appNames = ref<{ [appId: string]: string }>({})
const isLoading = ref(true)

function getDayNumbers(startDate: Date, endDate: Date) {
  const dayNumbers = []
  const currentDate = new Date(startDate)
  while (currentDate.getTime() <= endDate.getTime()) {
    dayNumbers.push(currentDate.getDate())
    currentDate.setDate(currentDate.getDate() + 1)
  }
  return dayNumbers
}

const dashboardAppsStore = useDashboardAppsStore()

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

  const cycleStart = new Date(organizationStore.currentOrganization?.subscription_start ?? new Date())
  cycleStart.setHours(0, 0, 0, 0)

  const cycleEnd = new Date(organizationStore.currentOrganization?.subscription_end ?? new Date())
  cycleEnd.setHours(23, 59, 59, 999)

  // Initialize array for the billing period with optimized functions
  const daysInPeriod = getDayNumbers(cycleStart, cycleEnd).length
  const dailyCounts = createUndefinedArray(daysInPeriod) as (number | undefined)[]

  // Initialize action-specific data arrays with optimized functions
  updateDataByAction.value = {
    install: createUndefinedArray(daysInPeriod) as (number | undefined)[],
    fail: createUndefinedArray(daysInPeriod) as (number | undefined)[],
    get: createUndefinedArray(daysInPeriod) as (number | undefined)[],
  }

  const startDate = cycleStart.toISOString().split('T')[0]
  const endDate = cycleEnd.toISOString().split('T')[0]

  try {
    // Use store for shared apps data to avoid redundant queries
    await dashboardAppsStore.fetchApps()
    appNames.value = dashboardAppsStore.appNames

    if (dashboardAppsStore.appIds.length === 0) {
      updateData.value = dailyCounts
      isLoading.value = false
      return
    }

    // Initialize app data arrays efficiently
    updateDataByApp.value = initializeAppDataArrays(dashboardAppsStore.appIds, daysInPeriod, undefined)

    // Get update stats from daily_version table and aggregate by app/date
    const { data } = await useSupabase()
      .from('daily_version')
      .select('date, app_id, install, fail, get')
      .in('app_id', dashboardAppsStore.appIds)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date')

    if (data && data.length > 0) {
      // Optimized aggregation using utility function
      const aggregatedStats = aggregateDataByKey(
        data,
        (item) => `${item.app_id}_${item.date}`,
        ['install', 'fail', 'get']
      )

      // Create optimized day difference calculator
      const calculateDayDiff = createDayDiffCalculator(cycleStart)

      // Process each aggregated stat entry with optimized operations
      const statEntries = Object.values(aggregatedStats)
      for (let i = 0; i < statEntries.length; i++) {
        const stat = statEntries[i] as any
        if (!stat.date) continue

        const daysDiff = calculateDayDiff(stat.date)

        if (daysDiff >= 0 && daysDiff < daysInPeriod) {
          const installedCount = stat.install || 0
          const failedCount = stat.fail || 0
          const getCount = stat.get || 0
          const totalForDay = installedCount + failedCount + getCount

          // Optimized array increments
          incrementArrayValue(dailyCounts, daysDiff, totalForDay)

          totalInstalled.value += installedCount
          totalFailed.value += failedCount
          totalGet.value += getCount

          // Track by action type for dashboard view with optimized increments
          incrementArrayValue(updateDataByAction.value.install, daysDiff, installedCount)
          incrementArrayValue(updateDataByAction.value.fail, daysDiff, failedCount)
          incrementArrayValue(updateDataByAction.value.get, daysDiff, getCount)

          // Also track by app (using total for simplicity in bar chart)
          if (updateDataByApp.value[stat.app_id]) {
            incrementArrayValue(updateDataByApp.value[stat.app_id], daysDiff, totalForDay)
          }
        }
      }

      // Set the data for the chart
      updateData.value = dailyCounts

      // Calculate evolution (compare last two days with data)
      const nonZeroDays = dailyCounts.filter(count => count > 0)
      if (nonZeroDays.length >= 2) {
        const lastDayCount = nonZeroDays[nonZeroDays.length - 1]
        const previousDayCount = nonZeroDays[nonZeroDays.length - 2]
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
        :key="JSON.stringify(updateDataByAction)"
        :title="t('update_statistics')"
        :colors="colors.blue"
        :data="updateData"
        :data-by-app="updateDataByAction"
        :app-names="{ install: 'Installed', fail: 'Failed', get: 'Get' }"
      />
    </div>
  </div>
</template>
