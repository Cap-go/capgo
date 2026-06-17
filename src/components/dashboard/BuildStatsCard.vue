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

const emit = defineEmits<{ 'update:loading': [value: boolean] }>()

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

    const targetOrg = organizationStore.getOrgByAppId(props.appId) ?? organizationStore.currentOrganization
    const billingStart = new Date(targetOrg?.subscription_start ?? new Date())
    billingStart.setHours(0, 0, 0, 0)

    const { last30DaysStart, last30DaysEnd } = getLast30DaysWindow()
    const startDate = last30DaysStart.toISOString()
    const endDate = last30DaysEnd.toISOString()

    // Paginate so apps with more than Supabase's max_rows cap are not undercounted.
    const PAGE_SIZE = 1000
    const rows: { created_at: string | null, platform: string | null, status: string | null }[] = []
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await supabase
        .from('build_requests')
        .select('created_at, platform, status')
        .eq('app_id', props.appId)
        .gte('created_at', startDate)
        .lte('created_at', endDate)
        .order('created_at')
        .range(offset, offset + PAGE_SIZE - 1)

      if (error)
        throw error
      if (!data || data.length === 0)
        break
      rows.push(...data)
      if (data.length < PAGE_SIZE)
        break
    }

    const series = emptyBuildSeries()
    const dailyTriggered = Array.from({ length: WINDOW_DAYS }).fill(0) as number[]

    for (const row of rows) {
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
      const filtered: Record<string, number[]> = {}
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

watch(isLoading, value => emit('update:loading', value), { immediate: true })

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
      :key="`${appId}:${JSON.stringify(dataBySeries)}`"
      :data-by-series="dataBySeries"
      :use-billing-period="useBillingPeriod"
      :accumulated="accumulated"
      :app-id="appId"
    />
  </ChartCard>
</template>
