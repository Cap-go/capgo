<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed, ref, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import { toast } from 'vue-sonner'
import dayjs from 'dayjs'
import { useMainStore } from '~/stores/main'
import { getCurrentPlanName, getPlans, getTotalStorage } from '~/services/supabase'
import { useLogSnag } from '~/services/logsnag'
import type { Database } from '~/types/supabase.types'
import { bytesToGb } from '~/services/conversion'

const { t } = useI18n()
const plans = ref<Database['public']['Tables']['plans']['Row'][]>([])

const snag = useLogSnag()
const isLoading = ref(false)
const route = useRoute()
const main = useMainStore()

watchEffect(async () => {
  if (route.path === '/dashboard/settings/plans') {
    // if session_id is in url params show modal success plan setup
    if (route.query.session_id) {
      toast.success(t('usage-success'))
    }
    else if (main.user?.id) {
      snag.track({
        channel: 'usage',
        event: 'User visit',
        icon: '💳',
        user_id: main.user.id,
        notify: false,
      }).catch()
    }
  }
})

async function getUsage() {
  const usage = main.dashboard

  const plan = plans.value.find(p => p.name === 'Pay as you go')!
  const planCurrrent = await getCurrentPlanName(main.auth?.id)
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
  const totalStorage = bytesToGb(await getTotalStorage(main.auth?.id))
  let totalBandwidth = 0

  usage?.forEach((item) => {
    totalMau += item.mau
    // totalStorage += bytesToGb(item.storage_added) - bytesToGb(item.storage_deleted)
    totalBandwidth += bytesToGb(item.bandwidth)
  })

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
  }
}

function roundNumber(number: number) {
  return Math.round(number * 100) / 100
}

const planUsage = ref<Awaited<ReturnType<typeof getUsage>>>()

async function loadData() {
  isLoading.value = true
  await getPlans().then((pls) => {
    plans.value.length = 0
    plans.value.push(...pls)
  })
  getUsage().then((res) => {
    planUsage.value = res
  })
  isLoading.value = false
}
loadData()
</script>

<template>
  <div v-if="!isLoading" class="w-full h-full bg-white max-h-fit dark:bg-gray-800">
    <div class="px-4 pt-6 mx-auto max-w-7xl lg:px-8 sm:px-6">
      <div class="sm:align-center sm:flex sm:flex-col">
        <h1 class="text-5xl font-extrabold text-gray-900 sm:text-center dark:text-white">
          {{ t('usage') }}
        </h1>

        <div class="my-2">
          <div class="flex justify-between mt-2 row">
            <div class="text-lg font-bold">
              {{ t('monthly-active-users') }}
            </div>
            <div>
              <span class="font-semibold">{{ dayjs(main.cycleInfo?.subscription_anchor_start).format('YYYY/MM/D') }}</span> {{ t('to') }} <span class="font-semibold">{{ dayjs(main.cycleInfo?.subscription_anchor_end).format('YYYY/MM/D') }}</span>
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
</template>

<route lang="yaml">
meta:
  layout: settings
        </route>
