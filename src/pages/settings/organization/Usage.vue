<script setup lang="ts">
import type { Database } from '~/types/supabase.types'
import dayjs from 'dayjs'
import { useI18n } from 'petite-vue-i18n'
import { storeToRefs } from 'pinia'
import { computed, ref, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import { toast } from 'vue-sonner'
import IcBaselineInfo from '~icons/ic/baseline-info'
import { bytesToGb } from '~/services/conversion'
import { getCurrentPlanNameOrg, getPlans, getTotalStorage } from '~/services/supabase'
import { sendEvent } from '~/services/tracking'
import { useMainStore } from '~/stores/main'

const { t } = useI18n()
const plans = ref<Database['public']['Tables']['plans']['Row'][]>([])

const isLoading = ref(false)
const initialLoad = ref(true)
const route = useRoute()
const main = useMainStore()
const organizationStore = useOrganizationStore()
const displayStore = useDisplayStore()
const router = useRouter()

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

  const basePrice = currentPlan?.price_m || 0

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
    cycle: {
      subscription_anchor_start: dayjs(organizationStore.currentOrganization?.subscription_start).format('YYYY/MM/D'),
      subscription_anchor_end: dayjs(organizationStore.currentOrganization?.subscription_end).format('YYYY/MM/D'),
    },
  }
}

// const planUsageMap = ref<Map<string, Awaited<ReturnType<typeof getUsage>>>>()
const planUsageMap = ref(new Map<string, Awaited<ReturnType<typeof getUsage>>>())
const planUsage = computed(() => planUsageMap.value?.get(currentOrganization.value?.gid ?? ''))

function roundNumber(number: number) {
  return Math.round(number * 100) / 100
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

watch(currentOrganization, async (newOrg, prevOrg) => {
  // isSubscribeLoading.value.fill(true, 0, plans.value.length)
  if (
    !organizationStore.hasPermisisonsInRole(await organizationStore.getCurrentRole(newOrg?.created_by ?? ''), ['super_admin'])
    || !newOrg?.paying
  ) {
    if (!initialLoad.value) {
      const orgsMap = organizationStore.getAllOrgs()
      const newOrg = [...orgsMap]
        .map(([_, a]) => a)
        .filter(org => org.role.includes('super_admin') && org.paying)
        .sort((a, b) => b.app_count - a.app_count)[0]

      if (newOrg) {
        organizationStore.setCurrentOrganization(newOrg.gid)
        return
      }
      else {
        router.push('/app')
      }
    }

    const paying = newOrg?.paying !== undefined ? newOrg?.paying : true

    displayStore.dialogOption = {
      header: paying ? t('cannot-view-usage') : t('cannot-show'),
      message: paying ? t('usage-super-only') : t('not-paying-org-usage'),
      buttons: [
        {
          text: t('ok'),
        },
      ],
    }
    displayStore.showDialog = true
    await displayStore.onDialogDismiss()
    if (!prevOrg)
      router.push('/app')
    else
      organizationStore.setCurrentOrganization(prevOrg.gid)
  }

  await loadData()

  // isSubscribeLoading.value.fill(false, 0, plans.value.length)
})

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
          <h1 class="flex mx-auto text-5xl font-extrabold text-gray-900 dark:text-white items-center tooltip">
            {{ t('usage') }}
            <IcBaselineInfo class="w-4 h-4 cursor-pointer text-slate-400 dark:text-white" />
            <div class="tooltip-content">
              <div class="max-w-xs whitespace-normal">
                {{ lastRunDate() }}
              </div>
              <div class="max-w-xs whitespace-normal">
                {{ nextRunDate() }}
              </div>
            </div>
          </h1>

          <div class="my-2">
            <div class="flex justify-between mt-2 row">
              <div class="text-lg font-bold">
                {{ t('monthly-active-users') }}
              </div>
              <div>
                <span class="font-semibold">{{ planUsage?.cycle.subscription_anchor_start
                }}</span> {{ t('to') }} <span class="font-semibold">{{
                  planUsage?.cycle.subscription_anchor_end }}</span>
              </div>
            </div>
            <hr class="my-1 border-t-2 border-gray-300 opacity-70">
            <div class="flex justify-between mt-2 row">
              <div>
                {{ t('included-in-plan') }}
              </div>
              <div class="font-semibold">
                {{ planUsage?.currentPlan?.mau.toLocaleString() }}
              </div>
            </div>

            <hr class="my-1 border-t border-gray-300 opacity-50">
            <div class="flex justify-between row">
              <div>
                {{ t('used-in-period') }}
              </div>
              <div class="font-semibold">
                {{ planUsage?.totalMau.toLocaleString() }}
              </div>
            </div>
            <div v-if="planUsage?.isPayAsYouGo">
              <hr class="my-1 border-t border-gray-300 opacity-50">
              <div class="flex justify-between row">
                <div>
                  {{ t('price-per-unit-above') }}
                </div>
                <div class="font-semibold">
                  $ {{ planUsage?.payg_units?.mau?.toLocaleString() }}
                </div>
              </div>
            </div>
          </div>

          <div class="my-2">
            <div class="text-lg font-bold">
              {{ t('Storage') }}
            </div>
            <hr class="my-1 border-t-2 border-gray-300 opacity-70">
            <div class="flex justify-between mt-2 row">
              <div>
                {{ t('included-in-plan') }}
              </div>
              <div class="font-semibold">
                {{ planUsage?.currentPlan?.storage.toLocaleString() }} GB
              </div>
            </div>

            <hr class="my-1 border-t border-gray-300 opacity-50">
            <div class="flex justify-between row">
              <div>
                {{ t('used-in-period') }}
              </div>
              <div class="font-semibold">
                {{ planUsage?.totalStorage.toLocaleString() }} GB
              </div>
            </div>
            <div v-if="planUsage?.isPayAsYouGo">
              <hr class="my-1 border-t border-gray-300 opacity-50">
              <div class="flex justify-between row">
                <div>
                  {{ t('price-per-unit-above') }}
                </div>
                <div class="font-semibold">
                  $ {{ planUsage?.payg_units?.storage?.toLocaleString() }} GB
                </div>
              </div>
            </div>
          </div>

          <div class="my-2">
            <div class="text-lg font-bold">
              {{ t('Bandwidth') }}
            </div>
            <hr class="my-1 border-t-2 border-gray-300 opacity-70">
            <div class="flex justify-between mt-2 row">
              <div>
                {{ t('included-in-plan') }}
              </div>
              <div class="font-semibold">
                {{ planUsage?.currentPlan?.bandwidth.toLocaleString() }} GB
              </div>
            </div>

            <hr class="my-1 border-t border-gray-300 opacity-50">
            <div class="flex justify-between row">
              <div>
                {{ t('used-in-period') }}
              </div>
              <div class="font-semibold">
                {{ planUsage?.totalBandwidth.toLocaleString() }} GB
              </div>
            </div>
            <div v-if="planUsage?.isPayAsYouGo">
              <hr class="my-1 border-t border-gray-300 opacity-50">
              <div class="flex justify-between row">
                <div>
                  {{ t('price-per-unit-above') }}
                </div>
                <div class="font-semibold">
                  $ {{ planUsage?.payg_units?.bandwidth?.toLocaleString() }} GB
                </div>
              </div>
            </div>
          </div>
          <div class="my-2">
            <div class="text-lg font-bold">
              {{ t('usage-title') }}
            </div>
            <hr class="my-1 border-t-2 border-gray-300 opacity-70">
            <div class="flex justify-between mt-2 row">
              <div>
                {{ t('base') }}
              </div>
              <div class="font-semibold">
                $ {{ planUsage?.currentPlan?.price_m.toLocaleString() }}
              </div>
            </div>

            <div v-if="planUsage?.isPayAsYouGo">
              <hr class="my-1 border-t border-gray-300 opacity-50">
              <div class="flex justify-between row">
                <div>
                  {{ t('used-in-period') }}
                </div>
                <div class="font-semibold">
                  $ {{ planUsage?.totalUsagePrice.toLocaleString() }}
                </div>
              </div>
              <hr class="my-1 border-t border-gray-300 opacity-50">
              <div class="flex justify-between row">
                <div>
                  {{ t('usage-title') }}
                </div>
                <div class="font-semibold">
                  $ {{ planUsage?.totalPrice.toLocaleString() }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
        </route>
