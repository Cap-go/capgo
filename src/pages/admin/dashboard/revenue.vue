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
import ChartCard from '~/components/dashboard/ChartCard.vue'
import Spinner from '~/components/Spinner.vue'
import { useAdminDashboardStore } from '~/stores/adminDashboard'
import { useDisplayStore } from '~/stores/display'
import { useMainStore } from '~/stores/main'

const { t } = useI18n()
const displayStore = useDisplayStore()
const mainStore = useMainStore()
const adminStore = useAdminDashboardStore()
const router = useRouter()
const isLoading = ref(true)

// Global stats trend data
const globalStatsTrendData = ref<Array<{
  date: string
  apps: number
  apps_active: number
  users: number
  users_active: number
  paying: number
  trial: number
  not_paying: number
  updates: number
  updates_external: number
  success_rate: number
  bundle_storage_gb: number
  plan_solo: number
  plan_maker: number
  plan_team: number
  plan_enterprise: number
  registers_today: number
  devices_last_month: number
  stars: number
  need_upgrade: number
  paying_yearly: number
  paying_monthly: number
  new_paying_orgs: number
  canceled_orgs: number
  upgraded_orgs: number
  mrr: number
  total_revenue: number
  revenue_solo: number
  revenue_maker: number
  revenue_team: number
  revenue_enterprise: number
}>>([])

const isLoadingGlobalStatsTrend = ref(false)

async function loadGlobalStatsTrend() {
  isLoadingGlobalStatsTrend.value = true
  try {
    const data = await adminStore.fetchStats('global_stats_trend')
    console.log('[Admin Dashboard Revenue] Global stats trend data:', data)
    globalStatsTrendData.value = data || []
  }
  catch (error) {
    console.error('[Admin Dashboard Revenue] Error loading global stats trend:', error)
    globalStatsTrendData.value = []
  }
  finally {
    isLoadingGlobalStatsTrend.value = false
  }
}

// Computed properties for charts
const subscriptionTypeSeries = computed(() => {
  if (globalStatsTrendData.value.length === 0)
    return []

  return [
    {
      label: 'Yearly Subscriptions',
      data: globalStatsTrendData.value.map(item => ({
        date: item.date,
        value: item.paying_yearly || 0,
      })),
      color: '#10b981', // green
    },
    {
      label: 'Monthly Subscriptions',
      data: globalStatsTrendData.value.map(item => ({
        date: item.date,
        value: item.paying_monthly || 0,
      })),
      color: '#3b82f6', // blue
    },
  ]
})

const subscriptionFlowSeries = computed(() => {
  if (globalStatsTrendData.value.length === 0)
    return []

  return [
    {
      label: 'New Subscriptions',
      data: globalStatsTrendData.value.map(item => ({
        date: item.date,
        value: item.new_paying_orgs || 0,
      })),
      color: '#10b981', // green
    },
    {
      label: 'Cancellations',
      data: globalStatsTrendData.value.map(item => ({
        date: item.date,
        value: item.canceled_orgs || 0,
      })),
      color: '#ef4444', // red
    },
  ]
})

const upgradeTrendSeries = computed(() => {
  if (globalStatsTrendData.value.length === 0)
    return []

  return [
    {
      label: 'Organizations Needing Upgrade',
      data: globalStatsTrendData.value.map(item => ({
        date: item.date,
        value: item.need_upgrade,
      })),
      color: '#ef4444', // red
    },
    {
      label: 'Upgraded Organizations (24h)',
      data: globalStatsTrendData.value.map(item => ({
        date: item.date,
        value: item.upgraded_orgs || 0,
      })),
      color: '#10b981', // green
    },
  ]
})

const mrrSeries = computed(() => {
  if (globalStatsTrendData.value.length === 0)
    return []

  return [
    {
      label: 'MRR - Monthly Recurring Revenue ($)',
      data: globalStatsTrendData.value.map(item => ({
        date: item.date,
        value: item.mrr || 0,
      })),
      color: '#3b82f6', // blue
    },
  ]
})

const arrSeries = computed(() => {
  if (globalStatsTrendData.value.length === 0)
    return []

  return [
    {
      label: 'ARR - Annual Recurring Revenue ($)',
      data: globalStatsTrendData.value.map(item => ({
        date: item.date,
        value: item.total_revenue || 0,
      })),
      color: '#10b981', // green
    },
  ]
})

const planARRSeries = computed(() => {
  if (globalStatsTrendData.value.length === 0)
    return []

  return [
    {
      label: 'Solo Plan ARR ($)',
      data: globalStatsTrendData.value.map(item => ({
        date: item.date,
        value: item.revenue_solo || 0,
      })),
      color: '#8b5cf6', // purple
    },
    {
      label: 'Maker Plan ARR ($)',
      data: globalStatsTrendData.value.map(item => ({
        date: item.date,
        value: item.revenue_maker || 0,
      })),
      color: '#ec4899', // pink
    },
    {
      label: 'Team Plan ARR ($)',
      data: globalStatsTrendData.value.map(item => ({
        date: item.date,
        value: item.revenue_team || 0,
      })),
      color: '#10b981', // green
    },
    {
      label: 'Enterprise Plan ARR ($)',
      data: globalStatsTrendData.value.map(item => ({
        date: item.date,
        value: item.revenue_enterprise || 0,
      })),
      color: '#f59e0b', // amber
    },
  ]
})

const totalPayingOrgsSeries = computed(() => {
  if (globalStatsTrendData.value.length === 0)
    return []

  return [
    {
      label: 'Total Paying Organizations',
      data: globalStatsTrendData.value.map(item => ({
        date: item.date,
        value: item.paying,
      })),
      color: '#10b981', // green
    },
  ]
})

const latestGlobalStats = computed(() => {
  if (globalStatsTrendData.value.length === 0)
    return null
  return globalStatsTrendData.value[globalStatsTrendData.value.length - 1]
})

watch(() => adminStore.activeDateRange, () => {
  loadGlobalStatsTrend()
}, { deep: true })

// Watch for refresh button clicks
watch(() => adminStore.refreshTrigger, () => {
  loadGlobalStatsTrend()
})

onMounted(async () => {
  if (!mainStore.isAdmin) {
    console.error('Non-admin user attempted to access admin dashboard')
    router.push('/dashboard')
    return
  }

  isLoading.value = true
  await loadGlobalStatsTrend()
  isLoading.value = false

  displayStore.NavTitle = t('revenue')
})

displayStore.NavTitle = t('revenue')
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
          <!-- MRR & ARR Cards -->
          <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
            <!-- MRR Card -->
            <div class="flex flex-col justify-between p-6 bg-white border rounded-lg shadow-lg border-slate-300 dark:bg-gray-800 dark:border-slate-900">
              <div class="flex items-start justify-between mb-4">
                <div class="p-3 rounded-lg bg-primary/10">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="w-6 h-6 stroke-current text-primary"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
              </div>
              <div>
                <p class="text-sm text-slate-600 dark:text-slate-400">
                  MRR - Monthly Recurring Revenue
                </p>
                <p v-if="latestGlobalStats" class="mt-2 text-3xl font-bold text-primary">
                  ${{ latestGlobalStats.mrr.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}
                </p>
                <p v-else class="mt-2 text-3xl font-bold text-primary">
                  $0.00
                </p>
                <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Current monthly recurring revenue
                </p>
              </div>
            </div>

            <!-- ARR Card -->
            <div class="flex flex-col justify-between p-6 bg-white border rounded-lg shadow-lg border-slate-300 dark:bg-gray-800 dark:border-slate-900">
              <div class="flex items-start justify-between mb-4">
                <div class="p-3 rounded-lg bg-success/10">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="w-6 h-6 stroke-current text-success"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                </div>
              </div>
              <div>
                <p class="text-sm text-slate-600 dark:text-slate-400">
                  ARR - Annual Recurring Revenue Projection
                </p>
                <p v-if="latestGlobalStats" class="mt-2 text-3xl font-bold text-success">
                  ${{ latestGlobalStats.total_revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}
                </p>
                <p v-else class="mt-2 text-3xl font-bold text-success">
                  $0.00
                </p>
                <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Projected annual recurring revenue (MRR × 12)
                </p>
              </div>
            </div>
          </div>

          <!-- Revenue Metrics Cards -->
          <div class="grid grid-cols-1 gap-6 md:grid-cols-3">
            <!-- Total Paying Organizations -->
            <div class="flex flex-col justify-between p-6 bg-white border rounded-lg shadow-lg border-slate-300 dark:bg-gray-800 dark:border-slate-900">
              <div class="flex items-start justify-between mb-4">
                <div class="p-3 rounded-lg bg-success/10">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="w-6 h-6 stroke-current text-success"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
              </div>
              <div>
                <p class="text-sm text-slate-600 dark:text-slate-400">
                  Total Paying
                </p>
                <p v-if="latestGlobalStats" class="mt-2 text-3xl font-bold text-success">
                  {{ latestGlobalStats.paying.toLocaleString() }}
                </p>
                <p v-else class="mt-2 text-3xl font-bold text-success">
                  0
                </p>
                <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Active paying organizations
                </p>
              </div>
            </div>

            <!-- Yearly Subscriptions -->
            <div class="flex flex-col justify-between p-6 bg-white border rounded-lg shadow-lg border-slate-300 dark:bg-gray-800 dark:border-slate-900">
              <div class="flex items-start justify-between mb-4">
                <div class="p-3 rounded-lg bg-primary/10">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="w-6 h-6 stroke-current text-primary"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                </div>
              </div>
              <div>
                <p class="text-sm text-slate-600 dark:text-slate-400">
                  Yearly Subscriptions
                </p>
                <p v-if="latestGlobalStats" class="mt-2 text-3xl font-bold text-primary">
                  {{ (latestGlobalStats.paying_yearly || 0).toLocaleString() }}
                </p>
                <p v-else class="mt-2 text-3xl font-bold text-primary">
                  0
                </p>
                <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Organizations on yearly plans
                </p>
              </div>
            </div>

            <!-- Monthly Subscriptions -->
            <div class="flex flex-col justify-between p-6 bg-white border rounded-lg shadow-lg border-slate-300 dark:bg-gray-800 dark:border-slate-900">
              <div class="flex items-start justify-between mb-4">
                <div class="p-3 rounded-lg bg-info/10">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="w-6 h-6 stroke-current text-info"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
              </div>
              <div>
                <p class="text-sm text-slate-600 dark:text-slate-400">
                  Monthly Subscriptions
                </p>
                <p v-if="latestGlobalStats" class="mt-2 text-3xl font-bold text-info">
                  {{ (latestGlobalStats.paying_monthly || 0).toLocaleString() }}
                </p>
                <p v-else class="mt-2 text-3xl font-bold text-info">
                  0
                </p>
                <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Organizations on monthly plans
                </p>
              </div>
            </div>
          </div>

          <!-- Upgrade Metrics Cards -->
          <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
            <!-- Organizations Needing Upgrade -->
            <div class="flex flex-col justify-between p-6 bg-white border rounded-lg shadow-lg border-slate-300 dark:bg-gray-800 dark:border-slate-900">
              <div class="flex items-start justify-between mb-4">
                <div class="p-3 rounded-lg bg-error/10">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="w-6 h-6 stroke-current text-error"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v4m0 4h.01M5.07 19h13.86a2 2 0 001.74-3l-6.93-12a2 2 0 00-3.48 0l-6.93 12a2 2 0 001.74 3z" /></svg>
                </div>
              </div>
              <div>
                <p class="text-sm text-slate-600 dark:text-slate-400">
                  Orgs Need Upgrade
                </p>
                <p v-if="latestGlobalStats" class="mt-2 text-3xl font-bold text-error">
                  {{ latestGlobalStats.need_upgrade.toLocaleString() }}
                </p>
                <p v-else class="mt-2 text-3xl font-bold text-error">
                  0
                </p>
                <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Organizations over plan limits
                </p>
              </div>
            </div>

            <!-- Organizations Upgraded -->
            <div class="flex flex-col justify-between p-6 bg-white border rounded-lg shadow-lg border-slate-300 dark:bg-gray-800 dark:border-slate-900">
              <div class="flex items-start justify-between mb-4">
                <div class="p-3 rounded-lg bg-success/10">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="w-6 h-6 stroke-current text-success"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                </div>
              </div>
              <div>
                <p class="text-sm text-slate-600 dark:text-slate-400">
                  Orgs Upgraded (24h)
                </p>
                <p v-if="latestGlobalStats" class="mt-2 text-3xl font-bold text-success">
                  {{ (latestGlobalStats.upgraded_orgs || 0).toLocaleString() }}
                </p>
                <p v-else class="mt-2 text-3xl font-bold text-success">
                  0
                </p>
                <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Plan upgrades in the last 24 hours
                </p>
              </div>
            </div>
          </div>

          <!-- Charts - 2 per row -->
          <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <!-- Subscription Flow (New vs Canceled) -->
            <ChartCard
              :title="t('subscription-flow')"
              :is-loading="isLoadingGlobalStatsTrend"
              :has-data="subscriptionFlowSeries.length > 0"
            >
              <AdminMultiLineChart
                :series="subscriptionFlowSeries"
                :is-loading="isLoadingGlobalStatsTrend"
              />
            </ChartCard>

            <!-- Subscription Type (Yearly vs Monthly) -->
            <ChartCard
              :title="t('subscription-type-trend')"
              :is-loading="isLoadingGlobalStatsTrend"
              :has-data="subscriptionTypeSeries.length > 0"
            >
              <AdminMultiLineChart
                :series="subscriptionTypeSeries"
                :is-loading="isLoadingGlobalStatsTrend"
              />
            </ChartCard>
          </div>

          <!-- Revenue Charts - Full Width -->
          <div class="grid grid-cols-1 gap-6">
            <!-- MRR - Monthly Recurring Revenue -->
            <ChartCard
              title="MRR - Monthly Recurring Revenue"
              :is-loading="isLoadingGlobalStatsTrend"
              :has-data="mrrSeries.length > 0"
            >
              <AdminMultiLineChart
                :series="mrrSeries"
                :is-loading="isLoadingGlobalStatsTrend"
              />
            </ChartCard>

            <!-- ARR - Annual Recurring Revenue -->
            <ChartCard
              title="ARR - Annual Recurring Revenue Projection"
              :is-loading="isLoadingGlobalStatsTrend"
              :has-data="arrSeries.length > 0"
            >
              <AdminMultiLineChart
                :series="arrSeries"
                :is-loading="isLoadingGlobalStatsTrend"
              />
            </ChartCard>

            <!-- ARR by Plan (3 lines) -->
            <ChartCard
              title="ARR by Plan"
              :is-loading="isLoadingGlobalStatsTrend"
              :has-data="planARRSeries.length > 0"
            >
              <AdminMultiLineChart
                :series="planARRSeries"
                :is-loading="isLoadingGlobalStatsTrend"
              />
            </ChartCard>
          </div>

          <!-- Additional Charts - 2 per row -->
          <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <!-- Total Paying Organizations Trend -->
            <ChartCard
              :title="t('paying-orgs-trend')"
              :is-loading="isLoadingGlobalStatsTrend"
              :has-data="totalPayingOrgsSeries.length > 0"
            >
              <AdminMultiLineChart
                :series="totalPayingOrgsSeries"
                :is-loading="isLoadingGlobalStatsTrend"
              />
            </ChartCard>

            <!-- Upgrade Trend -->
            <ChartCard
              :title="t('upgrade-trend')"
              :is-loading="isLoadingGlobalStatsTrend"
              :has-data="upgradeTrendSeries.length > 0"
            >
              <AdminMultiLineChart
                :series="upgradeTrendSeries"
                :is-loading="isLoadingGlobalStatsTrend"
              />
            </ChartCard>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
