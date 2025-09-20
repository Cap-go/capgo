<script setup lang="ts">
import dayjs from 'dayjs'
import colors from 'tailwindcss/colors'
import { onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import InformationInfo from '~icons/heroicons/information-circle'
import BundleUploadsChart from '~/components/BundleUploadsChart.vue'
import { useSupabase } from '~/services/supabase'
import { useDashboardAppsStore } from '~/stores/dashboardApps'
import { useMainStore } from '~/stores/main'
import { useOrganizationStore } from '~/stores/organization'

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
function filterToBillingPeriod(fullData: number[], last30DaysStart: Date, billingStart: Date) {
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
  const billingData = Array.from({ length: currentBillingDay }).fill(0) as number[]

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

const total = ref(0)
const lastDayEvolution = ref(0)
const bundleData = ref<number[]>([])
const bundleDataByApp = ref<{ [appId: string]: number[] }>({})
const appNames = ref<{ [appId: string]: string }>({})

async function calculateStats() {
  total.value = 0

  // Reset data
  bundleDataByApp.value = {}
  appNames.value = {}
  bundleData.value = []

  // Always work with last 30 days of data
  const last30DaysEnd = new Date()
  const last30DaysStart = new Date()
  last30DaysStart.setDate(last30DaysStart.getDate() - 29) // 30 days including today
  last30DaysStart.setHours(0, 0, 0, 0)
  last30DaysEnd.setHours(23, 59, 59, 999)

  // Get billing period dates for filtering
  const billingStart = new Date(organizationStore.currentOrganization?.subscription_start ?? new Date())
  billingStart.setHours(0, 0, 0, 0)

  // Create 30-day arrays
  const dailyCounts30Days = Array.from({ length: 30 }).fill(0) as number[]

  // Use store for shared apps data
  const dashboardAppsStore = useDashboardAppsStore()
  await dashboardAppsStore.fetchApps()
  appNames.value = dashboardAppsStore.appNames

  if (dashboardAppsStore.appIds.length === 0) {
    bundleData.value = dailyCounts30Days
    return
  }

  // Initialize data arrays for each app (30 days)
  dashboardAppsStore.appIds.forEach((appId) => {
    bundleDataByApp.value[appId] = Array.from({ length: 30 }).fill(0) as number[]
  })

  // Always fetch last 30 days of data
  const query = useSupabase()
    .from('app_versions')
    .select('created_at, app_id')
    .gte('created_at', last30DaysStart.toISOString())
    .lte('created_at', last30DaysEnd.toISOString())
    .in('app_id', dashboardAppsStore.appIds)

  const { data, error } = await query

  if (!error && data) {
    // Map each bundle to the correct day and app (30 days)
    data.filter(b => b.created_at !== null && b.app_id !== null)
      .forEach((bundle) => {
        if (bundle.created_at && bundle.app_id) {
          const bundleDate = new Date(bundle.created_at)

          // Calculate days since start of 30-day period
          const daysDiff = Math.floor((bundleDate.getTime() - last30DaysStart.getTime()) / (1000 * 60 * 60 * 24))

          if (daysDiff >= 0 && daysDiff < 30) {
            dailyCounts30Days[daysDiff]++
            total.value++

            // Also track by app
            if (bundleDataByApp.value[bundle.app_id]) {
              bundleDataByApp.value[bundle.app_id][daysDiff]++
            }
          }
        }
      })

    // Filter data based on billing period mode
    if (props.useBillingPeriod) {
      // Show only data within billing period
      const filteredData = filterToBillingPeriod(dailyCounts30Days, last30DaysStart, billingStart)
      bundleData.value = filteredData.data

      // Filter by-app data too
      Object.keys(bundleDataByApp.value).forEach((appId) => {
        const filteredAppData = filterToBillingPeriod(bundleDataByApp.value[appId], last30DaysStart, billingStart)
        bundleDataByApp.value[appId] = filteredAppData.data
      })

      // Recalculate total for billing period only
      total.value = filteredData.data.reduce((sum, count) => sum + count, 0)
    }
    else {
      // Show all 30 days
      bundleData.value = dailyCounts30Days
    }

    // Calculate evolution (compare last two days with data)
    const nonZeroDays = bundleData.value.filter(count => count > 0)
    if (nonZeroDays.length >= 2) {
      const lastDayCount = nonZeroDays[nonZeroDays.length - 1]
      const previousDayCount = nonZeroDays[nonZeroDays.length - 2]
      if (previousDayCount > 0) {
        lastDayEvolution.value = ((lastDayCount - previousDayCount) / previousDayCount) * 100
      }
    }
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
          {{ t('bundle_uploads') }}
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
      <div class="flex items-start">
        <div id="usage_val" class="mr-2 text-3xl font-bold text-slate-800 dark:text-white">
          {{ total?.toLocaleString() }}
        </div>
        <div v-if="lastDayEvolution" class="rounded-full bg-emerald-500 px-1.5 text-sm font-semibold text-white">
          {{ lastDayEvolution < 0 ? '-' : '+' }}{{ Math.abs(lastDayEvolution).toFixed(2) }}%
        </div>
      </div>
    </div>
    <!-- Chart built with Chart.js 3 -->

    <!-- Change the height attribute to adjust the chart height -->
    <div class="w-full h-full p-6">
      <BundleUploadsChart
        :key="JSON.stringify(bundleDataByApp)"
        :title="t('bundle_uploads')"
        :colors="colors.violet"
        :data="bundleData"
        :data-by-app="bundleDataByApp"
        :use-billing-period="useBillingPeriod"
        :accumulated="accumulated"
        :app-names="appNames"
      />
    </div>
  </div>
</template>
