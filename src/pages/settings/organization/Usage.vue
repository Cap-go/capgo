<script setup lang="ts">
import type { ArrayElement } from '~/services/types'
import type { Database } from '~/types/supabase.types'
import dayjs from 'dayjs'
import { useI18n } from 'petite-vue-i18n'
import { storeToRefs } from 'pinia'
import { computed, ref, watchEffect } from 'vue'
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
    // if session_id is in url params show modal success plan setup
    if (route.query.session_id) {
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
  const planCurrrent = await getCurrentPlanNameOrg(orgId)
  const currentPlan = plans.value.find(p => p.name === planCurrrent)

  // Get usage percentages
  let detailPlanUsage: ArrayElement<Database['public']['Functions']['get_plan_usage_percent_detailed']['Returns']> = {
    total_percent: 0,
    mau_percent: 0,
    bandwidth_percent: 0,
    storage_percent: 0,
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
  }

  const payg_units = {
    mau: currentPlan?.mau_unit,
    storage: currentPlan?.storage_unit,
    bandwidth: currentPlan?.bandwidth_unit,
  }

  let totalMau = 0
  const totalStorage = bytesToGb(await getTotalStorage(orgId))
  let totalBandwidth = 0

  const latestUsage = usage.sort((a, b) => -dayjs(a.date).diff(dayjs(b.date))).at(0)

  if (latestUsage) {
    totalMau = latestUsage.mau
    totalBandwidth = bytesToGb(latestUsage.bandwidth)
  }

  const basePrice = currentPlan?.price_m ?? 0

  const calculatePrice = (total: number, base: number, unit: number) => total <= base ? 0 : (total - base) * unit

  const isPayAsYouGo = currentPlan?.name === 'Pay as you go'
  const totalUsagePrice = computed(() => {
    if (currentPlan?.name !== 'Pay as you go')
      return 0

    const mauPrice = calculatePrice(totalMau, payg_base.mau, payg_units!.mau!)
    const storagePrice = calculatePrice(totalStorage, payg_base.storage, payg_units!.storage!)
    const bandwidthPrice = calculatePrice(totalBandwidth, payg_base.bandwidth, payg_units!.bandwidth!)
    const sum = mauPrice + storagePrice + bandwidthPrice
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

const shouldShowUpgrade = computed(() => {
  if (!currentPlanSuggest.value || !currentPlan.value) {
    return false
  }

  // Compare based on price - if suggested plan is better (higher features) and price makes sense
  return currentPlanSuggest.value.price_m > currentPlan.value.price_m
})

const failed = computed(() => {
  return !(!!currentOrganization.value?.paying || (currentOrganization.value?.trial_left ?? 0) > 0)
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
  const lastRun = dayjs(main.statsTime.last_run).format('MMMM D, YYYY HH:mm')
  return `${t('last-run')}: ${lastRun}`
}
function nextRunDate() {
  const nextRun = dayjs(main.statsTime.next_run).format('MMMM D, YYYY HH:mm')
  return `${t('next-run')}: ${nextRun}`
}
</script>

<template>
  <div>
    <div v-if="!isLoading" class="w-full h-full bg-white max-h-fit dark:bg-gray-800">
      <div class="px-4 pt-6 mx-auto max-w-7xl lg:px-8 sm:px-6">
        <div class="sm:align-center sm:flex sm:flex-col">
          <h1 class="flex mx-auto text-5xl font-extrabold text-gray-900 dark:text-white items-center justify-center">
            {{ t('usage') }}
          </h1>

          <!-- Error Alert for Non-paying Users -->
          <div v-if="failed" id="error-missconfig" class="mt-4 mb-0 bg-[#ef4444] text-white w-fit ml-auto mr-auto border-8 rounded-2xl border-[#ef4444] px-4 py-2">
            {{ t('plan-failed') }}
          </div>

          <!-- Last Update Info & Billing Cycle -->
          <div class="mt-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <div class="flex items-center justify-between">
              <!-- Last Update Info -->
              <div class="flex items-center space-x-4 text-sm text-gray-600 dark:text-gray-400">
                <div class="flex items-center space-x-2">
                  <div class="w-2 h-2 bg-green-500 rounded-full" />
                  <span>{{ lastRunDate() }}</span>
                </div>
                <div class="w-px h-4 bg-gray-300 dark:bg-gray-600" />
                <div class="flex items-center space-x-2">
                  <div class="w-2 h-2 bg-blue-500 rounded-full" />
                  <span>{{ nextRunDate() }}</span>
                </div>
              </div>

              <!-- Billing Cycle Info -->
              <div class="flex items-center text-sm font-semibold text-blue-800 dark:text-blue-200">
                <span class="mr-2 text-gray-600 dark:text-gray-400">{{ t('billing-cycle') }}:</span>
                <span>{{ planUsage?.cycle.subscription_anchor_start }}</span>
                <span class="mx-2">{{ t('to') }}</span>
                <span>{{ planUsage?.cycle.subscription_anchor_end }}</span>
              </div>
            </div>
          </div>

          <!-- Plan Information Section -->
          <div class="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <!-- Current Plan -->
            <div class="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <div class="text-sm text-gray-600 dark:text-gray-400 mb-1">
                {{ t('Current') }}
              </div>
              <div class="text-lg font-semibold text-gray-900 dark:text-white">
                {{ currentPlan?.name || t('loading') }}
              </div>
              <div v-if="currentPlan" class="text-sm text-gray-500 dark:text-gray-400 mt-1">
                ${{ currentPlan.price_m }}/{{ t('mo') }}
              </div>
            </div>

            <!-- Best Plan with Upgrade Button -->
            <div class="bg-white dark:bg-gray-900 rounded-lg border p-4" :class="shouldShowUpgrade ? 'border-blue-500 border-2 shadow-lg ring-2 ring-blue-500/20' : 'border-gray-200 dark:border-gray-700'">
              <div class="flex items-center justify-between mb-1">
                <div class="text-sm text-gray-600 dark:text-gray-400">
                  {{ t('best-plan') }}
                </div>
                <div v-if="shouldShowUpgrade" class="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-xs rounded-full font-medium">
                  {{ t('recommended') }}
                </div>
              </div>
              <div class="text-lg font-semibold text-gray-900 dark:text-white">
                {{ currentPlanSuggest?.name || t('loading') }}
              </div>
              <div v-if="currentPlanSuggest" class="mt-2">
                <div class="text-sm text-gray-500 dark:text-gray-400 mb-3">
                  ${{ currentPlanSuggest.price_m }}/{{ t('mo') }}
                </div>
                <button
                  v-if="shouldShowUpgrade"
                  class="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold rounded-lg transition-all duration-200 shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
                  @click="goToPlans"
                >
                  🚀 {{ t('plan-upgrade-v2') }}
                </button>
              </div>
            </div>
          </div>

          <!-- Usage Cards -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
            <!-- MAU Card -->
            <div class="bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
              <div class="flex items-center justify-between mb-4">
                <h3 class="text-lg font-bold text-gray-900 dark:text-white">
                  {{ t('monthly-active-users') }}
                </h3>
                <div class="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {{ planUsage?.detailPlanUsage?.mau_percent || 0 }}%
                </div>
              </div>

              <!-- Progress Bar -->
              <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 mb-4">
                <div
                  class="bg-gradient-to-r from-blue-500 to-blue-600 h-3 rounded-full transition-all duration-300"
                  :style="{ width: `${Math.min(planUsage?.detailPlanUsage?.mau_percent || 0, 100)}%` }"
                />
              </div>

              <div class="space-y-2 text-sm">
                <div class="flex justify-between">
                  <span class="text-gray-600 dark:text-gray-400">{{ t('included-in-plan') }}</span>
                  <span class="font-semibold text-gray-900 dark:text-white">
                    {{ planUsage?.currentPlan?.mau.toLocaleString() }}
                  </span>
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-600 dark:text-gray-400">{{ t('used-in-period') }}</span>
                  <span class="font-semibold text-gray-900 dark:text-white">
                    {{ planUsage?.totalMau.toLocaleString() }}
                  </span>
                </div>
                <div v-if="planUsage?.isPayAsYouGo" class="flex justify-between pt-2 border-t border-gray-200 dark:border-gray-600">
                  <span class="text-gray-600 dark:text-gray-400">{{ t('price-per-unit-above') }}</span>
                  <span class="font-semibold text-green-600 dark:text-green-400">
                    ${{ planUsage?.payg_units?.mau?.toLocaleString() }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Storage Card -->
            <div class="bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
              <div class="flex items-center justify-between mb-4">
                <h3 class="text-lg font-bold text-gray-900 dark:text-white">
                  {{ t('Storage') }}
                </h3>
                <div class="text-2xl font-bold text-purple-600 dark:text-purple-400">
                  {{ planUsage?.detailPlanUsage?.storage_percent || 0 }}%
                </div>
              </div>

              <!-- Progress Bar -->
              <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 mb-4">
                <div
                  class="bg-gradient-to-r from-purple-500 to-purple-600 h-3 rounded-full transition-all duration-300"
                  :style="{ width: `${Math.min(planUsage?.detailPlanUsage?.storage_percent || 0, 100)}%` }"
                />
              </div>

              <div class="space-y-2 text-sm">
                <div class="flex justify-between">
                  <span class="text-gray-600 dark:text-gray-400">{{ t('included-in-plan') }}</span>
                  <span class="font-semibold text-gray-900 dark:text-white">
                    {{ planUsage?.currentPlan?.storage.toLocaleString() }} GB
                  </span>
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-600 dark:text-gray-400">{{ t('used-in-period') }}</span>
                  <span class="font-semibold text-gray-900 dark:text-white">
                    {{ planUsage?.totalStorage.toLocaleString() }} GB
                  </span>
                </div>
                <div v-if="planUsage?.isPayAsYouGo" class="flex justify-between pt-2 border-t border-gray-200 dark:border-gray-600">
                  <span class="text-gray-600 dark:text-gray-400">{{ t('price-per-unit-above') }}</span>
                  <span class="font-semibold text-green-600 dark:text-green-400">
                    ${{ planUsage?.payg_units?.storage?.toLocaleString() }} GB
                  </span>
                </div>
              </div>
            </div>

            <!-- Bandwidth Card -->
            <div class="bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
              <div class="flex items-center justify-between mb-4">
                <h3 class="text-lg font-bold text-gray-900 dark:text-white">
                  {{ t('Bandwidth') }}
                </h3>
                <div class="text-2xl font-bold text-green-600 dark:text-green-400">
                  {{ planUsage?.detailPlanUsage?.bandwidth_percent || 0 }}%
                </div>
              </div>

              <!-- Progress Bar -->
              <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 mb-4">
                <div
                  class="bg-gradient-to-r from-green-500 to-green-600 h-3 rounded-full transition-all duration-300"
                  :style="{ width: `${Math.min(planUsage?.detailPlanUsage?.bandwidth_percent || 0, 100)}%` }"
                />
              </div>

              <div class="space-y-2 text-sm">
                <div class="flex justify-between">
                  <span class="text-gray-600 dark:text-gray-400">{{ t('included-in-plan') }}</span>
                  <span class="font-semibold text-gray-900 dark:text-white">
                    {{ planUsage?.currentPlan?.bandwidth.toLocaleString() }} GB
                  </span>
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-600 dark:text-gray-400">{{ t('used-in-period') }}</span>
                  <span class="font-semibold text-gray-900 dark:text-white">
                    {{ planUsage?.totalBandwidth.toLocaleString() }} GB
                  </span>
                </div>
                <div v-if="planUsage?.isPayAsYouGo" class="flex justify-between pt-2 border-t border-gray-200 dark:border-gray-600">
                  <span class="text-gray-600 dark:text-gray-400">{{ t('price-per-unit-above') }}</span>
                  <span class="font-semibold text-green-600 dark:text-green-400">
                    ${{ planUsage?.payg_units?.bandwidth?.toLocaleString() }} GB
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- Pricing Summary Card -->
          <div class="mt-8 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
            <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-4">
              {{ t('usage-title') }}
            </h3>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div class="text-center p-4 bg-white dark:bg-gray-800 rounded-lg">
                <div class="text-2xl font-bold text-gray-900 dark:text-white">
                  ${{ planUsage?.currentPlan?.price_m.toLocaleString() }}
                </div>
                <div class="text-sm text-gray-600 dark:text-gray-400">
                  {{ t('base') }}
                </div>
              </div>

              <div class="text-center p-4 bg-white dark:bg-gray-800 rounded-lg">
                <div class="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  ${{ planUsage?.totalUsagePrice.toLocaleString() }}
                </div>
                <div class="text-sm text-gray-600 dark:text-gray-400">
                  {{ t('credits-used-in-period') }}
                </div>
              </div>

              <div class="text-center p-4 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg">
                <div class="text-2xl font-bold">
                  ${{ planUsage?.totalPrice.toLocaleString() }}
                </div>
                <div class="text-sm opacity-90">
                  {{ t('usage-title') }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Loading State -->
    <div v-else class="flex items-center justify-center min-h-[60vh]">
      <div class="text-center">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
        <p class="text-gray-600 dark:text-gray-400">
          {{ t('loading') }}...
        </p>
      </div>
    </div>

    <!-- Teleport for Detailed Usage Plan Dialog -->
    <Teleport v-if="dialogStore.showDialog && dialogStore.dialogOptions?.title === t('detailed-usage-plan')" defer to="#dialog-v2-content">
      <div class="space-y-4">
        <div class="text-sm">
          <div class="font-medium text-gray-900 dark:text-white mb-2">
            {{ t('billing-cycle') }} {{ planUsage?.cycle.subscription_anchor_start }} {{ t('to') }} {{ planUsage?.cycle.subscription_anchor_end }}
          </div>

          <div class="font-medium text-gray-900 dark:text-white mb-3">
            {{ t('your-ussage') }}
          </div>

          <div class="space-y-2 text-gray-600 dark:text-gray-400">
            <div class="flex justify-between">
              <span>{{ t('mau-usage') }}</span>
              <span class="font-medium">{{ planUsage?.detailPlanUsage?.mau_percent }}%</span>
            </div>
            <div class="flex justify-between">
              <span>{{ t('bandwith-usage') }}</span>
              <span class="font-medium">{{ planUsage?.detailPlanUsage?.bandwidth_percent }}%</span>
            </div>
            <div class="flex justify-between">
              <span>{{ t('storage-usage') }}</span>
              <span class="font-medium">{{ planUsage?.detailPlanUsage?.storage_percent }}%</span>
            </div>
          </div>

          <div class="mt-4 pt-3 border-t border-gray-200 dark:border-gray-600 text-xs text-gray-500 dark:text-gray-400 whitespace-pre-line">
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
