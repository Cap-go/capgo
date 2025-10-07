<script setup lang="ts">
import colors from 'tailwindcss/colors'
import { onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import DeploymentStatsChart from '~/components/DeploymentStatsChart.vue'
import { useSupabase } from '~/services/supabase'
import { useDashboardAppsStore } from '~/stores/dashboardApps'
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
  appId: {
    type: String,
    default: '',
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

async function calculateStats() {
  const requestToken = ++latestRequestToken

  isLoading.value = true
  totalDeployments.value = 0
  lastDayEvolution.value = 0

  const fallbackData = Array.from({ length: 30 }).fill(0) as number[]

  // Reset data holders
  deploymentDataByApp.value = {}
  appNames.value = {}
  deploymentData.value = []

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
      await dashboardAppsStore.fetchApps()
      targetAppIds = [...dashboardAppsStore.appIds]
      Object.assign(localAppNames, dashboardAppsStore.appNames)
    }

    if (targetAppIds.length === 0) {
      if (requestToken === latestRequestToken) {
        deploymentData.value = fallbackData
        deploymentDataByApp.value = {}
        appNames.value = { ...localAppNames }
      }
      return
    }

    const perApp: { [appId: string]: number[] } = {}
    targetAppIds.forEach((appId) => {
      perApp[appId] = Array.from({ length: 30 }).fill(0) as number[]
    })

    const dailyCounts30Days = Array.from({ length: 30 }).fill(0) as number[]
    let totalDeploymentsCount = 0

    const { data, error } = await supabase
      .from('deploy_history')
      .select(`
        deployed_at,
        app_id,
        channels!inner(
          public
        )
      `)
      .in('app_id', targetAppIds)
      .gte('deployed_at', startDate)
      .lte('deployed_at', endDate)
      .eq('channels.public', true)
      .order('deployed_at')

    if (error)
      throw error

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
  }
  catch (error) {
    console.error('Error fetching deployment stats:', error)
    if (requestToken === latestRequestToken) {
      deploymentData.value = fallbackData
      deploymentDataByApp.value = {}
      appNames.value = {}
      totalDeployments.value = 0
      lastDayEvolution.value = 0
    }
  }
  finally {
    if (requestToken === latestRequestToken)
      isLoading.value = false
  }
}

// Watch for billing period mode changes and recalculate
watch(() => props.useBillingPeriod, async () => {
  await calculateStats()
})

// Watch for app target changes and recalculate
watch(() => props.appId, async () => {
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
      <h2 class="text-2xl font-semibold text-white">
        {{ t('deployment_statistics') }}
      </h2>

      <div class="flex flex-col items-end text-right">
        <div
          v-if="lastDayEvolution"
          class="inline-flex items-center justify-center rounded-full px-2 py-1 text-xs font-bold text-white shadow-lg whitespace-nowrap"
          :class="{ 'bg-emerald-500': lastDayEvolution >= 0, 'bg-yellow-500': lastDayEvolution < 0 }"
        >
          {{ lastDayEvolution < 0 ? '-' : '+' }}{{ Math.abs(lastDayEvolution).toFixed(2) }}%
        </div>
        <div v-else class="inline-flex rounded-full px-2 py-1 text-xs font-semibold opacity-0" aria-hidden="true">
          +0.00%
        </div>
        <div class="text-3xl font-bold text-white">
          {{ totalDeployments?.toLocaleString() }}
        </div>
      </div>
    </div>
    <!-- Chart built with Chart.js 3 -->

    <!-- Change the height attribute to adjust the chart height -->
    <div class="w-full h-full p-6 pt-2">
      <div v-if="isLoading" class="flex items-center justify-center h-full">
        <div class="loading loading-spinner loading-lg text-blue-500" />
      </div>
      <DeploymentStatsChart
        v-else
        :key="JSON.stringify(deploymentDataByApp)"
        :title="t('deployment_statistics')"
        :colors="colors.blue"
        :data="deploymentData"
        :use-billing-period="useBillingPeriod"
        :accumulated="accumulated"
        :data-by-app="deploymentDataByApp"
        :app-names="appNames"
      />
    </div>
  </div>
</template>
