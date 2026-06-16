<route lang="yaml">
meta:
  layout: admin
</route>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import AdminFilterBar from '~/components/admin/AdminFilterBar.vue'
import AdminMultiLineChart from '~/components/admin/AdminMultiLineChart.vue'
import AdminStatsCard from '~/components/admin/AdminStatsCard.vue'
import ChartCard from '~/components/dashboard/ChartCard.vue'
import Spinner from '~/components/Spinner.vue'
import { useAdminDashboardStore } from '~/stores/adminDashboard'
import { useDisplayStore } from '~/stores/display'
import { useMainStore } from '~/stores/main'

interface GlobalStatsTrendPoint {
  date: string
  paying: number
  builds_total: number
  builds_ios: number
  builds_android: number
  builds_success_total: number
  builds_success_ios: number
  builds_success_android: number
  builds_last_month: number
  builds_last_month_ios: number
  builds_last_month_android: number
  build_total_seconds_day_ios: number
  build_total_seconds_day_android: number
  build_avg_seconds_day_ios: number
  build_avg_seconds_day_android: number
  build_count_day_ios: number
  build_count_day_android: number
  builder_active_paying_clients_60d: number
  live_updates_active_paying_clients_60d: number
  build_minutes_day_ios?: number
  build_minutes_day_android?: number
  builds_day_ios?: number
  builds_day_android?: number
}

const { t } = useI18n()
const displayStore = useDisplayStore()
const mainStore = useMainStore()
const adminStore = useAdminDashboardStore()
const router = useRouter()
const isLoading = ref(true)
const globalStatsTrendData = ref<GlobalStatsTrendPoint[]>([])
const isLoadingGlobalStatsTrend = ref(false)

function getBuildTotalSeconds(item: GlobalStatsTrendPoint, platform: 'ios' | 'android') {
  const totalSeconds = platform === 'ios' ? item.build_total_seconds_day_ios : item.build_total_seconds_day_android
  if (totalSeconds != null)
    return totalSeconds

  const legacyMinutes = platform === 'ios' ? item.build_minutes_day_ios : item.build_minutes_day_android
  return (legacyMinutes ?? 0) * 60
}

function getBuildCount(item: GlobalStatsTrendPoint, platform: 'ios' | 'android') {
  const count = platform === 'ios' ? item.build_count_day_ios : item.build_count_day_android
  if (count != null)
    return count

  return platform === 'ios' ? (item.builds_day_ios ?? 0) : (item.builds_day_android ?? 0)
}

function getBuildAverageSeconds(item: GlobalStatsTrendPoint, platform: 'ios' | 'android') {
  const avgSeconds = platform === 'ios' ? item.build_avg_seconds_day_ios : item.build_avg_seconds_day_android
  if (avgSeconds != null)
    return avgSeconds

  const count = getBuildCount(item, platform)
  return count > 0 ? getBuildTotalSeconds(item, platform) / count : 0
}

async function loadGlobalStatsTrend() {
  isLoadingGlobalStatsTrend.value = true
  try {
    const data = await adminStore.fetchStats('global_stats_trend')
    globalStatsTrendData.value = data || []
  }
  catch (error) {
    console.error('[Admin Dashboard Builder] Error loading global stats trend:', error)
    globalStatsTrendData.value = []
  }
  finally {
    isLoadingGlobalStatsTrend.value = false
  }
}

const builderActivityTrendSeries = computed(() => {
  if (globalStatsTrendData.value.length === 0)
    return []

  return [
    {
      label: 'Paying Clients',
      data: globalStatsTrendData.value.map(item => ({
        date: item.date,
        value: item.paying || 0,
      })),
      color: '#119eff',
    },
    {
      label: 'Builder Active (60d)',
      data: globalStatsTrendData.value.map(item => ({
        date: item.date,
        value: item.builder_active_paying_clients_60d || 0,
      })),
      color: '#8b5cf6',
    },
    {
      label: 'Live Updates Active (60d)',
      data: globalStatsTrendData.value.map(item => ({
        date: item.date,
        value: item.live_updates_active_paying_clients_60d || 0,
      })),
      color: '#10b981',
    },
  ]
})

const buildsTrendSeries = computed(() => {
  if (globalStatsTrendData.value.length === 0)
    return []

  return [
    {
      label: 'Total Builds',
      data: globalStatsTrendData.value.map(item => ({
        date: item.date,
        value: item.builds_total || 0,
      })),
      color: '#8b5cf6',
    },
    {
      label: 'iOS Builds',
      data: globalStatsTrendData.value.map(item => ({
        date: item.date,
        value: item.builds_ios || 0,
      })),
      color: '#000000',
    },
    {
      label: 'Android Builds',
      data: globalStatsTrendData.value.map(item => ({
        date: item.date,
        value: item.builds_android || 0,
      })),
      color: '#3ddc84',
    },
  ]
})

const buildsLastMonthTrendSeries = computed(() => {
  if (globalStatsTrendData.value.length === 0)
    return []

  return [
    {
      label: 'Last Month Total',
      data: globalStatsTrendData.value.map(item => ({
        date: item.date,
        value: item.builds_last_month || 0,
      })),
      color: '#8b5cf6',
    },
    {
      label: 'Last Month iOS',
      data: globalStatsTrendData.value.map(item => ({
        date: item.date,
        value: item.builds_last_month_ios || 0,
      })),
      color: '#000000',
    },
    {
      label: 'Last Month Android',
      data: globalStatsTrendData.value.map(item => ({
        date: item.date,
        value: item.builds_last_month_android || 0,
      })),
      color: '#3ddc84',
    },
  ]
})

const buildTotalSecondsTrendSeries = computed(() => {
  if (globalStatsTrendData.value.length === 0)
    return []

  return [
    {
      label: 'iOS Total Build Seconds',
      data: globalStatsTrendData.value.map(item => ({
        date: item.date,
        value: getBuildTotalSeconds(item, 'ios'),
      })),
      color: '#000000',
    },
    {
      label: 'Android Total Build Seconds',
      data: globalStatsTrendData.value.map(item => ({
        date: item.date,
        value: getBuildTotalSeconds(item, 'android'),
      })),
      color: '#3ddc84',
    },
  ]
})

const buildAverageSecondsTrendSeries = computed(() => {
  if (globalStatsTrendData.value.length === 0)
    return []

  return [
    {
      label: 'iOS Avg Build Seconds',
      data: globalStatsTrendData.value.map(item => ({
        date: item.date,
        value: getBuildAverageSeconds(item, 'ios'),
      })),
      color: '#000000',
    },
    {
      label: 'Android Avg Build Seconds',
      data: globalStatsTrendData.value.map(item => ({
        date: item.date,
        value: getBuildAverageSeconds(item, 'android'),
      })),
      color: '#3ddc84',
    },
  ]
})

const periodBuildStats = computed(() => {
  const totals = globalStatsTrendData.value.reduce((acc, item) => {
    acc.iosTotalSeconds += getBuildTotalSeconds(item, 'ios')
    acc.androidTotalSeconds += getBuildTotalSeconds(item, 'android')
    acc.iosBuildCount += getBuildCount(item, 'ios')
    acc.androidBuildCount += getBuildCount(item, 'android')
    if (getBuildAverageSeconds(item, 'ios') > 0)
      acc.iosAvgDays += 1
    if (getBuildAverageSeconds(item, 'android') > 0)
      acc.androidAvgDays += 1

    return acc
  }, {
    iosTotalSeconds: 0,
    androidTotalSeconds: 0,
    iosBuildCount: 0,
    androidBuildCount: 0,
    iosAvgDays: 0,
    androidAvgDays: 0,
  })

  return {
    ios: {
      averageSeconds: totals.iosBuildCount > 0 ? totals.iosTotalSeconds / totals.iosBuildCount : 0,
      totalSeconds: totals.iosTotalSeconds,
      builds: totals.iosBuildCount,
      days: totals.iosAvgDays,
    },
    android: {
      averageSeconds: totals.androidBuildCount > 0 ? totals.androidTotalSeconds / totals.androidBuildCount : 0,
      totalSeconds: totals.androidTotalSeconds,
      builds: totals.androidBuildCount,
      days: totals.androidAvgDays,
    },
  }
})

const latestGlobalStats = computed(() => {
  if (globalStatsTrendData.value.length === 0)
    return null
  return globalStatsTrendData.value[globalStatsTrendData.value.length - 1]
})

function formatPercent(part: number | undefined, total: number | undefined) {
  if (!part || !total)
    return '0.0%'

  return `${(part / total * 100).toFixed(1)}%`
}

function formatSeconds(value: number) {
  return `${value.toFixed(1)} sec`
}

function formatTotalSeconds(value: number) {
  return `${Math.round(value).toLocaleString()} sec`
}

function buildPeriodSubtitle(stats: { builds: number, days: number, totalSeconds: number }) {
  return `${stats.builds.toLocaleString()} builds across ${stats.days.toLocaleString()} active days, ${formatTotalSeconds(stats.totalSeconds)} total in selected period`
}

async function refreshBuilderDashboard() {
  isLoading.value = true
  await loadGlobalStatsTrend()
  isLoading.value = false
}

function sendNonAdminBack() {
  console.error('Non-admin user attempted to access admin dashboard builder')
  return router.push('/dashboard')
}

watch(
  [() => adminStore.activeDateRange, () => adminStore.refreshTrigger],
  () => loadGlobalStatsTrend(),
  { deep: true },
)

onMounted(async () => {
  if (!mainStore.isAdmin)
    return sendNonAdminBack()

  await refreshBuilderDashboard()
})

displayStore.NavTitle = t('builder')
displayStore.defaultBack = '/dashboard'
</script>

<template>
  <div>
    <div class="h-full pb-4 overflow-hidden">
      <div class="w-full h-full px-4 pt-2 mx-auto mb-8 overflow-y-auto sm:px-6 md:pt-8 lg:px-8 max-w-9xl max-h-fit">
        <AdminFilterBar />

        <div v-if="isLoading" class="flex items-center justify-center min-h-screen">
          <Spinner size="w-24 h-24" />
        </div>

        <div v-else class="space-y-6">
          <div class="grid grid-cols-1 gap-6">
            <ChartCard
              :title="t('paying-client-product-activity-trend')"
              :is-loading="isLoadingGlobalStatsTrend"
              :has-data="builderActivityTrendSeries.length > 0"
            >
              <AdminMultiLineChart
                :series="builderActivityTrendSeries"
                :is-loading="isLoadingGlobalStatsTrend"
              />
            </ChartCard>
          </div>

          <div class="grid grid-cols-1 gap-6 md:grid-cols-3">
            <AdminStatsCard
              title="Total Builds (All Time)"
              :value="latestGlobalStats?.builds_total || 0"
              subtitle="Native builds recorded"
              color-class="text-purple-500"
              :is-loading="isLoadingGlobalStatsTrend"
            />
            <AdminStatsCard
              title="iOS Builds (All Time)"
              :value="latestGlobalStats?.builds_ios || 0"
              :subtitle="`${formatPercent(latestGlobalStats?.builds_ios, latestGlobalStats?.builds_total)} of total`"
              color-class="text-gray-900 dark:text-gray-100"
              :is-loading="isLoadingGlobalStatsTrend"
            />
            <AdminStatsCard
              title="Android Builds (All Time)"
              :value="latestGlobalStats?.builds_android || 0"
              :subtitle="`${formatPercent(latestGlobalStats?.builds_android, latestGlobalStats?.builds_total)} of total`"
              color-class="text-green-500"
              :is-loading="isLoadingGlobalStatsTrend"
            />
          </div>

          <div class="grid grid-cols-1 gap-6 md:grid-cols-3">
            <AdminStatsCard
              title="Successful Builds (All Time)"
              :value="latestGlobalStats?.builds_success_total || 0"
              :subtitle="`${formatPercent(latestGlobalStats?.builds_success_total, latestGlobalStats?.builds_total)} of total`"
              color-class="text-success"
              :is-loading="isLoadingGlobalStatsTrend"
            />
            <AdminStatsCard
              title="Successful iOS Builds (All Time)"
              :value="latestGlobalStats?.builds_success_ios || 0"
              :subtitle="`${formatPercent(latestGlobalStats?.builds_success_ios, latestGlobalStats?.builds_ios)} of iOS builds`"
              color-class="text-gray-900 dark:text-gray-100"
              :is-loading="isLoadingGlobalStatsTrend"
            />
            <AdminStatsCard
              title="Successful Android Builds (All Time)"
              :value="latestGlobalStats?.builds_success_android || 0"
              :subtitle="`${formatPercent(latestGlobalStats?.builds_success_android, latestGlobalStats?.builds_android)} of Android builds`"
              color-class="text-green-500"
              :is-loading="isLoadingGlobalStatsTrend"
            />
          </div>

          <div class="grid grid-cols-1 gap-6 md:grid-cols-3">
            <AdminStatsCard
              title="Total Builds (30d)"
              :value="latestGlobalStats?.builds_last_month || 0"
              subtitle="Builds in last 30 days"
              color-class="text-purple-500"
              :is-loading="isLoadingGlobalStatsTrend"
            />
            <AdminStatsCard
              title="iOS Builds (30d)"
              :value="latestGlobalStats?.builds_last_month_ios || 0"
              :subtitle="`${formatPercent(latestGlobalStats?.builds_last_month_ios, latestGlobalStats?.builds_last_month)} of last month`"
              color-class="text-gray-900 dark:text-gray-100"
              :is-loading="isLoadingGlobalStatsTrend"
            />
            <AdminStatsCard
              title="Android Builds (30d)"
              :value="latestGlobalStats?.builds_last_month_android || 0"
              :subtitle="`${formatPercent(latestGlobalStats?.builds_last_month_android, latestGlobalStats?.builds_last_month)} of last month`"
              color-class="text-green-500"
              :is-loading="isLoadingGlobalStatsTrend"
            />
          </div>

          <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
            <AdminStatsCard
              title="Avg iOS Build Time"
              :value="formatSeconds(periodBuildStats.ios.averageSeconds)"
              :subtitle="buildPeriodSubtitle(periodBuildStats.ios)"
              color-class="text-gray-900 dark:text-gray-100"
              :is-loading="isLoadingGlobalStatsTrend"
            />
            <AdminStatsCard
              title="Avg Android Build Time"
              :value="formatSeconds(periodBuildStats.android.averageSeconds)"
              :subtitle="buildPeriodSubtitle(periodBuildStats.android)"
              color-class="text-green-500"
              :is-loading="isLoadingGlobalStatsTrend"
            />
          </div>

          <div class="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <ChartCard
              :title="t('builds-trend')"
              :is-loading="isLoadingGlobalStatsTrend"
              :has-data="buildsTrendSeries.length > 0"
            >
              <AdminMultiLineChart
                :series="buildsTrendSeries"
                :is-loading="isLoadingGlobalStatsTrend"
              />
            </ChartCard>

            <ChartCard
              :title="t('builds-last-month-trend')"
              :is-loading="isLoadingGlobalStatsTrend"
              :has-data="buildsLastMonthTrendSeries.length > 0"
            >
              <AdminMultiLineChart
                :series="buildsLastMonthTrendSeries"
                :is-loading="isLoadingGlobalStatsTrend"
              />
            </ChartCard>
          </div>

          <div class="grid grid-cols-1 gap-6">
            <ChartCard
              title="Build Total Seconds by Day"
              :is-loading="isLoadingGlobalStatsTrend"
              :has-data="buildTotalSecondsTrendSeries.length > 0"
            >
              <AdminMultiLineChart
                :series="buildTotalSecondsTrendSeries"
                :is-loading="isLoadingGlobalStatsTrend"
              />
            </ChartCard>
          </div>

          <div class="grid grid-cols-1 gap-6">
            <ChartCard
              title="Average Build Time by Day (sec)"
              :is-loading="isLoadingGlobalStatsTrend"
              :has-data="buildAverageSecondsTrendSeries.length > 0"
            >
              <AdminMultiLineChart
                :series="buildAverageSecondsTrendSeries"
                :is-loading="isLoadingGlobalStatsTrend"
              />
            </ChartCard>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
