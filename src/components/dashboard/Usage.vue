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

const props = defineProps({
  appId: { type: String, default: '' },
})
const daysInCurrentMonth = () => new Date().getDate()
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
    console.log('appID', props.appId)
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

const getUsages = async () => {
  // get aapp_stats
  const date_id = new Date().toISOString().slice(0, 7)
  const { data: totalStats, error: errorOldStats } = await supabase
    .rpc<StatsV2>('get_total_stats', { userid: main.user?.id, dateid: date_id })
    .single()
  const { data, error } = await getAppStats()
  if (totalStats && !errorOldStats)
    stats.value = totalStats
  if (data && !error) {
    datas.value.mau = new Array(daysInCurrentMonth() + 1).fill(0)
    datas.value.storage = new Array(daysInCurrentMonth() + 1).fill(0)
    datas.value.bandwidth = new Array(daysInCurrentMonth() + 1).fill(0)
    data.forEach((item: definitions['app_stats']) => {
      if (item.date_id.length > 7) {
        const dayNumber = Number(item.date_id.slice(8))
        datas.value.mau[dayNumber] += item.devices || 0
        datas.value.storage[dayNumber] += item.version_size ? item.version_size / 1024 / 1024 / 1024 : 0
        datas.value.bandwidth[dayNumber] += item.bandwidth ? item.bandwidth / 1024 / 1024 / 1024 : 0
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
  await findBestPlan(stats.value).then(res => planSuggest.value = res)
  if (main.auth?.id)
    await getCurrentPlanName(main.auth?.id).then(res => planCurrrent.value = res)
  isLoading.value = false
}

loadData()
</script>

<template>
  <UsageCard v-if="!isLoading" :limits="allLimits.mau" :colors="colors.emerald" :datas="datas.mau" :tilte="t('MAU')" unit="Users" />
  <div v-else class="flex flex-col bg-white border rounded-sm shadow-lg col-span-full sm:col-span-6 xl:col-span-4 border-slate-200 dark:bg-gray-800 dark:border-slate-900">
    <div class="animate-spin rounded-full w-full px-3 mx-auto my-3 aspect-square border-b-2 border-cornflower-600" />
  </div>
  <UsageCard v-if="!isLoading" :limits="allLimits.storage" :colors="colors.blue" :datas="datas.storage" :title="t('Storage')" unit="GB" />
  <div v-else class="flex flex-col bg-white border rounded-sm shadow-lg col-span-full sm:col-span-6 xl:col-span-4 border-slate-200 dark:bg-gray-800 dark:border-slate-900">
    <div class="animate-spin rounded-full w-full px-3 mx-auto my-3 aspect-square border-b-2 border-cornflower-600" />
  </div>
  <UsageCard v-if="!isLoading" :limits="allLimits.bandwidth" :colors="colors.orange" :datas="datas.bandwidth" :title="t('Bandwidth')" unit="GB" />
  <div v-else class="flex flex-col bg-white border rounded-sm shadow-lg col-span-full sm:col-span-6 xl:col-span-4 border-slate-200 dark:bg-gray-800 dark:border-slate-900">
    <div class="animate-spin rounded-full w-full px-3 mx-auto my-3 aspect-square border-b-2 border-cornflower-600" />
  </div>
  <MobileStats v-if="!isLoading && appId" />
  <div v-else-if="appId" class="flex flex-col bg-white border rounded-sm shadow-lg col-span-full sm:col-span-6 xl:col-span-4 border-slate-200 dark:bg-gray-800 dark:border-slate-900">
    <div class="animate-spin rounded-full w-full px-3 mx-auto my-3 aspect-square border-b-2 border-cornflower-600" />
  </div>
</template>
