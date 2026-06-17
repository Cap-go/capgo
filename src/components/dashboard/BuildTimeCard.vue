<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  computeLastDayEvolution,
  dayIndexInWindow,
  filterToBillingPeriod,
  getLast30DaysWindow,
  WINDOW_DAYS,
} from '~/services/buildCharts'
import { useSupabase } from '~/services/supabase'
import { useOrganizationStore } from '~/stores/organization'
import BuildTimeChart from './BuildTimeChart.vue'
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

const totalMinutes = ref(0)
const lastDayEvolution = ref(0)
const minutesPerDay = ref<number[]>([])
const isLoading = ref(true)

const hasData = computed(() => totalMinutes.value > 0)

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

    const { data, error } = await supabase
      .from('build_logs')
      .select('created_at, build_time_unit')
      .eq('app_id', props.appId)
      .gte('created_at', startDate)
      .lte('created_at', endDate)
      .order('created_at')

    if (error)
      throw error

    // Accumulate real build seconds per day, then convert to minutes for display.
    const secondsPerDay = Array.from({ length: WINDOW_DAYS }).fill(0) as number[]
    for (const row of data ?? []) {
      if (!row.created_at || row.build_time_unit == null)
        continue
      const dayIndex = dayIndexInWindow(new Date(row.created_at), last30DaysStart)
      if (dayIndex < 0 || dayIndex >= WINDOW_DAYS)
        continue
      secondsPerDay[dayIndex] += row.build_time_unit
    }

    const finalSeconds = props.useBillingPeriod
      ? filterToBillingPeriod(secondsPerDay, last30DaysStart, billingStart)
      : secondsPerDay

    const finalMinutes = finalSeconds.map(seconds => Math.round((seconds / 60) * 10) / 10)

    if (requestToken !== latestRequestToken)
      return

    minutesPerDay.value = finalMinutes
    totalMinutes.value = Math.round(finalSeconds.reduce((sum, seconds) => sum + seconds, 0) / 60)
    lastDayEvolution.value = computeLastDayEvolution(finalMinutes)
  }
  catch (error) {
    console.error('Error fetching build time stats:', error)
    if (requestToken === latestRequestToken) {
      minutesPerDay.value = []
      totalMinutes.value = 0
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
    :title="t('build-time')"
    :total="totalMinutes"
    :unit="t('minutes-unit')"
    :last-day-evolution="lastDayEvolution"
    :is-loading="isLoading"
    :has-data="hasData"
  >
    <BuildTimeChart
      :key="JSON.stringify(minutesPerDay)"
      :data="minutesPerDay"
      :use-billing-period="useBillingPeriod"
      :accumulated="accumulated"
      :app-id="appId"
    />
  </ChartCard>
</template>
