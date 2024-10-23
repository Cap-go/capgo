<script setup lang="ts">
import { useI18n } from 'petite-vue-i18n'
import { storeToRefs } from 'pinia'
import colors from 'tailwindcss/colors'
import { computed, ref, watch } from 'vue'
import { bytesToGb, getDaysBetweenDates, toFixed } from '~/services/conversion'
import { getDaysInCurrentMonth } from '~/services/date'
import { getPlans, getTotalAppStorage } from '~/services/supabase'
import { useMainStore } from '~/stores/main'
import type { Database } from '~/types/supabase.types'
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
  const currentStorageBytes = await getTotalAppStorage(organizationStore.currentOrganization?.gid, props.appId)
  const globalStats = await getAppStats()
  // get current day number
  const currentDate = new Date()
  const currentDay = currentDate.getDate()
  let cycleDay: number | undefined
  if (globalStats && globalStats.length > 0) {
    const cycleStart = new Date(organizationStore.currentOrganization?.subscription_start ?? new Date())
    const cycleEnd = new Date(organizationStore.currentOrganization?.subscription_end ?? new Date())

    if (cycleStart.getDate() === 1) {
      cycleDay = currentDay
    }
    else {
      const cycleStartDay = cycleStart.getDate()
      const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate()
      cycleDay = (currentDay - cycleStartDay + 1 + daysInMonth) % daysInMonth
      if (cycleDay === 0)
        cycleDay = daysInMonth
    }
    let graphDays = getDaysInCurrentMonth()

    if (cycleStart && cycleEnd)
      graphDays = getDaysBetweenDates(cycleStart.toString(), cycleEnd.toString())

    datas.value.mau = Array.from({ length: graphDays }).fill(undefined) as number[]
    datas.value.storage = Array.from({ length: graphDays }).fill(undefined) as number[]
    datas.value.bandwidth = Array.from({ length: graphDays }).fill(undefined) as number[]
    // biome-ignore lint/complexity/noForEach: <explanation>
    globalStats.forEach((item, i) => {
      if (item.date) {
        const dayNumber = i
        if (datas.value.mau[dayNumber])
          datas.value.mau[dayNumber] += item.mau
        else
          datas.value.mau[dayNumber] = item.mau

        const storageVal = bytesToGb(item.storage ?? 0, 2)
        if (datas.value.storage[dayNumber])
          datas.value.storage[dayNumber] += storageVal
        else
          datas.value.storage[dayNumber] = storageVal

        const bandwidthVal = bytesToGb(item.bandwidth ?? 0, 2)
        if (datas.value.bandwidth[dayNumber])
          datas.value.bandwidth[dayNumber] += bandwidthVal
        else
          datas.value.bandwidth[dayNumber] = bandwidthVal
      }
    })

    const storageVariance = datas.value.storage.reduce((p, c) => (p + (c || 0)), 0)
    const currentStorage = bytesToGb(currentStorageBytes, 2)
    const initValue = currentStorage - storageVariance + (datas.value.storage[0] ?? 0)

    datas.value.storage[0] = toFixed(initValue, 2)

    if (datas.value.storage[0] < 0)
      datas.value.storage[0] = 0
  }
  else {
    datas.value.mau = []
    datas.value.storage = []
    datas.value.bandwidth = []
  }
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
  <div v-if="!noData || isLoading" class="grid grid-cols-12 gap-6 mb-6" :class="appId && showMobileStats ? 'grid-cols-16' : ''">
    <!-- TODO: to reactivate when we do the new chart https://github.com/Cap-go/capgo/issues/645 <div v-if="!noData || isLoading" class="grid grid-cols-12 gap-6 mb-6" :class="appId ? 'grid-cols-16' : ''"> -->
    <UsageCard
      v-if="!isLoading" id="mau-stat" :limits="allLimits.mau" :colors="colors.emerald"
      :datas="datas.mau" :title="`${t('montly-active')}`" unit="Users"
    />
    <div
      v-else
      class="col-span-full h-[460px] flex flex-col items-center justify-center border border-slate-300 rounded-lg bg-white shadow-lg sm:col-span-6 xl:col-span-4 dark:border-slate-900 dark:bg-gray-800"
    >
      <Spinner size="w-40 h-40" />
    </div>
    <UsageCard
      v-if="!isLoading" :limits="allLimits.storage" :colors="colors.blue" :datas="datas.storage"
      :title="t('Storage')" :unit="storageUnit"
    />
    <div
      v-else
      class="col-span-full h-[460px] flex flex-col items-center justify-center border border-slate-300 rounded-lg bg-white shadow-lg sm:col-span-6 xl:col-span-4 dark:border-slate-900 dark:bg-gray-800"
    >
      <Spinner size="w-40 h-40" />
    </div>
    <UsageCard
      v-if="!isLoading" :limits="allLimits.bandwidth" :colors="colors.orange" :datas="datas.bandwidth"
      :title="t('Bandwidth')" unit="GB"
    />
    <div
      v-else
      class="col-span-full h-[460px] flex flex-col items-center justify-center border border-slate-300 rounded-lg bg-white shadow-lg sm:col-span-6 xl:col-span-4 dark:border-slate-900 dark:bg-gray-800"
    >
      <Spinner size="w-40 h-40" />
    </div>
    <MobileStats v-if="appId && showMobileStats" />
  </div>
</template>
