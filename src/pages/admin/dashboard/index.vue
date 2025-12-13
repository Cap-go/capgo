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
  plan_payg: number
  registers_today: number
  devices_last_month: number
  stars: number
  need_upgrade: number
}>>([])

const isLoadingGlobalStatsTrend = ref(false)

async function loadGlobalStatsTrend() {
  isLoadingGlobalStatsTrend.value = true
  try {
    const data = await adminStore.fetchStats('global_stats_trend')
    console.log('[Admin Dashboard] Global stats trend data:', data)
    globalStatsTrendData.value = data || []
  }
  catch (error) {
    console.error('[Admin Dashboard] Error loading global stats trend:', error)
    globalStatsTrendData.value = []
  }
  finally {
    isLoadingGlobalStatsTrend.value = false
  }
}

// Computed properties for multi-line charts
const appsTrendSeries = computed(() => {
  if (globalStatsTrendData.value.length === 0)
    return []

  return [
    {
      label: 'Total Apps',
      data: globalStatsTrendData.value.map(item => ({
        date: item.date,
        value: item.apps,
      })),
      color: '#8b5cf6', // purple
    },
    {
      label: 'Active Apps',
      data: globalStatsTrendData.value.map(item => ({
        date: item.date,
        value: item.apps_active,
      })),
      color: '#ec4899', // pink
    },
  ]
})

const totalUsersTrendSeries = computed(() => {
  if (globalStatsTrendData.value.length === 0)
    return []

  return [
    {
      label: 'Total Users',
      data: globalStatsTrendData.value.map(item => ({
        date: item.date,
        value: item.users,
      })),
      color: '#06b6d4', // cyan
    },
    {
      label: 'Active Users',
      data: globalStatsTrendData.value.map(item => ({
        date: item.date,
        value: item.users_active,
      })),
      color: '#14b8a6', // teal
    },
  ]
})

const bundleStorageTrendSeries = computed(() => {
  if (globalStatsTrendData.value.length === 0)
    return []

  return [
    {
      label: 'Bundle Storage (GB)',
      data: globalStatsTrendData.value.map(item => ({
        date: item.date,
        value: item.bundle_storage_gb,
      })),
      color: '#10b981', // green
    },
  ]
})

const githubStarsTrendSeries = computed(() => {
  if (globalStatsTrendData.value.length === 0)
    return []

  return [
    {
      label: 'GitHub Stars',
      data: globalStatsTrendData.value.map(item => ({
        date: item.date,
        value: item.stars,
      })),
      color: '#eab308', // yellow
    },
  ]
})

const needUpgradeTrendSeries = computed(() => {
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
  ]
})

// Latest metrics from global stats
const latestGlobalStats = computed(() => {
  if (globalStatsTrendData.value.length === 0)
    return null
  return globalStatsTrendData.value[globalStatsTrendData.value.length - 1]
})

// Watch for date range changes and reload data
watch(() => adminStore.activeDateRange, () => {
  loadGlobalStatsTrend()
}, { deep: true })

// Watch for refresh button clicks
watch(() => adminStore.refreshTrigger, () => {
  loadGlobalStatsTrend()
})

onMounted(async () => {
  // Verify admin access
  if (!mainStore.isAdmin) {
    console.error('Non-admin user attempted to access admin dashboard')
    router.push('/dashboard')
    return
  }

  isLoading.value = true
  await loadGlobalStatsTrend()
  isLoading.value = false

  displayStore.NavTitle = t('admin-dashboard')
})

displayStore.NavTitle = t('admin-dashboard')
displayStore.defaultBack = '/dashboard'
</script>

<template>
  <div>
    <div class="h-full pb-4 overflow-hidden">
      <div class="w-full h-full px-4 pt-2 mx-auto mb-8 overflow-y-auto sm:px-6 md:pt-8 lg:px-8 max-w-9xl max-h-fit">
        <!-- Filter Bar -->
        <AdminFilterBar />

        <!-- Loading State -->
        <div v-if="isLoading" class="flex items-center justify-center min-h-screen">
          <Spinner size="w-24 h-24" />
        </div>

        <!-- Dashboard Content -->
        <div v-else class="space-y-6">
          <!-- Key Metrics from Global Stats - 4 cards -->
          <div class="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
            <!-- Total Apps Card -->
            <div class="flex flex-col justify-between p-6 bg-white border rounded-lg shadow-lg border-slate-300 dark:bg-gray-800 dark:border-slate-900">
              <div class="flex items-start justify-between mb-4">
                <div class="p-3 rounded-lg bg-primary/10">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="w-6 h-6 stroke-current text-primary"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                </div>
              </div>
              <div>
                <p class="text-sm text-slate-600 dark:text-slate-400">
                  Total Apps
                </p>
                <div v-if="isLoadingGlobalStatsTrend" class="my-2">
                  <span class="loading loading-spinner loading-lg text-primary" />
                </div>
                <p v-else-if="latestGlobalStats" class="mt-2 text-3xl font-bold text-primary">
                  {{ latestGlobalStats.apps.toLocaleString() }}
                </p>
                <p v-else class="mt-2 text-3xl font-bold text-primary">
                  0
                </p>
                <p v-if="latestGlobalStats" class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {{ latestGlobalStats.apps_active.toLocaleString() }} active
                </p>
              </div>
            </div>

            <!-- Total Users Card -->
            <div class="flex flex-col justify-between p-6 bg-white border rounded-lg shadow-lg border-slate-300 dark:bg-gray-800 dark:border-slate-900">
              <div class="flex items-start justify-between mb-4">
                <div class="p-3 rounded-lg bg-secondary/10">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="w-6 h-6 stroke-current text-secondary"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                </div>
              </div>
              <div>
                <p class="text-sm text-slate-600 dark:text-slate-400">
                  Total Users
                </p>
                <div v-if="isLoadingGlobalStatsTrend" class="my-2">
                  <span class="loading loading-spinner loading-lg text-secondary" />
                </div>
                <p v-else-if="latestGlobalStats" class="mt-2 text-3xl font-bold text-secondary">
                  {{ latestGlobalStats.users.toLocaleString() }}
                </p>
                <p v-else class="mt-2 text-3xl font-bold text-secondary">
                  0
                </p>
                <p v-if="latestGlobalStats" class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {{ latestGlobalStats.users_active.toLocaleString() }} active
                </p>
              </div>
            </div>

            <!-- Bundle Storage Card -->
            <div class="flex flex-col justify-between p-6 bg-white border rounded-lg shadow-lg border-slate-300 dark:bg-gray-800 dark:border-slate-900">
              <div class="flex items-start justify-between mb-4">
                <div class="p-3 rounded-lg bg-accent/10">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="w-6 h-6 stroke-current text-accent"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" /></svg>
                </div>
              </div>
              <div>
                <p class="text-sm text-slate-600 dark:text-slate-400">
                  Bundle Storage
                </p>
                <div v-if="isLoadingGlobalStatsTrend" class="my-2">
                  <span class="loading loading-spinner loading-lg text-accent" />
                </div>
                <p v-else-if="latestGlobalStats" class="mt-2 text-3xl font-bold text-accent">
                  {{ latestGlobalStats.bundle_storage_gb.toFixed(1) }} GB
                </p>
                <p v-else class="mt-2 text-3xl font-bold text-accent">
                  0 GB
                </p>
                <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Total bundle storage used
                </p>
              </div>
            </div>

            <!-- Success Rate Card -->
            <div class="flex flex-col justify-between p-6 bg-white border rounded-lg shadow-lg border-slate-300 dark:bg-gray-800 dark:border-slate-900">
              <div class="flex items-start justify-between mb-4">
                <div class="p-3 rounded-lg bg-success/10">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="w-6 h-6 stroke-current text-success"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
              </div>
              <div>
                <p class="text-sm text-slate-600 dark:text-slate-400">
                  Update Success Rate
                </p>
                <div v-if="isLoadingGlobalStatsTrend" class="my-2">
                  <span class="loading loading-spinner loading-lg text-success" />
                </div>
                <p v-else-if="latestGlobalStats" class="mt-2 text-3xl font-bold text-success">
                  {{ latestGlobalStats.success_rate.toFixed(1) }}%
                </p>
                <p v-else class="mt-2 text-3xl font-bold text-success">
                  0%
                </p>
                <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Platform-wide success rate
                </p>
              </div>
            </div>
          </div>

          <!-- Trend Charts - 2 per row -->
          <div class="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <!-- Apps Trend (Total + Active) -->
            <ChartCard
              :title="t('apps-activity-trend')"
              :is-loading="isLoadingGlobalStatsTrend"
              :has-data="appsTrendSeries.length > 0"
            >
              <AdminMultiLineChart
                :series="appsTrendSeries"
                :is-loading="isLoadingGlobalStatsTrend"
              />
            </ChartCard>

            <!-- Users Trend (Total + Active) -->
            <ChartCard
              :title="t('users-activity-trend')"
              :is-loading="isLoadingGlobalStatsTrend"
              :has-data="totalUsersTrendSeries.length > 0"
            >
              <AdminMultiLineChart
                :series="totalUsersTrendSeries"
                :is-loading="isLoadingGlobalStatsTrend"
              />
            </ChartCard>
          </div>

          <!-- Storage Trend - Full Width -->
          <div class="grid grid-cols-1 gap-6">
            <!-- Bundle Storage Trend -->
            <ChartCard
              :title="t('storage-trend')"
              :is-loading="isLoadingGlobalStatsTrend"
              :has-data="bundleStorageTrendSeries.length > 0"
            >
              <AdminMultiLineChart
                :series="bundleStorageTrendSeries"
                :is-loading="isLoadingGlobalStatsTrend"
              />
            </ChartCard>
          </div>

          <!-- GitHub & Upgrade Metrics - 2 per row -->
          <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <!-- GitHub Stars Trend -->
            <ChartCard
              :title="t('github-stars-trend')"
              :is-loading="isLoadingGlobalStatsTrend"
              :has-data="githubStarsTrendSeries.length > 0"
            >
              <AdminMultiLineChart
                :series="githubStarsTrendSeries"
                :is-loading="isLoadingGlobalStatsTrend"
              />
            </ChartCard>

            <!-- Need Upgrade Trend -->
            <ChartCard
              :title="t('need-upgrade-trend')"
              :is-loading="isLoadingGlobalStatsTrend"
              :has-data="needUpgradeTrendSeries.length > 0"
            >
              <AdminMultiLineChart
                :series="needUpgradeTrendSeries"
                :is-loading="isLoadingGlobalStatsTrend"
              />
            </ChartCard>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
