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
import { bytesToGb, octetsToGb } from '~/services/conversion'

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
  const cycleStart = main.cycleInfo?.subscription_anchor_start ? new Date(main.cycleInfo?.subscription_anchor_start) : null
  const cycleEnd = main.cycleInfo?.subscription_anchor_end ? new Date(main.cycleInfo?.subscription_anchor_end) : null
  if (props.appId) {
    if (cycleStart && cycleEnd) {
      return supabase
        .from('app_usage')
        .select()
        .eq('app_id', props.appId)
        .eq('mode', 'day')
        .gte('created_at', cycleStart.toISOString())
        .lte('created_at', cycleEnd.toISOString())
    }
    return supabase
      .from('app_usage')
      .select()
      .eq('app_id', props.appId)
      .eq('mode', 'day')
  }
  else {
    if (cycleStart && cycleEnd) {
      return supabase
        .from('app_usage')
        .select()
        .eq('mode', 'day')
        .gte('created_at', cycleStart.toISOString())
        .lte('created_at', cycleEnd.toISOString())
    }
    return supabase
      .from('app_usage')
      .select()
      .eq('mode', 'day')
  }
}

function getDaysBetweenDates(date1: string | Date, date2: string | Date) {
  const oneDay = 24 * 60 * 60 * 1000
  const firstDate = new Date(date1)
  const secondDate = new Date(date2)
  return Math.round(Math.abs((firstDate.valueOf() - secondDate.valueOf()) / oneDay))
}

async function getAllStats() {
  if (!main.user?.id)
    return

  const date_id = new Date().toISOString().slice(0, 7)
  stats.value = await getTotalStats(main.user?.id, date_id)
}

async function getUsages() {
  const currentStorage = 0
  const { data, error } = await getAppStats()
  if (data && !error) {
    const cycleStart = main.cycleInfo?.subscription_anchor_start ? new Date(main.cycleInfo?.subscription_anchor_start) : null
    const cycleEnd = main.cycleInfo?.subscription_anchor_end ? new Date(main.cycleInfo?.subscription_anchor_end) : null
    let graphDays = getDaysInCurrentMonth()
    if (cycleStart && cycleEnd)
      graphDays = getDaysBetweenDates(cycleStart.toString(), cycleEnd.toString())

    datas.value.mau = Array.from({ length: graphDays }).fill(undefined) as number[]
    datas.value.storage = Array.from({ length: graphDays }).fill(undefined) as number[]
    datas.value.bandwidth = Array.from({ length: graphDays }).fill(undefined) as number[]
    data.forEach((item: Database['public']['Tables']['app_usage']['Row']) => {
      if (item.created_at) {
        const createdAtDate = new Date(item.created_at)

        const dayNumber = createdAtDate.getDate()
        if (datas.value.mau[dayNumber])
          datas.value.mau[dayNumber] += item.mau

        else
          datas.value.mau[dayNumber] = item.mau

        if (datas.value.storage[dayNumber])
          datas.value.storage[dayNumber] += item.storage ? bytesToGb(item.storage) : 0

        else
          datas.value.storage[dayNumber] = item.storage ? bytesToGb(item.storage) : 0

        if (datas.value.bandwidth[dayNumber])
          datas.value.bandwidth[dayNumber] += item.bandwidth ? octetsToGb(item.bandwidth) : 0

        else
          datas.value.bandwidth[dayNumber] = item.bandwidth ? octetsToGb(item.bandwidth) : 0
      }
      // TODO: How to fix this?
      // else if (item.date_id.length === 7) {
      //   currentStorage += item.version_size ? bytesToGb(item.version_size) : 0
      // }
    })
    const storageVariance = datas.value.storage.reduce((p, c) => (p + (c || 0)), 0)
    // console.log('storageVariance', storageVariance, currentStorage)
    datas.value.storage[0] = currentStorage - storageVariance
    if (datas.value.storage[0] < 0)
      datas.value.storage[0] = 0
  }
  datas.value.mau = datas.value.mau.filter(i => i)
  datas.value.storage = datas.value.storage.filter(i => i)
  datas.value.bandwidth = datas.value.bandwidth.filter(i => i)
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
    <UsageCard
      v-if="!isLoading" :limits="allLimits.mau" :colors="colors.emerald" :datas="datas.mau"
      :title="t('montly-active')" unit="Users"
    />
    <div
      v-else
      class="col-span-full h-[460px] flex flex-col items-center justify-center border border-slate-200 rounded-lg bg-white shadow-lg sm:col-span-6 xl:col-span-4 dark:border-slate-900 dark:bg-gray-800"
    >
      <Spinner size="w-40 h-40" />
    </div>
    <UsageCard
      v-if="!isLoading" :limits="allLimits.storage" :colors="colors.blue" :datas="datas.storage"
      :title="t('Storage')" unit="GB"
    />
    <div
      v-else
      class="col-span-full h-[460px] flex flex-col items-center justify-center border border-slate-200 rounded-lg bg-white shadow-lg sm:col-span-6 xl:col-span-4 dark:border-slate-900 dark:bg-gray-800"
    >
      <Spinner size="w-40 h-40" />
    </div>
    <UsageCard
      v-if="!isLoading" :limits="allLimits.bandwidth" :colors="colors.orange" :datas="datas.bandwidth"
      :title="t('Bandwidth')" unit="GB"
    />
    <div
      v-else
      class="col-span-full h-[460px] flex flex-col items-center justify-center border border-slate-200 rounded-lg bg-white shadow-lg sm:col-span-6 xl:col-span-4 dark:border-slate-900 dark:bg-gray-800"
    >
      <Spinner size="w-40 h-40" />
    </div>
    <MobileStats v-if="appId" />
  </div>
</template>
