<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import colors from 'tailwindcss/colors'
import UsageCard from './UsageCard.vue'
import { useMainStore } from '~/stores/main'
import type { Stats } from '~/services/plans'
import type { definitions } from '~/types/supabase'
import { findBestPlan, getCurrentPlanName, getPlans, useSupabase } from '~/services/supabase'

const daysInCurrentMonth = () => new Date().getDate()
const plans = ref<definitions['plans'][]>([])

const stats = ref({
  max_app: 0,
  max_channel: 0,
  max_version: 0,
  max_shared: 0,
  max_update: 0,
  max_device: 0,
} as Stats)
const planSuggest = ref('')
const planCurrrent = ref('')
const datas = ref({
  mau: [] as number[],
  storage: [] as number[],
  bandwidth: [] as number[],
})
const supabase = useSupabase()
const isLoading = ref(false)
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

const getUsages = async () => {
  // get aapp_stats
  const date_id = new Date().toISOString().slice(0, 7)
  const { data: oldStats, error: errorOldStats } = await supabase
    .rpc<Stats>('get_max_stats', { userid: main.user?.id, dateid: date_id })
    .single()
  const { data, error } = await supabase
    .from<definitions['app_stats']>('app_stats')
    .select()
    .eq('user_id', main.user?.id)
    .like('date_id', `${date_id}%`)
  if (oldStats && !errorOldStats)
    stats.value = oldStats

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

watch(
  () => plans.value,
  (myPlan, prevMyPlan) => {
    if (myPlan && !prevMyPlan) {
      loadData()
      // reGenerate annotations
      isLoading.value = false
      console.log('usage', datas.value)
    }
    else if (prevMyPlan && !myPlan) { isLoading.value = true }
  })
</script>

<template>
  <UsageCard v-if="!isLoading" :limits="allLimits.mau" :colors="colors.emerald" :datas="datas.mau" title="MAU" unit="Users" />
  <UsageCard v-if="!isLoading" :limits="allLimits.storage" :colors="colors.blue" :datas="datas.storage" title="Storage" unit="GB" />
  <UsageCard v-if="!isLoading" :limits="allLimits.bandwidth" :colors="colors.orange" :datas="datas.bandwidth" title="Bandwidth" unit="GB" />
</template>
