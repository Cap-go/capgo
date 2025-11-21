<script setup lang="ts">
import type { ArrayElement } from '~/services/types'
import type { Database } from '~/types/supabase.types'
import dayjs from 'dayjs'
import { storeToRefs } from 'pinia'
import { computed, ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import { bytesToGb } from '~/services/conversion'
import { getCurrentPlanNameOrg, getPlans, getPlanUsagePercent, getTotalStorage } from '~/services/supabase'
import { sendEvent } from '~/services/tracking'
import { useDialogV2Store } from '~/stores/dialogv2'
import { useMainStore } from '~/stores/main'

const { t } = useI18n()
const plans = ref<Database['public']['Tables']['plans']['Row'][]>([])

const isLoading = ref(false)
const initialLoad = ref(true)
const route = useRoute()
const main = useMainStore()
const organizationStore = useOrganizationStore()
const router = useRouter()
const dialogStore = useDialogV2Store()
const displayStore = useDisplayStore()
displayStore.NavTitle = t('usage')

const { currentOrganization } = storeToRefs(organizationStore)

watchEffect(async () => {
  if (route.path === '/settings/organization/plans') {
    // if success is in url params show modal success plan setup
    if (route.query.success) {
      toast.success(t('usage-success'))
    }
    else if (main.user?.id) {
      sendEvent({
        channel: 'usage',
        event: 'User visit',
        icon: '💳',
        user_id: currentOrganization.value?.gid,
        notify: false,
      }).catch()
    }
  }
})

async function getUsage(orgId: string) {
  const usage = main.dashboard

  const plan = plans.value.find(p => p.name === 'Pay as you go')!
  const planCurrent = await getCurrentPlanNameOrg(orgId)
  const currentPlan = plans.value.find(p => p.name === planCurrent)

  // Get usage percentages
  let detailPlanUsage: ArrayElement<Database['public']['Functions']['get_plan_usage_percent_detailed']['Returns']> = {
    total_percent: 0,
    mau_percent: 0,
    bandwidth_percent: 0,
    storage_percent: 0,
    build_time_percent: 0,
  }

  try {
    detailPlanUsage = await getPlanUsagePercent(orgId)
  }
  catch (err) {
    console.log('Error getting plan usage percent:', err)
  }

  const payg_base = {
    mau: plan?.mau,
    storage: plan?.storage,
    bandwidth: plan?.bandwidth,
    build_time: plan?.build_time_unit || 0,
  }

  const payg_units = {
    mau: currentPlan?.mau_unit,
    storage: currentPlan?.storage_unit,
    bandwidth: currentPlan?.bandwidth_unit,
    build_time: currentPlan?.build_time_unit || 0,
  }

  const nowEndOfDay = dayjs().endOf('day')
  const billingStart = organizationStore.currentOrganization?.subscription_start
    ? dayjs(organizationStore.currentOrganization.subscription_start).startOf('day')
    : null
  const billingEndRaw = organizationStore.currentOrganization?.subscription_end
    ? dayjs(organizationStore.currentOrganization.subscription_end).endOf('day')
    : null
  const billingEnd = billingEndRaw && billingEndRaw.isBefore(nowEndOfDay) ? billingEndRaw : nowEndOfDay

  const usageInCycle = usage.filter((entry) => {
    const entryDate = dayjs(entry.date)
    if (billingStart && entryDate.isBefore(billingStart))
      return false
    if (entryDate.isAfter(billingEnd))
      return false
    return true
  })

  const relevantUsage = usageInCycle.length > 0 ? usageInCycle : usage

  const totalMau = relevantUsage.reduce((acc, entry) => acc + (entry.mau ?? 0), 0)
  const totalBandwidthBytes = relevantUsage.reduce((acc, entry) => acc + (entry.bandwidth ?? 0), 0)
  const totalBandwidth = bytesToGb(totalBandwidthBytes)
  const totalStorage = bytesToGb(await getTotalStorage(orgId))
  const totalBuildTime = relevantUsage.reduce((acc, entry) => acc + (entry.build_time_unit ?? 0), 0)

  const basePrice = currentPlan?.price_m ?? 0

  const calculatePrice = (total: number, base: number, unit: number) => total <= base ? 0 : (total - base) * unit

  const isPayAsYouGo = currentPlan?.name === 'Pay as you go'
  const totalUsagePrice = computed(() => {
    if (currentPlan?.name !== 'Pay as you go')
      return 0

    const mauPrice = calculatePrice(totalMau, payg_base.mau, payg_units!.mau!)
    const storagePrice = calculatePrice(totalStorage, payg_base.storage, payg_units!.storage!)
    const bandwidthPrice = calculatePrice(totalBandwidth, payg_base.bandwidth, payg_units!.bandwidth!)
    const buildTimePrice = calculatePrice(totalBuildTime, payg_base.build_time, payg_units!.build_time!)
    const sum = mauPrice + storagePrice + bandwidthPrice + buildTimePrice
    return roundNumber(sum)
  })

  const totalPrice = computed(() => {
    return roundNumber(basePrice + totalUsagePrice.value)
  })

  return {
    isPayAsYouGo,
    currentPlan,
    totalPrice,
    totalUsagePrice,
    totalMau,
    totalBandwidth,
    totalStorage,
    totalBuildTime,
    payg_units,
    plan,
    detailPlanUsage,
    cycle: {
      subscription_anchor_start: dayjs(organizationStore.currentOrganization?.subscription_start).format('YYYY/MM/D'),
      subscription_anchor_end: dayjs(organizationStore.currentOrganization?.subscription_end).format('YYYY/MM/D'),
    },
  }
}

// const planUsageMap = ref<Map<string, Awaited<ReturnType<typeof getUsage>>>>()
const planUsageMap = ref(new Map<string, Awaited<ReturnType<typeof getUsage>>>())
const planUsage = computed(() => planUsageMap.value?.get(currentOrganization.value?.gid ?? ''))

// Similar to Plans.vue - current plan and best plan computed properties
const currentPlan = computed(() => main.plans.find(plan => plan.name === planUsage.value?.currentPlan?.name))
const currentPlanSuggest = computed(() => main.plans.find(plan => plan.name === main.bestPlan))

function roundNumber(number: number) {
  return Math.round(number * 100) / 100
}

function formatBuildTime(seconds: number): string {
  if (seconds === 0)
    return '0m'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0)
    return `${hours}h ${minutes}m`
  return `${minutes}m`
}

const shouldShowUpgrade = computed(() => {
  if (!currentPlanSuggest.value || !currentPlan.value) {
    return false
  }

  // Compare based on price - if suggested plan is better (higher features) and price makes sense
  return currentPlanSuggest.value.price_m > currentPlan.value.price_m
})

function goToPlans() {
  router.push('/settings/organization/plans')
}

onMounted(async () => {
  await loadData()
})

async function loadData() {
  await Promise.all([organizationStore.awaitInitialLoad(), main.awaitInitialLoad()])
  const gid = organizationStore?.currentOrganization?.gid ?? ''

  if (planUsageMap.value.has(gid) || isLoading.value)
    return

  isLoading.value = true

  if (initialLoad.value) {
    await getPlans().then((pls) => {
      plans.value.length = 0
      plans.value.push(...pls)
    })
  }
  getUsage(gid).then((res) => {
    planUsageMap.value?.set(gid, res as any)
  })
  isLoading.value = false
  initialLoad.value = false
}

function lastRunDate() {
  const source = currentOrganization.value?.stats_updated_at
  if (!source)
    return `${t('last-run')}: ${t('unknown')}`

  const lastRun = dayjs(source).format('MMMM D, YYYY HH:mm')
  return `${t('last-run')}: ${lastRun}`
}
function nextRunDate() {
  const source = currentOrganization.value?.next_stats_update_at
  if (!source)
    return `${t('next-run')}: ${t('unknown')}`

  const nextRun = dayjs(source).format('MMMM D, YYYY HH:mm')
  return `${t('next-run')}: ${nextRun}`
}
</script>

<template>
  <div class="flex overflow-hidden flex-col h-full bg-white dark:bg-gray-800">
    <div v-if="!isLoading" class="flex overflow-y-auto flex-col py-6 px-4 mx-auto w-full max-w-7xl h-full sm:px-6 lg:px-8">
      <!-- Header -->
      <div class="flex flex-col gap-4 justify-between mb-8 md:flex-row md:items-center shrink-0">
        <div>
          <h1 class="text-3xl font-bold text-gray-900 dark:text-white">
            {{ t('usage') }}
          </h1>
          <div class="flex gap-3 items-center mt-1 text-sm text-gray-500 dark:text-gray-400">
            <div class="flex gap-1.5 items-center">
              <div class="w-1.5 h-1.5 bg-green-500 rounded-full" />
              {{ lastRunDate() }}
            </div>
            <span class="text-gray-300 dark:text-gray-600">•</span>
            <div class="flex gap-1.5 items-center">
              <div class="w-1.5 h-1.5 bg-blue-500 rounded-full" />
              {{ nextRunDate() }}
            </div>
          </div>
        </div>

        <div class="flex gap-2 items-center py-1.5 px-3 text-sm bg-gray-50 rounded-lg border border-gray-200 shadow-sm dark:bg-gray-900 dark:border-gray-700">
          <span class="text-gray-500 dark:text-gray-400">{{ t('billing-cycle') }}:</span>
          <span class="font-medium text-gray-900 dark:text-white">{{ planUsage?.cycle.subscription_anchor_start }}</span>
          <span class="text-gray-400">→</span>
          <span class="font-medium text-gray-900 dark:text-white">{{ planUsage?.cycle.subscription_anchor_end }}</span>
        </div>
      </div>

      <!-- Plan & Cost Overview -->
      <div class="grid grid-cols-1 gap-6 mb-8 lg:grid-cols-3 shrink-0">
        <!-- Current Plan -->
        <div class="flex flex-col justify-between p-5 bg-gray-50 rounded-xl border border-gray-200 shadow-sm dark:bg-gray-900 dark:border-gray-700">
          <div>
            <div class="mb-1 text-sm text-gray-500 dark:text-gray-400">
              {{ t('Current') }}
            </div>
            <div class="text-2xl font-bold text-gray-900 dark:text-white">
              {{ currentPlan?.name || t('loading') }}
            </div>
          </div>
          <div class="flex justify-between items-end pt-4 mt-4 border-t border-gray-100 dark:border-gray-700">
            <div class="text-sm text-gray-500 dark:text-gray-400">
              {{ t('base') }}
            </div>
            <div class="text-xl font-semibold text-gray-900 dark:text-white">
              ${{ currentPlan?.price_m }}/{{ t('mo') }}
            </div>
          </div>
        </div>

        <!-- Estimated Cost -->
        <div class="flex flex-col justify-between p-5 bg-gray-50 rounded-xl border border-gray-200 shadow-sm dark:bg-gray-900 dark:border-gray-700">
          <div>
            <div class="mb-1 text-sm text-gray-500 dark:text-gray-400">
              {{ t('usage-title') }}
            </div>
            <div class="text-2xl font-bold text-blue-600 dark:text-blue-400">
              ${{ planUsage?.totalPrice.toLocaleString() }}
            </div>
          </div>
          <div class="flex justify-between items-end pt-4 mt-4 border-t border-gray-100 dark:border-gray-700">
            <div class="text-sm text-gray-500 dark:text-gray-400">
              {{ t('credits-used-in-period') }}
            </div>
            <div class="text-xl font-semibold text-gray-900 dark:text-white">
              +${{ planUsage?.totalUsagePrice.toLocaleString() }}
            </div>
          </div>
        </div>

        <!-- Upgrade / Best Plan -->
        <div v-if="shouldShowUpgrade" class="overflow-hidden relative p-5 from-blue-50 to-indigo-50 rounded-xl border border-blue-200 shadow-sm dark:border-blue-800 bg-linear-to-br dark:from-blue-900/20 dark:to-indigo-900/20">
          <div class="relative z-10">
            <div class="flex justify-between items-start mb-2">
              <div class="text-sm font-medium text-blue-800 dark:text-blue-200">
                {{ t('recommended') }}
              </div>
              <div class="py-0.5 px-2 text-xs font-bold text-white bg-blue-600 rounded-full">
                {{ t('upgrade') }}
              </div>
            </div>
            <div class="mb-1 text-xl font-bold text-gray-900 dark:text-white">
              {{ currentPlanSuggest?.name }}
            </div>
            <div class="mb-4 text-sm text-gray-600 dark:text-gray-300">
              ${{ currentPlanSuggest?.price_m }}/{{ t('mo') }}
            </div>
            <button class="py-2 w-full text-sm font-semibold text-white bg-blue-600 rounded-lg shadow-sm transition-colors hover:bg-blue-700" @click="goToPlans">
              {{ t('plan-upgrade-v2') }}
            </button>
          </div>
        </div>
        <div v-else class="flex justify-center items-center p-5 text-sm italic text-gray-400 bg-gray-50 rounded-xl border border-gray-200 dark:text-gray-500 dark:bg-gray-900 dark:border-gray-700">
          {{ t('good') }}
        </div>
      </div>

      <!-- Usage Metrics Grid -->
      <h2 class="mb-4 text-lg font-semibold text-gray-900 dark:text-white shrink-0">
        {{ t('usage') }}
      </h2>
      <div class="grid grid-cols-1 gap-6 mb-8 md:grid-cols-2 xl:grid-cols-4 shrink-0">
        <!-- MAU -->
        <div class="p-5 bg-gray-50 rounded-xl border border-gray-200 shadow-sm transition-shadow dark:bg-gray-900 dark:border-gray-700 hover:shadow-md">
          <div class="flex justify-between items-start mb-4">
            <div class="text-sm font-medium text-gray-500 dark:text-gray-400">
              {{ t('monthly-active-users') }}
            </div>
            <div class="text-lg font-bold" :class="(planUsage?.detailPlanUsage?.mau_percent || 0) >= 100 ? 'text-red-600' : 'text-gray-900 dark:text-white'">
              {{ planUsage?.detailPlanUsage?.mau_percent || 0 }}%
            </div>
          </div>
          <div class="overflow-hidden mb-4 w-full h-2 bg-gray-100 rounded-full dark:bg-gray-700">
            <div class="h-full rounded-full transition-all duration-500" :class="(planUsage?.detailPlanUsage?.mau_percent || 0) >= 100 ? 'bg-red-500' : 'bg-blue-500'" :style="{ width: `${Math.min(planUsage?.detailPlanUsage?.mau_percent || 0, 100)}%` }" />
          </div>
          <div class="space-y-1 text-sm">
            <div class="flex justify-between text-gray-600 dark:text-gray-400">
              <span>{{ t('used-in-period') }}</span>
              <span class="font-medium text-gray-900 dark:text-white">{{ planUsage?.totalMau.toLocaleString() }}</span>
            </div>
            <div class="flex justify-between text-gray-600 dark:text-gray-400">
              <span>{{ t('included-in-plan') }}</span>
              <span>{{ planUsage?.currentPlan?.mau.toLocaleString() }}</span>
            </div>
          </div>
        </div>

        <!-- Storage -->
        <div class="p-5 bg-gray-50 rounded-xl border border-gray-200 shadow-sm transition-shadow dark:bg-gray-900 dark:border-gray-700 hover:shadow-md">
          <div class="flex justify-between items-start mb-4">
            <div class="text-sm font-medium text-gray-500 dark:text-gray-400">
              {{ t('Storage') }}
            </div>
            <div class="text-lg font-bold" :class="(planUsage?.detailPlanUsage?.storage_percent || 0) >= 100 ? 'text-red-600' : 'text-gray-900 dark:text-white'">
              {{ planUsage?.detailPlanUsage?.storage_percent || 0 }}%
            </div>
          </div>
          <div class="overflow-hidden mb-4 w-full h-2 bg-gray-100 rounded-full dark:bg-gray-700">
            <div class="h-full rounded-full transition-all duration-500" :class="(planUsage?.detailPlanUsage?.storage_percent || 0) >= 100 ? 'bg-red-500' : 'bg-purple-500'" :style="{ width: `${Math.min(planUsage?.detailPlanUsage?.storage_percent || 0, 100)}%` }" />
          </div>
          <div class="space-y-1 text-sm">
            <div class="flex justify-between text-gray-600 dark:text-gray-400">
              <span>{{ t('used-in-period') }}</span>
              <span class="font-medium text-gray-900 dark:text-white">{{ planUsage?.totalStorage.toLocaleString() }} GB</span>
            </div>
            <div class="flex justify-between text-gray-600 dark:text-gray-400">
              <span>{{ t('included-in-plan') }}</span>
              <span>{{ planUsage?.currentPlan?.storage.toLocaleString() }} GB</span>
            </div>
          </div>
        </div>

        <!-- Bandwidth -->
        <div class="p-5 bg-gray-50 rounded-xl border border-gray-200 shadow-sm transition-shadow dark:bg-gray-900 dark:border-gray-700 hover:shadow-md">
          <div class="flex justify-between items-start mb-4">
            <div class="text-sm font-medium text-gray-500 dark:text-gray-400">
              {{ t('Bandwidth') }}
            </div>
            <div class="text-lg font-bold" :class="(planUsage?.detailPlanUsage?.bandwidth_percent || 0) >= 100 ? 'text-red-600' : 'text-gray-900 dark:text-white'">
              {{ planUsage?.detailPlanUsage?.bandwidth_percent || 0 }}%
            </div>
          </div>
          <div class="overflow-hidden mb-4 w-full h-2 bg-gray-100 rounded-full dark:bg-gray-700">
            <div class="h-full rounded-full transition-all duration-500" :class="(planUsage?.detailPlanUsage?.bandwidth_percent || 0) >= 100 ? 'bg-red-500' : 'bg-green-500'" :style="{ width: `${Math.min(planUsage?.detailPlanUsage?.bandwidth_percent || 0, 100)}%` }" />
          </div>
          <div class="space-y-1 text-sm">
            <div class="flex justify-between text-gray-600 dark:text-gray-400">
              <span>{{ t('used-in-period') }}</span>
              <span class="font-medium text-gray-900 dark:text-white">{{ planUsage?.totalBandwidth.toLocaleString() }} GB</span>
            </div>
            <div class="flex justify-between text-gray-600 dark:text-gray-400">
              <span>{{ t('included-in-plan') }}</span>
              <span>{{ planUsage?.currentPlan?.bandwidth.toLocaleString() }} GB</span>
            </div>
          </div>
        </div>

        <!-- Build Time -->
        <div class="p-5 bg-gray-50 rounded-xl border border-gray-200 shadow-sm transition-shadow dark:bg-gray-900 dark:border-gray-700 hover:shadow-md">
          <div class="flex justify-between items-start mb-4">
            <div class="text-sm font-medium text-gray-500 dark:text-gray-400">
              {{ t('build-time') }}
            </div>
            <div class="text-lg font-bold" :class="(planUsage?.detailPlanUsage?.build_time_percent || 0) >= 100 ? 'text-red-600' : 'text-gray-900 dark:text-white'">
              {{ planUsage?.detailPlanUsage?.build_time_percent || 0 }}%
            </div>
          </div>
          <div class="overflow-hidden mb-4 w-full h-2 bg-gray-100 rounded-full dark:bg-gray-700">
            <div class="h-full rounded-full transition-all duration-500" :class="(planUsage?.detailPlanUsage?.build_time_percent || 0) >= 100 ? 'bg-red-500' : 'bg-orange-500'" :style="{ width: `${Math.min(planUsage?.detailPlanUsage?.build_time_percent || 0, 100)}%` }" />
          </div>
          <div class="space-y-1 text-sm">
            <div class="flex justify-between text-gray-600 dark:text-gray-400">
              <span>{{ t('used-in-period') }}</span>
              <span class="font-medium text-gray-900 dark:text-white">{{ formatBuildTime(planUsage?.totalBuildTime || 0) }}</span>
            </div>
            <div class="flex justify-between text-gray-600 dark:text-gray-400">
              <span>{{ t('included-in-plan') }}</span>
              <span>{{ formatBuildTime(planUsage?.currentPlan?.build_time_unit || 0) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Loading State -->
    <div v-else class="flex justify-center items-center h-full">
      <div class="text-center">
        <div class="mx-auto mb-4 w-12 h-12 rounded-full border-b-2 border-blue-600 animate-spin" />
        <p class="text-gray-600 dark:text-gray-400">
          {{ t('loading') }}...
        </p>
      </div>
    </div>

    <!-- Teleport for Detailed Usage Plan Dialog -->
    <Teleport v-if="dialogStore.showDialog && dialogStore.dialogOptions?.title === t('detailed-usage-plan')" defer to="#dialog-v2-content">
      <div class="space-y-4">
        <div class="text-sm">
          <div class="mb-2 font-medium text-gray-900 dark:text-white">
            {{ t('billing-cycle') }} {{ planUsage?.cycle.subscription_anchor_start }} {{ t('to') }} {{ planUsage?.cycle.subscription_anchor_end }}
          </div>

          <div class="mb-3 font-medium text-gray-900 dark:text-white">
            {{ t('your-usage') }}
          </div>

          <div class="space-y-2 text-gray-600 dark:text-gray-400">
            <div class="flex justify-between">
              <span>{{ t('mau-usage') }}</span>
              <span class="font-medium">{{ planUsage?.detailPlanUsage?.mau_percent }}%</span>
            </div>
            <div class="flex justify-between">
              <span>{{ t('bandwidth-usage') }}</span>
              <span class="font-medium">{{ planUsage?.detailPlanUsage?.bandwidth_percent }}%</span>
            </div>
            <div class="flex justify-between">
              <span>{{ t('storage-usage') }}</span>
              <span class="font-medium">{{ planUsage?.detailPlanUsage?.storage_percent }}%</span>
            </div>
            <div class="flex justify-between">
              <span>{{ t('build-time-usage') }}</span>
              <span class="font-medium">{{ planUsage?.detailPlanUsage?.build_time_percent }}%</span>
            </div>
          </div>

          <div class="pt-3 mt-4 text-xs text-gray-500 whitespace-pre-line border-t border-gray-200 dark:text-gray-400 dark:border-gray-600">
            {{ lastRunDate() }} {{ nextRunDate() }}
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
        </route>
