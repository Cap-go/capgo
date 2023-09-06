<script setup lang="ts">
import { computed, ref } from 'vue'
import colors from 'tailwindcss/colors'
import { useI18n } from 'vue-i18n'
import UsageCard from './UsageCard.vue'
import { useMainStore } from '~/stores/main'
import { findBestPlan, getCurrentPlanName, getPlans, getTotalStats, useSupabase } from '~/services/supabase'
import MobileStats from '~/components/MobileStats.vue'
import { getDaysInCurrentMonth } from '~/services/date'
import type { Database } from '~/types/supabase.types'
import { bytesToGb } from '~/services/conversion'

const props = defineProps({
  appId: { type: String, default: '' },
})

const plans = ref<Database['public']['Tables']['plans']['Row'][]>([])
const { t } = useI18n()

const stats = ref({
  mau: 0,
  storage: 0,
  bandwidth: 0,
} as Database['public']['Functions']['get_total_stats_v2']['Returns'][0])

const planSuggest = ref('')
const planCurrrent = ref('')
const datas = ref({
  mau: [] as number[],
  storage: [] as number[],
  bandwidth: [] as number[],
})
const supabase = useSupabase()
const isLoading = ref(true)
const main = useMainStore()

const allLimits = computed(() => {
  return plans.value.reduce((p, plan) => {
    const newP = {
      ...p,
    }
    newP.mau[plan.name] = plan.mau
    newP.storage[plan.name] = plan.storage
    newP.bandwidth[plan.name] = plan.bandwidth
    return newP
  }, {
    mau: {} as any,
    storage: {} as any,
    bandwidth: {} as any,
  })
})

async function getAppStats() {
  if (!main.user)
    return { data: [], error: 'missing user' }
  if (props.appId) {
    return supabase
      .from('app_usage')
      .select()
      .eq('app_id', props.appId)
  }
  else {
    return supabase
      .from('app_usage')
      .select()
  }
}

async function getAllStats() {
  if (!main.user?.id) {
    return
  }
  const date_id = new Date().toISOString().slice(0, 7)
  stats.value = await getTotalStats(main.user?.id, date_id)
}
async function getUsages() {
  let currentStorage = 0
  const { data, error } = await getAppStats()
  if (data && !error) {
    datas.value.mau = Array.from({ length: getDaysInCurrentMonth() }).fill(undefined) as number[]
    datas.value.storage = Array.from({ length: getDaysInCurrentMonth() }).fill(undefined) as number[]
    datas.value.bandwidth = Array.from({ length: getDaysInCurrentMonth() }).fill(undefined) as number[]
    const cycleStart = main.cycleInfo?.subscription_anchor_start
    const cycleEnd = main.cycleInfo?.subscription_anchor_end
    data.forEach((item: Database['public']['Tables']['app_usage']['Row']) => {
      if (item.created_at) {
        const createdAtDate = new Date(item.created_at)
        let notContinue = false
        // condition in which this shall not proceed with calculation
        if (cycleStart) {
          if (createdAtDate < new Date(cycleStart)) {
            notContinue = true
          }
        }
        if (cycleEnd) {
          if (createdAtDate > new Date(cycleEnd)) {
            notContinue = true
          }
        }
        // if not anything of the above, it is false and proceed
        if (!notContinue) {
          const dayNumber = createdAtDate.getDate()
          if (datas.value.mau[dayNumber]) {
            datas.value.mau[dayNumber] += item.mau
          }
          else {
            datas.value.mau[dayNumber] = item.mau
          }
          if (datas.value.storage[dayNumber]) {
            datas.value.storage[dayNumber] += item.storage ? bytesToGb(item.storage) : 0
          }
          else {
            datas.value.storage[dayNumber] = item.storage ? bytesToGb(item.storage) : 0
          }
          if (datas.value.bandwidth[dayNumber]) {
            datas.value.bandwidth[dayNumber] += item.bandwidth ? bytesToGb(item.bandwidth) : 0
          }
          else {
            datas.value.bandwidth[dayNumber] = item.bandwidth ? bytesToGb(item.bandwidth) : 0
          }
        }
      }
      // TODO: How to fix this?
      // else if (item.date_id.length === 7) {
      //   currentStorage += item.version_size ? bytesToGb(item.version_size) : 0
      // }
    })
    const storageVariance = datas.value.storage.reduce((p, c) => (p + (c || 0)), 0)
    // console.log('storageVariance', storageVariance, currentStorage)
    datas.value.storage[0] = currentStorage - storageVariance
    if (datas.value.storage[0] < 0) {
      datas.value.storage[0] = 0
    }
  }
}

async function loadData() {
  isLoading.value = true
  await getPlans().then((pls) => {
    plans.value.length = 0
    plans.value.push(...pls)
  })
  await getUsages()
  await getAllStats()
  await findBestPlan(stats.value).then(res => planSuggest.value = res)
  if (main.user?.id)
    await getCurrentPlanName(main.user?.id).then(res => planCurrrent.value = res)
  isLoading.value = false
}
loadData()
</script>

<template>
  <div class="grid grid-cols-12 gap-6 mb-6" :class="appId ? 'grid-cols-16' : ''">
    <UsageCard v-if="!isLoading" :limits="allLimits.mau" :colors="colors.emerald" :datas="datas.mau"
      :title="t('montly-active')" unit="Users" />
    <div v-else
      class="col-span-full h-[460px] flex flex-col items-center justify-center border border-slate-200 rounded-lg bg-white shadow-lg sm:col-span-6 xl:col-span-4 dark:border-slate-900 dark:bg-gray-800">
      <Spinner size="w-40 h-40" />
    </div>
    <UsageCard v-if="!isLoading" :limits="allLimits.storage" :colors="colors.blue" :datas="datas.storage"
      :title="t('Storage')" unit="GB" />
    <div v-else
      class="col-span-full h-[460px] flex flex-col items-center justify-center border border-slate-200 rounded-lg bg-white shadow-lg sm:col-span-6 xl:col-span-4 dark:border-slate-900 dark:bg-gray-800">
      <Spinner size="w-40 h-40" />
    </div>
    <UsageCard v-if="!isLoading" :limits="allLimits.bandwidth" :colors="colors.orange" :datas="datas.bandwidth"
      :title="t('Bandwidth')" unit="GB" />
    <div v-else
      class="col-span-full h-[460px] flex flex-col items-center justify-center border border-slate-200 rounded-lg bg-white shadow-lg sm:col-span-6 xl:col-span-4 dark:border-slate-900 dark:bg-gray-800">
      <Spinner size="w-40 h-40" />
    </div>
    <MobileStats v-if="appId" />
  </div>
</template>
