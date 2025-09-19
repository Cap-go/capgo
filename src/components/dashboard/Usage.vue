<script setup lang="ts">
import type { Database } from '~/types/supabase.types'
import { storeToRefs } from 'pinia'
import colors from 'tailwindcss/colors'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { bytesToGb, getDaysBetweenDates } from '~/services/conversion'
import { getPlans, useSupabase } from '~/services/supabase'
import { useMainStore } from '~/stores/main'
import { useOrganizationStore } from '~/stores/organization'
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

const datasByApp = ref({
  mau: {} as { [appId: string]: number[] },
  storage: {} as { [appId: string]: number[] },
  bandwidth: {} as { [appId: string]: number[] },
})

const appNames = ref<{ [appId: string]: string }>({})
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
  if (props.appId) {
    return {
      global: main.filterDashboard(props.appId),
      byApp: {},
      appNames: {},
    }
  }

  // Get all apps for the organization
  const organizationGid = organizationStore.currentOrganization?.gid
  if (!organizationGid) {
    return {
      global: main.dashboard,
      byApp: {},
      appNames: {},
    }
  }

  const { data: apps } = await useSupabase()
    .from('apps')
    .select('app_id, name')
    .eq('owner_org', organizationGid)

  const appNamesMap: { [appId: string]: string } = {}
  if (apps) {
    apps.forEach(app => {
      appNamesMap[app.app_id] = app.name || app.app_id
    })
  }

  return {
    global: main.dashboard,
    byApp: main.dashboardByapp,
    appNames: appNamesMap,
  }
}

async function getUsages() {
  const { global: globalStats, byApp: byAppStats, appNames: appNamesMap } = await getAppStats()
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

  // Process by-app data if available
  appNames.value = appNamesMap
  datasByApp.value.mau = {}
  datasByApp.value.storage = {}
  datasByApp.value.bandwidth = {}

  if (byAppStats && Array.isArray(byAppStats) && byAppStats.length > 0 && !props.appId) {
    // Group by app_id
    const appGroups: { [appId: string]: any[] } = {}
    byAppStats.forEach((item: any) => {
      if (!appGroups[item.app_id]) {
        appGroups[item.app_id] = []
      }
      appGroups[item.app_id].push({
        ...item,
        date: new Date(item.date),
      })
    })

    // Process each app's data
    Object.keys(appGroups).forEach((appId) => {
      datasByApp.value.mau[appId] = Array.from({ length: graphDays }).fill(undefined) as number[]
      datasByApp.value.storage[appId] = Array.from({ length: graphDays }).fill(undefined) as number[]
      datasByApp.value.bandwidth[appId] = Array.from({ length: graphDays }).fill(undefined) as number[]

      appGroups[appId].forEach((item) => {
        const index = getDaysBetweenDates(cycleStart, item.date)
        datasByApp.value.mau[appId][index] = item.mau
        datasByApp.value.storage[appId][index] = bytesToGb(item.storage ?? 0, 2)
        datasByApp.value.bandwidth[appId][index] = bytesToGb(item.bandwidth ?? 0, 2)
      })

      // Slice to current day
      datasByApp.value.mau[appId] = datasByApp.value.mau[appId].slice(0, cycleDay)
      datasByApp.value.storage[appId] = datasByApp.value.storage[appId].slice(0, cycleDay)
      datasByApp.value.bandwidth[appId] = datasByApp.value.bandwidth[appId].slice(0, cycleDay)
    })
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
  <div
    v-if="!noData || isLoading"
    class="grid grid-cols-1 sm:grid-cols-12 gap-6 mb-6"
    :class="appId && showMobileStats ? 'xl:grid-cols-16' : 'xl:grid-cols-12'"
  >
    <UsageCard
      v-if="!isLoading" id="mau-stat" :limits="allLimits.mau" :colors="colors.emerald" :accumulated="false"
      :datas="datas.mau" :datas-by-app="datasByApp.mau" :app-names="appNames" :title="`${t('monthly-active')}`" :unit="t('units-users')"
      class="col-span-full sm:col-span-6 xl:col-span-4"
    />
    <div
      v-else
      class="col-span-full h-[460px] flex flex-col items-center justify-center border border-slate-300 rounded-lg bg-white shadow-lg sm:col-span-6 xl:col-span-4 dark:border-slate-900 dark:bg-gray-800"
    >
      <Spinner size="w-40 h-40" />
    </div>
    <UsageCard
      v-if="!isLoading" :limits="allLimits.storage" :colors="colors.blue" :datas="datas.storage" :datas-by-app="datasByApp.storage" :app-names="appNames" :accumulated="false"
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
      v-if="!isLoading" :limits="allLimits.bandwidth" :colors="colors.orange" :datas="datas.bandwidth" :datas-by-app="datasByApp.bandwidth" :app-names="appNames" :accumulated="false"
      :title="t('Bandwidth')" :unit="t('units-gb')"
      class="col-span-full sm:col-span-6 xl:col-span-4"
    />
    <div
      v-else
      class="col-span-full h-[460px] flex flex-col items-center justify-center border border-slate-300 rounded-lg bg-white shadow-lg sm:col-span-6 xl:col-span-4 dark:border-slate-900 dark:bg-gray-800"
    >
      <Spinner size="w-40 h-40" />
    </div>
    <MobileStats v-if="appId && showMobileStats" class="col-span-full sm:col-span-6 xl:col-span-4" />
    <BundleUploadsCard v-if="!isLoading && !appId" class="col-span-full sm:col-span-6 xl:col-span-4" />
    <div
      v-else-if="!appId"
      class="col-span-full h-[460px] flex flex-col items-center justify-center border border-slate-300 rounded-lg bg-white shadow-lg sm:col-span-6 xl:col-span-4 dark:border-slate-900 dark:bg-gray-800"
    >
      <Spinner size="w-40 h-40" />
    </div>
  </div>
</template>
