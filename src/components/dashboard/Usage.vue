<script setup lang="ts">
import { computed, ref } from 'vue'
import colors from 'tailwindcss/colors'
import { useI18n } from 'vue-i18n'
import UsageCard from './UsageCard.vue'
import { useMainStore } from '~/stores/main'
import type { StatsV2 } from '~/services/plans'
import type { definitions } from '~/types/supabase'
import { findBestPlan, getCurrentPlanName, getPlans, useSupabase } from '~/services/supabase'
import MobileStats from '~/components/MobileStats.vue'
import { getDaysInCurrentMonth } from '~/services/date'

const props = defineProps({
  appId: { type: String, default: '' },
})

const plans = ref<definitions['plans'][]>([])
const { t } = useI18n()

const stats = ref({
  mau: 0,
  storage: 0,
  bandwidth: 0,
} as StatsV2)
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

const getAppStats = async () => {
  const date_id = new Date().toISOString().slice(0, 7)
  if (props.appId) {
    // console.log('appID', props.appId)
    return supabase
      .from<definitions['app_stats']>('app_stats')
      .select()
      .eq('user_id', main.user?.id)
      .eq('app_id', props.appId)
      .like('date_id', `${date_id}%`)
  }
  else {
    return supabase
      .from<definitions['app_stats']>('app_stats')
      .select()
      .eq('user_id', main.user?.id)
      .like('date_id', `${date_id}%`)
  }
}

const getTotalStats = async () => {
  const date_id = new Date().toISOString().slice(0, 7)
  const { data: totalStats, error: errorOldStats } = await supabase
    .rpc<StatsV2>('get_total_stats', { userid: main.user?.id, dateid: date_id })
    .single()
  if (totalStats && !errorOldStats)
    stats.value = totalStats
}
const getUsages = async () => {
  const { data, error } = await getAppStats()
  if (data && !error) {
    datas.value.mau = new Array(getDaysInCurrentMonth() + 1).fill(undefined)
    datas.value.storage = new Array(getDaysInCurrentMonth() + 1).fill(undefined)
    datas.value.bandwidth = new Array(getDaysInCurrentMonth() + 1).fill(undefined)
    data.forEach((item: definitions['app_stats']) => {
      if (item.date_id.length > 7) {
        const dayNumber = Number(item.date_id.slice(8)) - 1
        if (datas.value.mau[dayNumber])
          datas.value.mau[dayNumber] += item.devices || 0
        else
          datas.value.mau[dayNumber] = item.devices || 0
        if (datas.value.storage[dayNumber])
          datas.value.storage[dayNumber] += item.version_size ? item.version_size / 1024 / 1024 / 1024 : 0
        else
          datas.value.storage[dayNumber] = item.version_size ? item.version_size / 1024 / 1024 / 1024 : 0
        if (datas.value.bandwidth[dayNumber])
          datas.value.bandwidth[dayNumber] += item.bandwidth ? item.bandwidth / 1024 / 1024 / 1024 : 0
        else
          datas.value.bandwidth[dayNumber] = item.bandwidth ? item.bandwidth / 1024 / 1024 / 1024 : 0
      }
    })
  }
}

const loadData = async () => {
  isLoading.value = true
  await getPlans().then((pls) => {
    plans.value.length = 0
    plans.value.push(...pls)
  })
  await getUsages()
  await getTotalStats()
  await findBestPlan(stats.value).then(res => planSuggest.value = res)
  if (main.auth?.id)
    await getCurrentPlanName(main.auth?.id).then(res => planCurrrent.value = res)
  isLoading.value = false
}

loadData()
</script>

<template>
  <UsageCard v-if="!isLoading" :limits="allLimits.mau" :colors="colors.emerald" :datas="datas.mau" :title="t('MAU')" unit="Users" />
  <div v-else class="flex flex-col h-[615px] bg-white border rounded-sm shadow-lg col-span-full sm:col-span-6 xl:col-span-4 border-slate-200 dark:bg-gray-800 dark:border-slate-900">
    <div class="w-1/2 mx-auto my-auto border-b-2 rounded-full animate-spin aspect-square border-cornflower-600" />
  </div>
  <UsageCard v-if="!isLoading" :limits="allLimits.storage" :colors="colors.blue" :datas="datas.storage" :title="t('Storage')" unit="GB" />
  <div v-else class="flex flex-col h-[615px] bg-white border rounded-sm shadow-lg col-span-full sm:col-span-6 xl:col-span-4 border-slate-200 dark:bg-gray-800 dark:border-slate-900">
    <div class="w-1/2 mx-auto my-auto border-b-2 rounded-full animate-spin aspect-square border-cornflower-600" />
  </div>
  <UsageCard v-if="!isLoading" :limits="allLimits.bandwidth" :colors="colors.orange" :datas="datas.bandwidth" :title="t('Bandwidth')" unit="GB" />
  <div v-else class="flex flex-col h-[615px] bg-white border rounded-sm shadow-lg col-span-full sm:col-span-6 xl:col-span-4 border-slate-200 dark:bg-gray-800 dark:border-slate-900">
    <div class="w-1/2 mx-auto my-auto border-b-2 rounded-full animate-spin aspect-square border-cornflower-600" />
  </div>
  <MobileStats v-if="!isLoading && appId" />
  <div v-else-if="appId" class="flex flex-col h-[615px] bg-white border rounded-sm shadow-lg col-span-full sm:col-span-6 xl:col-span-4 border-slate-200 dark:bg-gray-800 dark:border-slate-900">
    <div class="w-1/2 mx-auto my-auto border-b-2 rounded-full animate-spin aspect-square border-cornflower-600" />
  </div>
</template>
