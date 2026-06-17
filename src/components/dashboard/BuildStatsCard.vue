<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  bucketBuildStatus,
  BUILD_SERIES_KEYS,
  buildSeriesKey,
  computeLastDayEvolution,
  dayIndexInWindow,
  emptyBuildSeries,
  filterToBillingPeriod,
  getLast30DaysWindow,
  WINDOW_DAYS,
} from '~/services/buildCharts'
import { useSupabase } from '~/services/supabase'
import { useOrganizationStore } from '~/stores/organization'
import BuildStatsChart from './BuildStatsChart.vue'
import ChartCard from './ChartCard.vue'

const props = defineProps({
  appId: { type: String, default: '' },
  useBillingPeriod: { type: Boolean, default: true },
  accumulated: { type: Boolean, default: false },
  reloadTrigger: { type: Number, default: 0 },
})

const { t } = useI18n()
const supabase = useSupabase()
const organizationStore = useOrganizationStore()
let latestRequestToken = 0

const totalBuilds = ref(0)
const lastDayEvolution = ref(0)
const dataBySeries = ref<Record<string, number[]>>(emptyBuildSeries())
const isLoading = ref(true)

const hasData = computed(() => totalBuilds.value > 0)

async function calculateStats() {
  const startTime = Date.now()
  const requestToken = ++latestRequestToken
  isLoading.value = true

  try {
    if (!organizationStore.currentOrganization)
      await organizationStore.awaitInitialLoad()

    const billingStart = new Date(organizationStore.currentOrganization?.subscription_start ?? new Date())
    billingStart.setHours(0, 0, 0, 0)

    const { last30DaysStart, last30DaysEnd } = getLast30DaysWindow()
    const startDate = last30DaysStart.toISOString().split('T')[0]
    const endDate = last30DaysEnd.toISOString().split('T')[0]

    const { data, error } = await supabase
      .from('build_requests')
      .select('created_at, platform, status')
      .eq('app_id', props.appId)
      .gte('created_at', startDate)
      .lte('created_at', endDate)
      .order('created_at')

    if (error)
      throw error

    const series = emptyBuildSeries()
    const dailyTriggered = Array.from({ length: WINDOW_DAYS }).fill(0) as number[]

    for (const row of data ?? []) {
      if (!row.created_at)
        continue
      const dayIndex = dayIndexInWindow(new Date(row.created_at), last30DaysStart)
      if (dayIndex < 0 || dayIndex >= WINDOW_DAYS)
        continue

      dailyTriggered[dayIndex] += 1

      const outcome = bucketBuildStatus(row.status)
      if (!outcome)
        continue
      const key = buildSeriesKey(row.platform, outcome)
      if (key)
        series[key][dayIndex] += 1
    }

    let finalSeries = series
    let finalDailyTriggered = dailyTriggered

    if (props.useBillingPeriod) {
      const filtered = emptyBuildSeries(0) as Record<string, number[]>
      for (const key of BUILD_SERIES_KEYS)
        filtered[key] = filterToBillingPeriod(series[key], last30DaysStart, billingStart)
      finalSeries = filtered as typeof series
      finalDailyTriggered = filterToBillingPeriod(dailyTriggered, last30DaysStart, billingStart)
    }

    if (requestToken !== latestRequestToken)
      return

    dataBySeries.value = finalSeries
    totalBuilds.value = finalDailyTriggered.reduce((sum, count) => sum + count, 0)
    lastDayEvolution.value = computeLastDayEvolution(finalDailyTriggered)
  }
  catch (error) {
    console.error('Error fetching build stats:', error)
    if (requestToken === latestRequestToken) {
      dataBySeries.value = emptyBuildSeries()
      totalBuilds.value = 0
      lastDayEvolution.value = 0
    }
  }
  finally {
    if (requestToken === latestRequestToken) {
      const elapsed = Date.now() - startTime
      if (elapsed < 300)
        await new Promise(resolve => setTimeout(resolve, 300 - elapsed))
      isLoading.value = false
    }
  }
}

watch(() => props.appId, async () => {
  await calculateStats()
})
watch(() => props.useBillingPeriod, async () => {
  await calculateStats()
})
watch(() => organizationStore.currentOrganization?.gid, async (newOrgId, oldOrgId) => {
  if (newOrgId && oldOrgId && newOrgId !== oldOrgId)
    await calculateStats()
})
watch(() => props.reloadTrigger, async (newVal) => {
  if (newVal > 0)
    await calculateStats()
})

onMounted(async () => {
  await calculateStats()
})
</script>

<template>
  <ChartCard
    :title="t('build-statistics')"
    :total="totalBuilds"
    :unit="t('builds')"
    :last-day-evolution="lastDayEvolution"
    :is-loading="isLoading"
    :has-data="hasData"
  >
    <BuildStatsChart
      :key="JSON.stringify(dataBySeries)"
      :data-by-series="dataBySeries"
      :use-billing-period="useBillingPeriod"
      :accumulated="accumulated"
    />
  </ChartCard>
</template>
