<script setup lang="ts">
import colors from 'tailwindcss/colors'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ArrowDownOnSquareIcon from '~icons/heroicons/arrow-down-on-square'
import GlobeAltIcon from '~icons/heroicons/globe-alt'
import XCircleIcon from '~icons/heroicons/x-circle'
import UpdateStatsChart from '~/components/dashboard/UpdateStatsChart.vue'
import { calculateDemoEvolution, calculateDemoTotal, generateDemoUpdateStatsData } from '~/services/demoChartData'
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
  forceDemo: {
    type: Boolean,
    default: false,
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

// Per-org cache for raw API data, keyed by "orgId:billingMode"
const cacheByOrgAndMode = new Map<string, any[]>()
// Track current org for change detection
const currentCacheOrgId = ref<string | null>(null)

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

// Generate demo data when forceDemo is true
const demoStats = computed(() => generateDemoUpdateStatsData(30))

// Demo mode is ONLY enabled when forceDemo is true (payment failed)
// Never auto-show demo data based on empty data - users with apps should see real (even if empty) data
const isDemoMode = computed(() => props.forceDemo === true)

// Effective values for display
const effectiveChartData = computed(() => isDemoMode.value ? demoStats.value.total : chartUpdateData.value)
const effectiveChartDataByAction = computed(() => {
  if (isDemoMode.value) {
    return {
      requested: demoStats.value.byAction.requested,
      install: demoStats.value.byAction.install,
      fail: demoStats.value.byAction.fail,
    }
  }
  return chartUpdateDataByAction.value
})
const effectiveTotalInstalled = computed(() => isDemoMode.value ? calculateDemoTotal(demoStats.value.byAction.install) : totalInstalled.value)
const effectiveTotalFailed = computed(() => isDemoMode.value ? calculateDemoTotal(demoStats.value.byAction.fail) : totalFailed.value)
const effectiveTotalRequested = computed(() => isDemoMode.value ? calculateDemoTotal(demoStats.value.byAction.requested) : totalRequested.value)
const effectiveTotalUpdates = computed(() => effectiveTotalInstalled.value + effectiveTotalFailed.value + effectiveTotalRequested.value)
const effectiveLastDayEvolution = computed(() => isDemoMode.value ? calculateDemoEvolution(demoStats.value.total) : lastDayEvolution.value)

const hasData = computed(() => effectiveChartData.value?.length > 0)

async function calculateStats(forceRefetch = false) {
  const startTime = Date.now()
  isLoading.value = true

  // Reset display data
  totalInstalled.value = 0
  totalFailed.value = 0
  totalRequested.value = 0
  lastDayEvolution.value = 0
  updateDataByApp.value = {}
  updateDataByAction.value = {}
  updateData.value = []

  const currentOrgId = organizationStore.currentOrganization?.gid ?? null
  const orgChanged = currentCacheOrgId.value !== currentOrgId
  currentCacheOrgId.value = currentOrgId

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

  const startDate = rangeStart.toISOString().split('T')[0]
  const endDate = rangeEnd.toISOString().split('T')[0]

  // Cache key includes org and billing mode since date range differs
  const cacheKey = `${currentOrgId}:${props.useBillingPeriod ? 'billing' : '30days'}`

  try {
    // Determine target apps
    const localAppNames: { [appId: string]: string } = {}
    let targetAppIds: string[] = []

    if (props.appId) {
      // Single app mode
      targetAppIds = [props.appId]
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
    else {
      // Multiple apps mode - use store for shared apps data
      await dashboardAppsStore.fetchApps(orgChanged)

      targetAppIds = [...dashboardAppsStore.appIds]
      appNames.value = dashboardAppsStore.appNames
    }

    if (targetAppIds.length === 0) {
      updateData.value = createUndefinedArray(dayCount) as (number | undefined)[]
      updateDataByApp.value = {}
      return
    }

    // Check per-org cache - only use if not forcing refetch
    let data: any[] | null = null
    const cachedData = cacheByOrgAndMode.get(cacheKey)

    if (cachedData && !forceRefetch) {
      data = cachedData
    }
    else {
      // Get update stats from daily_version table
      const result = await useSupabase()
        .from('daily_version')
        .select('date, app_id, install, fail, get')
        .in('app_id', targetAppIds)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date')
      data = result.data

      // Store in per-org cache
      if (data) {
        cacheByOrgAndMode.set(cacheKey, data)
      }
    }

    // Create fresh arrays for processing
    const dailyCounts = createUndefinedArray(dayCount) as (number | undefined)[]
    const actionData = {
      install: createUndefinedArray(dayCount) as (number | undefined)[],
      fail: createUndefinedArray(dayCount) as (number | undefined)[],
      requested: createUndefinedArray(dayCount) as (number | undefined)[],
    }
    const appData: { [appId: string]: (number | undefined)[] } = {}
    targetAppIds.forEach((appId) => {
      appData[appId] = createUndefinedArray(dayCount) as (number | undefined)[]
    })

    // Track totals separately
    let installedTotal = 0
    let failedTotal = 0
    let requestedTotal = 0

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

            installedTotal += installedCount
            failedTotal += failedCount
            requestedTotal += requestedCount

            // Track by action type
            incrementArrayValue(actionData.install, daysDiff, installedCount)
            incrementArrayValue(actionData.fail, daysDiff, failedCount)
            incrementArrayValue(actionData.requested, daysDiff, requestedCount)

            // Track by app
            if (appData[stat.app_id]) {
              incrementArrayValue(appData[stat.app_id], daysDiff, totalForDay)
            }
          }
        }
      })

      // Calculate evolution (compare last two days with data)
      const nonZeroDays = dailyCounts.filter(count => (count || 0) > 0)
      if (nonZeroDays.length >= 2) {
        const lastDayCount = nonZeroDays[nonZeroDays.length - 1] || 0
        const previousDayCount = nonZeroDays[nonZeroDays.length - 2] || 0
        if (previousDayCount > 0) {
          lastDayEvolution.value = ((lastDayCount - previousDayCount) / previousDayCount) * 100
        }
      }
    }

    // Set all display values at once
    updateData.value = dailyCounts
    updateDataByAction.value = actionData
    updateDataByApp.value = appData
    totalInstalled.value = installedTotal
    totalFailed.value = failedTotal
    totalRequested.value = requestedTotal
  }
  catch (error) {
    console.error('Error fetching update stats:', error)
    updateData.value = createUndefinedArray(dayCount) as (number | undefined)[]
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

// Watch for organization changes - use per-org cache (no need to force refetch)
watch(() => organizationStore.currentOrganization?.gid, async (newOrgId, oldOrgId) => {
  if (newOrgId && oldOrgId && newOrgId !== oldOrgId) {
    // Per-org cache will be checked in calculateStats
    await calculateStats(false)
  }
})

// Watch for billing period mode changes - cache is keyed by mode, so no force needed
watch(() => props.useBillingPeriod, async () => {
  await calculateStats(false)
})

// Watch for accumulated mode changes - reprocess cached data
watch(() => props.accumulated, async () => {
  await calculateStats(false)
})

// Watch for reload trigger - force refetch from API
watch(() => props.reloadTrigger, async (newVal) => {
  if (newVal > 0) {
    await calculateStats(true)
  }
})

onMounted(async () => {
  await calculateStats(true) // Initial fetch
})
</script>

<template>
  <ChartCard
    :title="t('update_statistics')"
    :total="effectiveTotalUpdates"
    :last-day-evolution="effectiveLastDayEvolution"
    :is-loading="isLoading"
    :has-data="hasData"
    :is-demo-data="isDemoMode"
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
              :aria-label="`${actionDisplayNames.requested}: ${effectiveTotalRequested.toLocaleString()}`"
            >
              <GlobeAltIcon class="w-4 h-4" aria-hidden="true" />
              <span>{{ effectiveTotalRequested.toLocaleString() }}</span>
            </div>
          </div>
          <div class="flex gap-2 items-center">
            <div class="w-3 h-3 rounded-full" style="background-color: hsl(135, 55%, 50%)" />
            <div
              class="flex gap-1 items-center text-sm text-slate-600 dark:text-slate-300"
              :aria-label="`${actionDisplayNames.install}: ${effectiveTotalInstalled.toLocaleString()}`"
            >
              <ArrowDownOnSquareIcon class="w-4 h-4" aria-hidden="true" />
              <span>{{ effectiveTotalInstalled.toLocaleString() }}</span>
            </div>
          </div>
          <div class="flex gap-2 items-center">
            <div class="w-3 h-3 rounded-full" style="background-color: hsl(0, 50%, 60%)" />
            <div
              class="flex gap-1 items-center text-sm text-slate-600 dark:text-slate-300"
              :aria-label="`${actionDisplayNames.fail}: ${effectiveTotalFailed.toLocaleString()}`"
            >
              <XCircleIcon class="w-4 h-4" aria-hidden="true" />
              <span>{{ effectiveTotalFailed.toLocaleString() }}</span>
            </div>
          </div>
        </div>
      </div>
    </template>

    <UpdateStatsChart
      :key="JSON.stringify(effectiveChartDataByAction)"
      :title="t('update_statistics')"
      :colors="colors.blue"
      :data="effectiveChartData"
      :use-billing-period="useBillingPeriod"
      :accumulated="accumulated"
      :data-by-app="effectiveChartDataByAction"
      :app-names="actionDisplayNames"
      :app-id="appId"
    />
  </ChartCard>
</template>
