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
import ChartCard from './ChartCard.vue'

const props = defineProps({
  useBillingPeriod: {
    type: Boolean,
    default: true,
  },
  accumulated: {
    type: Boolean,
    default: false,
  },
  appId: {
    type: String,
    default: '',
  },
  reloadTrigger: {
    type: Number,
    default: 0,
  },
})

// Removed filterToBillingPeriod - no longer needed as we work with correct date range from the start

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

// Cache for raw API data
const cachedRawStats = ref<any[] | null>(null)

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

const totalUpdates = computed(() => totalInstalled.value + totalFailed.value + totalRequested.value)
const hasData = computed(() => chartUpdateData.value?.length > 0)

async function calculateStats(forceRefetch = false) {
  const startTime = Date.now()
  isLoading.value = true
  totalInstalled.value = 0
  totalFailed.value = 0
  totalRequested.value = 0

  // Reset data
  updateDataByApp.value = {}
  updateDataByAction.value = {}
  updateData.value = []

  // Determine the date range based on mode
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  let rangeStart: Date
  let rangeEnd: Date

  if (props.useBillingPeriod) {
    // Billing period mode: use the full billing period (start to end)
    rangeStart = new Date(organizationStore.currentOrganization?.subscription_start ?? today)
    rangeStart.setHours(0, 0, 0, 0)
    rangeEnd = new Date(organizationStore.currentOrganization?.subscription_end ?? today)
    rangeEnd.setHours(0, 0, 0, 0)
  }
  else {
    // Last 30 days mode: from 29 days ago to today
    rangeEnd = new Date(today)
    rangeStart = new Date(today)
    rangeStart.setDate(rangeStart.getDate() - 29)
  }

  // Calculate number of days in range
  const dayCount = Math.floor((rangeEnd.getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24)) + 1

  // Initialize arrays for the actual range
  const dailyCounts = createUndefinedArray(dayCount) as (number | undefined)[]

  // Initialize action-specific data arrays
  updateDataByAction.value = {
    install: createUndefinedArray(dayCount) as (number | undefined)[],
    fail: createUndefinedArray(dayCount) as (number | undefined)[],
    requested: createUndefinedArray(dayCount) as (number | undefined)[],
  }

  const startDate = rangeStart.toISOString().split('T')[0]
  const endDate = rangeEnd.toISOString().split('T')[0]

  try {
    // Determine target apps
    const localAppNames: { [appId: string]: string } = {}
    let targetAppIds: string[] = []

    if (props.appId) {
      // Single app mode
      targetAppIds = [props.appId]
      if (!cachedRawStats.value || forceRefetch) {
        try {
          const { data: appRow } = await useSupabase()
            .from('apps')
            .select('name')
            .eq('app_id', props.appId)
            .single()
          localAppNames[props.appId] = appRow?.name ?? props.appId
        }
        catch (error) {
          console.error('Error fetching app name for update stats:', error)
          localAppNames[props.appId] = props.appId
        }
        appNames.value = localAppNames
      }
    }
    else {
      // Multiple apps mode - use store for shared apps data
      // Only fetch apps if not already loaded in store
      if (!dashboardAppsStore.isLoaded) {
        await dashboardAppsStore.fetchApps()
      }

      targetAppIds = [...dashboardAppsStore.appIds]
      appNames.value = dashboardAppsStore.appNames
    }

    if (targetAppIds.length === 0) {
      updateData.value = dailyCounts
      return
    }

    // Initialize app data arrays for the actual range
    targetAppIds.forEach((appId) => {
      updateDataByApp.value[appId] = createUndefinedArray(dayCount) as (number | undefined)[]
    })

    // Use cached data if available and not forcing refetch
    let data
    if (cachedRawStats.value && !forceRefetch) {
      data = cachedRawStats.value
    }
    else {
      // Get update stats from daily_version table for last 30 days
      const result = await useSupabase()
        .from('daily_version')
        .select('date, app_id, install, fail, get')
        .in('app_id', targetAppIds)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date')
      data = result.data
      // Cache the fetched data
      cachedRawStats.value = data
    }

    if (data && data.length > 0) {
      // Process each stat entry
      data.forEach((stat: any) => {
        if (stat.date) {
          const statDate = new Date(stat.date)
          statDate.setHours(0, 0, 0, 0)

          // Calculate days since start of range
          const daysDiff = Math.floor((statDate.getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24))

          if (daysDiff >= 0 && daysDiff < dayCount) {
            const installedCount = stat.install || 0
            const failedCount = stat.fail || 0
            const requestedCount = stat.get || 0
            const totalForDay = installedCount + failedCount + requestedCount

            // Increment arrays
            incrementArrayValue(dailyCounts, daysDiff, totalForDay)

            totalInstalled.value += installedCount
            totalFailed.value += failedCount
            totalRequested.value += requestedCount

            // Track by action type
            incrementArrayValue(updateDataByAction.value.install, daysDiff, installedCount)
            incrementArrayValue(updateDataByAction.value.fail, daysDiff, failedCount)
            incrementArrayValue(updateDataByAction.value.requested, daysDiff, requestedCount)

            // Track by app
            if (updateDataByApp.value[stat.app_id]) {
              incrementArrayValue(updateDataByApp.value[stat.app_id], daysDiff, totalForDay)
            }
          }
        }
      })

      // Set the data (no filtering needed - we already queried the right range)
      updateData.value = dailyCounts

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
    // Ensure spinner shows for at least 300ms for better UX
    const elapsed = Date.now() - startTime
    if (elapsed < 300) {
      await new Promise(resolve => setTimeout(resolve, 300 - elapsed))
    }
    isLoading.value = false
  }
}

// Watch for billing period mode changes - must refetch since date range changes
watch(() => props.useBillingPeriod, async () => {
  cachedRawStats.value = null // Clear cache since we're querying different date range
  await calculateStats(true) // Must refetch for new date range
})

// Watch for accumulated mode changes - use cached data
watch(() => props.accumulated, async () => {
  await calculateStats(false) // Don't refetch, just reprocess cached data
})

// Watch for reload trigger - force refetch
watch(() => props.reloadTrigger, async (newVal) => {
  if (newVal > 0) {
    await calculateStats(true) // Force refetch from API
  }
})

onMounted(async () => {
  await calculateStats(true) // Initial fetch
})
</script>

<template>
  <ChartCard
    :title="t('update_statistics')"
    :total="totalUpdates"
    :last-day-evolution="lastDayEvolution"
    :is-loading="isLoading"
    :has-data="hasData"
  >
    <template #header>
      <div class="flex flex-col gap-2 justify-between items-start">
        <h2 class="flex-1 min-w-0 text-2xl font-semibold leading-tight dark:text-white text text-slate-600">
          {{ t('update_statistics') }}
        </h2>
        <div class="flex flex-wrap gap-3 items-center sm:flex-nowrap sm:gap-4">
          <div class="flex gap-2 items-center">
            <div class="w-3 h-3 rounded-full" style="background-color: hsl(210, 65%, 55%)" />
            <div
              class="flex gap-1 items-center text-sm text-slate-600 dark:text-slate-300"
              :aria-label="`${actionDisplayNames.requested}: ${totalRequested.toLocaleString()}`"
            >
              <GlobeAltIcon class="w-4 h-4" aria-hidden="true" />
              <span>{{ totalRequested.toLocaleString() }}</span>
            </div>
          </div>
          <div class="flex gap-2 items-center">
            <div class="w-3 h-3 rounded-full" style="background-color: hsl(135, 55%, 50%)" />
            <div
              class="flex gap-1 items-center text-sm text-slate-600 dark:text-slate-300"
              :aria-label="`${actionDisplayNames.install}: ${totalInstalled.toLocaleString()}`"
            >
              <ArrowDownOnSquareIcon class="w-4 h-4" aria-hidden="true" />
              <span>{{ totalInstalled.toLocaleString() }}</span>
            </div>
          </div>
          <div class="flex gap-2 items-center">
            <div class="w-3 h-3 rounded-full" style="background-color: hsl(0, 50%, 60%)" />
            <div
              class="flex gap-1 items-center text-sm text-slate-600 dark:text-slate-300"
              :aria-label="`${actionDisplayNames.fail}: ${totalFailed.toLocaleString()}`"
            >
              <XCircleIcon class="w-4 h-4" aria-hidden="true" />
              <span>{{ totalFailed.toLocaleString() }}</span>
            </div>
          </div>
        </div>
      </div>
    </template>

    <UpdateStatsChart
      :key="JSON.stringify(chartUpdateDataByAction)"
      :title="t('update_statistics')"
      :colors="colors.blue"
      :data="chartUpdateData"
      :use-billing-period="useBillingPeriod"
      :accumulated="accumulated"
      :data-by-app="chartUpdateDataByAction"
      :app-names="actionDisplayNames"
    />
  </ChartCard>
</template>
