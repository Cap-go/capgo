<script setup lang="ts">
import colors from 'tailwindcss/colors'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSupabase } from '~/services/supabase'
import { useDashboardAppsStore } from '~/stores/dashboardApps'
import { useOrganizationStore } from '~/stores/organization'
import ChartCard from './ChartCard.vue'
import DeploymentStatsChart from './DeploymentStatsChart.vue'

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
const organizationStore = useOrganizationStore()
const dashboardAppsStore = useDashboardAppsStore()
const supabase = useSupabase()
const singleAppNameCache = new Map<string, string>()
let latestRequestToken = 0

const totalDeployments = ref(0)
const lastDayEvolution = ref(0)
const deploymentData = ref<number[]>([])
const deploymentDataByApp = ref<{ [appId: string]: number[] }>({})
const appNames = ref<{ [appId: string]: string }>({})
const isLoading = ref(true)
const noPublicChannel = ref(false)
const hasData = computed(() => totalDeployments.value > 0)

// Per-org cache for raw API data: Map<orgId, {data, noPublicChannel}>
const cacheByOrg = new Map<string, { data: any[], noPublicChannel: boolean }>()
// Track current org for change detection
const currentCacheOrgId = ref<string | null>(null)

async function calculateStats(forceRefetch = false) {
  const startTime = Date.now()
  const requestToken = ++latestRequestToken

  isLoading.value = true

  // Reset display data
  totalDeployments.value = 0
  lastDayEvolution.value = 0
  deploymentDataByApp.value = {}
  appNames.value = {}
  deploymentData.value = []
  noPublicChannel.value = false

  const fallbackData = Array.from({ length: 30 }).fill(0) as number[]

  const currentOrgId = organizationStore.currentOrganization?.gid ?? null
  const orgChanged = currentCacheOrgId.value !== currentOrgId
  currentCacheOrgId.value = currentOrgId

  try {
    await organizationStore.dedupFetchOrganizations()
    await organizationStore.awaitInitialLoad()

    const targetOrganization = props.appId
      ? organizationStore.getOrgByAppId(props.appId) ?? organizationStore.currentOrganization
      : organizationStore.currentOrganization

    if (!targetOrganization) {
      if (requestToken === latestRequestToken)
        deploymentData.value = fallbackData
      return
    }

    // Always work with last 30 days of data
    const last30DaysEnd = new Date()
    const last30DaysStart = new Date()
    last30DaysStart.setDate(last30DaysStart.getDate() - 29) // 30 days including today
    last30DaysStart.setHours(0, 0, 0, 0)
    last30DaysEnd.setHours(23, 59, 59, 999)

    // Get billing period dates for filtering
    const billingStart = new Date(targetOrganization.subscription_start ?? new Date())
    billingStart.setHours(0, 0, 0, 0)

    const startDate = last30DaysStart.toISOString().split('T')[0]
    const endDate = last30DaysEnd.toISOString().split('T')[0]

    const localAppNames: { [appId: string]: string } = {}
    let targetAppIds: string[] = []

    if (props.appId) {
      targetAppIds = [props.appId]
      let cachedName = singleAppNameCache.get(props.appId) ?? ''
      if (!cachedName) {
        try {
          const { data: appRow } = await supabase
            .from('apps')
            .select('name')
            .eq('app_id', props.appId)
            .single()
          cachedName = appRow?.name ?? props.appId
        }
        catch (error) {
          console.error('Error fetching app name for deployment stats:', error)
          cachedName = props.appId
        }
        singleAppNameCache.set(props.appId, cachedName)
      }
      localAppNames[props.appId] = cachedName || props.appId
    }
    else {
      // Fetch apps if not loaded OR if org changed (to get fresh app list)
      await dashboardAppsStore.fetchApps(orgChanged)

      targetAppIds = [...dashboardAppsStore.appIds]
      Object.assign(localAppNames, dashboardAppsStore.appNames)
    }

    if (targetAppIds.length === 0) {
      if (requestToken === latestRequestToken) {
        deploymentData.value = fallbackData
        deploymentDataByApp.value = {}
        appNames.value = { ...localAppNames }
        noPublicChannel.value = false
      }
      return
    }

    // Create fresh arrays for processing
    const perApp: { [appId: string]: number[] } = {}
    targetAppIds.forEach((appId) => {
      perApp[appId] = Array.from({ length: 30 }).fill(0) as number[]
    })

    const dailyCounts30Days = Array.from({ length: 30 }).fill(0) as number[]
    let totalDeploymentsCount = 0
    let noPublicChannelDetected = false

    // Check per-org cache - only use if not forcing refetch
    let data: any[] | null = null
    const cachedData = currentOrgId ? cacheByOrg.get(currentOrgId) : null

    if (cachedData && !forceRefetch) {
      data = cachedData.data
      noPublicChannelDetected = cachedData.noPublicChannel
    }
    else {
      // Only check public channels when actually fetching new data
      if (targetAppIds.length > 0) {
        try {
          const { data: publicChannels } = await supabase
            .from('channels')
            .select('app_id')
            .in('app_id', targetAppIds)
            .eq('public', true)
          const hasPublic = (publicChannels?.length ?? 0) > 0
          noPublicChannelDetected = !hasPublic
        }
        catch (err) {
          console.error(`[DeploymentStatsCard] Failed to verify public channels`, err)
        }
      }

      const result = await supabase
        .from('deploy_history')
        .select(`
          deployed_at,
          app_id,
          channels(
            public
          )
        `)
        .eq('channels.public', true)
        .in('app_id', targetAppIds)
        .gte('deployed_at', startDate)
        .lte('deployed_at', endDate)
        .order('deployed_at')

      if (result.error)
        throw result.error

      data = result.data

      // Store in per-org cache
      if (data && currentOrgId) {
        cacheByOrg.set(currentOrgId, { data, noPublicChannel: noPublicChannelDetected })
      }
    }

    if (data && data.length > 0) {
      data.forEach((deployment: any) => {
        if (!deployment.deployed_at || !deployment.app_id)
          return

        const deployDate = new Date(deployment.deployed_at)

        // Calculate days since start of 30-day period
        const daysDiff = Math.floor((deployDate.getTime() - last30DaysStart.getTime()) / (1000 * 60 * 60 * 24))

        if (daysDiff < 0 || daysDiff >= 30)
          return

        dailyCounts30Days[daysDiff] += 1
        totalDeploymentsCount += 1

        if (perApp[deployment.app_id])
          perApp[deployment.app_id][daysDiff] += 1
      })
    }

    let finalDeploymentData = dailyCounts30Days
    let finalPerApp = perApp
    let finalTotal = totalDeploymentsCount

    if (props.useBillingPeriod) {
      const filteredData = filterToBillingPeriod(dailyCounts30Days, last30DaysStart, billingStart)
      finalDeploymentData = filteredData.data

      const filteredPerApp: { [appId: string]: number[] } = {}
      targetAppIds.forEach((appId) => {
        const filteredAppData = filterToBillingPeriod(perApp[appId], last30DaysStart, billingStart)
        filteredPerApp[appId] = filteredAppData.data
      })
      finalPerApp = filteredPerApp
      finalTotal = finalDeploymentData.reduce((sum, count) => sum + count, 0)
    }

    let evolution = 0
    const nonZeroDays = finalDeploymentData.filter(count => count > 0)
    if (nonZeroDays.length >= 2) {
      const lastDayCount = nonZeroDays[nonZeroDays.length - 1]
      const previousDayCount = nonZeroDays[nonZeroDays.length - 2]
      if (previousDayCount > 0)
        evolution = ((lastDayCount - previousDayCount) / previousDayCount) * 100
    }

    if (requestToken !== latestRequestToken)
      return

    deploymentData.value = finalDeploymentData
    deploymentDataByApp.value = finalPerApp
    appNames.value = { ...localAppNames }
    totalDeployments.value = finalTotal
    lastDayEvolution.value = evolution
    noPublicChannel.value = noPublicChannelDetected
  }
  catch (error) {
    console.error('Error fetching deployment stats:', error)
    if (requestToken === latestRequestToken) {
      deploymentData.value = fallbackData
      deploymentDataByApp.value = {}
      appNames.value = {}
      totalDeployments.value = 0
      lastDayEvolution.value = 0
      noPublicChannel.value = false
    }
  }
  finally {
    if (requestToken === latestRequestToken) {
      // Ensure spinner shows for at least 300ms for better UX
      const elapsed = Date.now() - startTime
      if (elapsed < 300) {
        await new Promise(resolve => setTimeout(resolve, 300 - elapsed))
      }
      isLoading.value = false
    }
  }
}

// Watch for organization changes - use per-org cache (no need to force refetch)
watch(() => organizationStore.currentOrganization?.gid, async (newOrgId, oldOrgId) => {
  if (newOrgId && oldOrgId && newOrgId !== oldOrgId) {
    // Per-org cache will be checked in calculateStats
    await calculateStats(false)
  }
})

// Watch for billing period mode changes - reprocess cached data
watch(() => props.useBillingPeriod, async () => {
  await calculateStats(false)
})

// Watch for app target changes - need to refetch
watch(() => props.appId, async () => {
  await calculateStats(true) // Force refetch for new app
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
    :title="t('deployment_statistics')"
    :total="totalDeployments"
    :last-day-evolution="lastDayEvolution"
    :is-loading="isLoading"
    :has-data="hasData"
    :error-message="noPublicChannel ? t('no-public-channel') : undefined"
  >
    <DeploymentStatsChart
      :key="JSON.stringify(deploymentDataByApp)"
      :title="t('deployment_statistics')"
      :colors="colors.blue"
      :data="deploymentData"
      :use-billing-period="useBillingPeriod"
      :accumulated="accumulated"
      :data-by-app="deploymentDataByApp"
      :app-names="appNames"
    />
  </ChartCard>
</template>
