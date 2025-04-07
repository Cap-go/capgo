<script setup lang="ts">
import type { Database } from '~/types/supabase.types'
import { useI18n } from 'petite-vue-i18n'
import { storeToRefs } from 'pinia'
import colors from 'tailwindcss/colors'
import { computed, ref, watch } from 'vue'
import { bytesToGb, getDaysBetweenDates } from '~/services/conversion'
import { getPlans } from '~/services/supabase'
import { useMainStore } from '~/stores/main'
import UsageCard from './UsageCard.vue'

const props = defineProps<{
  appId?: string
  showMobileStats?: boolean
}>()

const plans = ref<Database['public']['Tables']['plans']['Row'][]>([])
const { t } = useI18n()

const noData = computed(() => false)
const loadedAlready = ref(false)
const storageDisplayGb = ref(true)
const storageUnit = computed(() => storageDisplayGb.value ? 'GB' : 'MB')
// const noData = computed(() => datas.value.mau.length == 0)

const datas = ref({
  mau: [] as number[],
  storage: [] as number[],
  bandwidth: [] as number[],
})
const isLoading = ref(true)
const main = useMainStore()
const organizationStore = useOrganizationStore()

const { dashboard } = storeToRefs(main)

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
  if (props.appId)
    return main.filterDashboard(props.appId)

  return main.dashboard
}

async function getUsages() {
  const globalStats = await getAppStats()
  const cycleStart = new Date(organizationStore.currentOrganization?.subscription_start ?? new Date())

  const cycleEnd = new Date(organizationStore.currentOrganization?.subscription_end ?? new Date())
  const currentDate = new Date()
  const currentDay = currentDate.getDate()
  let cycleDay: number | undefined

  if (cycleStart.getDate() === 1) {
    cycleDay = currentDay
  }
  else {
    const cycleStartDay = cycleStart.getUTCDate()
    const daysInMonth = new Date(Date.UTC(currentDate.getUTCFullYear(), currentDate.getUTCMonth() + 1, 0)).getUTCDate()
    cycleDay = (currentDate.getUTCDate() - cycleStartDay + 1 + daysInMonth) % daysInMonth
    if (cycleDay === 0)
      cycleDay = daysInMonth
  }

  const finalData = globalStats.map((item: any) => {
    return {
      ...item,
      date: new Date(item.date),
    } as { mau: number, storage: number, bandwidth: number, date: Date }
  })

  const graphDays = getDaysBetweenDates(cycleStart.toString(), cycleEnd.toString())
  datas.value.mau = Array.from({ length: graphDays }).fill(undefined) as number[]
  datas.value.storage = Array.from({ length: graphDays }).fill(undefined) as number[]
  datas.value.bandwidth = Array.from({ length: graphDays }).fill(undefined) as number[]

  finalData.forEach((item) => {
    const index = getDaysBetweenDates(cycleStart, item.date)
    datas.value.mau[index] = item.mau
    datas.value.storage[index] = bytesToGb(item.storage ?? 0, 2)
    datas.value.bandwidth[index] = bytesToGb(item.bandwidth ?? 0, 2)
  })

  // slice the lenght of the array to the current day
  datas.value.mau = datas.value.mau.slice(0, cycleDay)
  datas.value.storage = datas.value.storage.slice(0, cycleDay)
  datas.value.bandwidth = datas.value.bandwidth.slice(0, cycleDay)
}

async function loadData() {
  isLoading.value = true

  await getPlans().then((pls) => {
    plans.value.length = 0
    plans.value.push(...pls)
  })
  await getUsages()
  isLoading.value = false
}

watch(dashboard, async (_dashboard) => {
  if (loadedAlready.value) {
    await getUsages()
  }
  else {
    loadedAlready.value = true
    await loadData()
  }
})

if (main.dashboardFetched)
  loadData()
</script>

<template>
  <div
    v-if="!noData || isLoading"
    class="grid grid-cols-1 sm:grid-cols-12 gap-6 mb-6"
    :class="appId && showMobileStats ? 'xl:grid-cols-16' : 'xl:grid-cols-12'"
  >
    <UsageCard
      v-if="!isLoading" id="mau-stat" :limits="allLimits.mau" :colors="colors.emerald" :accumulated="false"
      :datas="datas.mau" :title="`${t('montly-active')}`" unit="Users"
      class="col-span-full sm:col-span-6 xl:col-span-4"
    />
    <div
      v-else
      class="col-span-full h-[460px] flex flex-col items-center justify-center border border-slate-300 rounded-lg bg-white shadow-lg sm:col-span-6 xl:col-span-4 dark:border-slate-900 dark:bg-gray-800"
    >
      <Spinner size="w-40 h-40" />
    </div>
    <UsageCard
      v-if="!isLoading" :limits="allLimits.storage" :colors="colors.blue" :datas="datas.storage" :accumulated="false"
      :title="t('Storage')" :unit="storageUnit"
      class="col-span-full sm:col-span-6 xl:col-span-4"
    />
    <div
      v-else
      class="col-span-full h-[460px] flex flex-col items-center justify-center border border-slate-300 rounded-lg bg-white shadow-lg sm:col-span-6 xl:col-span-4 dark:border-slate-900 dark:bg-gray-800"
    >
      <Spinner size="w-40 h-40" />
    </div>
    <UsageCard
      v-if="!isLoading" :limits="allLimits.bandwidth" :colors="colors.orange" :datas="datas.bandwidth" :accumulated="false"
      :title="t('Bandwidth')" unit="GB"
      class="col-span-full sm:col-span-6 xl:col-span-4"
    />
    <div
      v-else
      class="col-span-full h-[460px] flex flex-col items-center justify-center border border-slate-300 rounded-lg bg-white shadow-lg sm:col-span-6 xl:col-span-4 dark:border-slate-900 dark:bg-gray-800"
    >
      <Spinner size="w-40 h-40" />
    </div>
    <MobileStats v-if="appId && showMobileStats" class="col-span-full sm:col-span-6 xl:col-span-4" />
  </div>
</template>
