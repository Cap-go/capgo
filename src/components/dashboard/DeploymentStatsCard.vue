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
let latestRequestToken = 0

const totalDeployments = ref(0)
const lastDayEvolution = ref(0)
const deploymentData = ref<number[]>([])
const deploymentDataByChannel = ref<{ [channelId: string]: number[] }>({})
const channelNames = ref<{ [channelId: string]: string }>({})
const channelAppIds = ref<{ [channelId: string]: string }>({})
const isLoading = ref(true)
const hasData = computed(() => totalDeployments.value > 0)

// Per-org cache for raw API data: Map<orgId, {data, channelNames, channelAppIds}>
const cacheByOrg = new Map<string, { data: any[], channelNames: { [channelId: string]: string }, channelAppIds: { [channelId: string]: string } }>()
// Track current org for change detection
const currentCacheOrgId = ref<string | null>(null)

async function calculateStats(forceRefetch = false) {
  const startTime = Date.now()
  const requestToken = ++latestRequestToken

  isLoading.value = true

  // Reset display data
  totalDeployments.value = 0
  lastDayEvolution.value = 0
  deploymentDataByChannel.value = {}
  channelNames.value = {}
  channelAppIds.value = {}
  deploymentData.value = []

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

    let targetAppIds: string[] = []

    if (props.appId) {
      targetAppIds = [props.appId]
    }
    else {
      // Fetch apps if not loaded OR if org changed (to get fresh app list)
      await dashboardAppsStore.fetchApps(orgChanged)
      targetAppIds = [...dashboardAppsStore.appIds]
    }

    if (targetAppIds.length === 0) {
      if (requestToken === latestRequestToken) {
        deploymentData.value = fallbackData
        deploymentDataByChannel.value = {}
        channelNames.value = {}
        channelAppIds.value = {}
      }
      return
    }

    const dailyCounts30Days = Array.from({ length: 30 }).fill(0) as number[]
    let totalDeploymentsCount = 0

    // Check per-org cache - only use if not forcing refetch
    let data: any[] | null = null
    let localChannelNames: { [channelId: string]: string } = {}
    let localChannelAppIds: { [channelId: string]: string } = {}
    const cachedData = currentOrgId ? cacheByOrg.get(currentOrgId) : null

    if (cachedData && !forceRefetch) {
      data = cachedData.data
      localChannelNames = cachedData.channelNames
      localChannelAppIds = cachedData.channelAppIds
    }
    else {
      // Fetch deployment history with channel info for all channels
      const result = await supabase
        .from('deploy_history')
        .select(`
          deployed_at,
          app_id,
          channel_id,
          channels(
            id,
            name
          )
        `)
        .in('app_id', targetAppIds)
        .gte('deployed_at', startDate)
        .lte('deployed_at', endDate)
        .order('deployed_at')

      if (result.error)
        throw result.error

      data = result.data

      // Extract channel names and app IDs from the data
      if (data) {
        data.forEach((deployment: any) => {
          if (deployment.channel_id && deployment.channels?.name) {
            localChannelNames[deployment.channel_id] = deployment.channels.name
            localChannelAppIds[deployment.channel_id] = deployment.app_id
          }
        })
      }

      // Store in per-org cache
      if (data && currentOrgId) {
        cacheByOrg.set(currentOrgId, { data, channelNames: localChannelNames, channelAppIds: localChannelAppIds })
      }
    }

    // Create fresh arrays for processing per channel
    const perChannel: { [channelId: string]: number[] } = {}
    Object.keys(localChannelNames).forEach((channelId) => {
      perChannel[channelId] = Array.from({ length: 30 }).fill(0) as number[]
    })

    if (data && data.length > 0) {
      data.forEach((deployment: any) => {
        if (!deployment.deployed_at || !deployment.channel_id)
          return

        const deployDate = new Date(deployment.deployed_at)

        // Calculate days since start of 30-day period
        const daysDiff = Math.floor((deployDate.getTime() - last30DaysStart.getTime()) / (1000 * 60 * 60 * 24))

        if (daysDiff < 0 || daysDiff >= 30)
          return

        dailyCounts30Days[daysDiff] += 1
        totalDeploymentsCount += 1

        // Initialize channel array if not already (for channels discovered during iteration)
        if (!perChannel[deployment.channel_id]) {
          perChannel[deployment.channel_id] = Array.from({ length: 30 }).fill(0) as number[]
        }
        perChannel[deployment.channel_id][daysDiff] += 1
      })
    }

    let finalDeploymentData = dailyCounts30Days
    let finalPerChannel = perChannel
    let finalTotal = totalDeploymentsCount

    if (props.useBillingPeriod) {
      const filteredData = filterToBillingPeriod(dailyCounts30Days, last30DaysStart, billingStart)
      finalDeploymentData = filteredData.data

      const filteredPerChannel: { [channelId: string]: number[] } = {}
      Object.keys(perChannel).forEach((channelId) => {
        const filteredChannelData = filterToBillingPeriod(perChannel[channelId], last30DaysStart, billingStart)
        filteredPerChannel[channelId] = filteredChannelData.data
      })
      finalPerChannel = filteredPerChannel
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
    deploymentDataByChannel.value = finalPerChannel
    channelNames.value = { ...localChannelNames }
    channelAppIds.value = { ...localChannelAppIds }
    totalDeployments.value = finalTotal
    lastDayEvolution.value = evolution
  }
  catch (error) {
    console.error('Error fetching deployment stats:', error)
    if (requestToken === latestRequestToken) {
      deploymentData.value = fallbackData
      deploymentDataByChannel.value = {}
      channelNames.value = {}
      channelAppIds.value = {}
      totalDeployments.value = 0
      lastDayEvolution.value = 0
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
  >
    <DeploymentStatsChart
      :key="JSON.stringify(deploymentDataByChannel)"
      :title="t('deployment_statistics')"
      :colors="colors.blue"
      :data="deploymentData"
      :use-billing-period="useBillingPeriod"
      :accumulated="accumulated"
      :data-by-channel="deploymentDataByChannel"
      :channel-names="channelNames"
      :channel-app-ids="channelAppIds"
    />
  </ChartCard>
</template>
