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

const getAppStats = async () => {
  const date_id = new Date().toISOString().slice(0, 7)
  if (props.appId) {
    // console.log('appID', props.appId)
    return supabase
      .from('app_stats')
      .select()
      .eq('user_id', main.user?.id)
      .eq('app_id', props.appId)
      .like('date_id', `${date_id}%`)
  }
  else {
    return supabase
      .from('app_stats')
      .select()
      .eq('user_id', main.user?.id)
      .like('date_id', `${date_id}%`)
  }
}

const getAllStats = async () => {
  // get aapp_stats
  if (!main.user?.id)
    return
  const date_id = new Date().toISOString().slice(0, 7)
  stats.value = await getTotalStats(main.user?.id, date_id)
}
const getUsages = async () => {
  const { data, error } = await getAppStats()
  if (data && !error) {
    datas.value.mau = new Array(getDaysInCurrentMonth()).fill(undefined)
    datas.value.storage = new Array(getDaysInCurrentMonth()).fill(undefined)
    datas.value.bandwidth = new Array(getDaysInCurrentMonth()).fill(undefined)
    let currentStorage = 0
    data.forEach((item: Database['public']['Tables']['app_stats']['Row']) => {
      if (item.date_id.length > 7) {
        const dayNumber = Number(item.date_id.slice(8)) - 1
        if (datas.value.mau[dayNumber])
          datas.value.mau[dayNumber] += item.devices || 0
        else
          datas.value.mau[dayNumber] = item.devices || 0
        if (datas.value.storage[dayNumber])
          datas.value.storage[dayNumber] += item.version_size ? bytesToGb(item.version_size) : 0
        else
          datas.value.storage[dayNumber] = item.version_size ? bytesToGb(item.version_size) : 0
        if (datas.value.bandwidth[dayNumber])
          datas.value.bandwidth[dayNumber] += item.bandwidth ? bytesToGb(item.bandwidth) : 0
        else
          datas.value.bandwidth[dayNumber] = item.bandwidth ? bytesToGb(item.bandwidth) : 0
      }
      else if (item.date_id.length === 7) {
        currentStorage += item.version_size ? bytesToGb(item.version_size) : 0
      }
    })
    const storageVariance = datas.value.storage.reduce((p, c) => (p + (c || 0)), 0)
    // console.log('storageVariance', storageVariance, currentStorage)
    datas.value.storage[0] = currentStorage - storageVariance
    if (datas.value.storage[0] < 0)
      datas.value.storage[0] = 0
  }
}

const loadData = async () => {
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
    <UsageCard v-if="!isLoading" :limits="allLimits.mau" :colors="colors.emerald" :datas="datas.mau" :title="t('montly-active')" unit="Users" />
    <div v-else class="flex flex-col h-[460px] items-center justify-center bg-white border rounded-lg shadow-lg col-span-full sm:col-span-6 xl:col-span-4 border-slate-200 dark:bg-gray-800 dark:border-slate-900">
      <Spinner size="w-40 h-40" />
    </div>
    <UsageCard v-if="!isLoading" :limits="allLimits.storage" :colors="colors.blue" :datas="datas.storage" :title="t('Storage')" unit="GB" />
    <div v-else class="flex flex-col h-[460px] items-center justify-center bg-white border rounded-lg shadow-lg col-span-full sm:col-span-6 xl:col-span-4 border-slate-200 dark:bg-gray-800 dark:border-slate-900">
      <Spinner size="w-40 h-40" />
    </div>
    <UsageCard v-if="!isLoading" :limits="allLimits.bandwidth" :colors="colors.orange" :datas="datas.bandwidth" :title="t('Bandwidth')" unit="GB" />
    <div v-else class="flex flex-col h-[460px] items-center justify-center bg-white border rounded-lg shadow-lg col-span-full sm:col-span-6 xl:col-span-4 border-slate-200 dark:bg-gray-800 dark:border-slate-900">
      <Spinner size="w-40 h-40" />
    </div>
    <MobileStats v-if="appId" />
  </div>
</template>
