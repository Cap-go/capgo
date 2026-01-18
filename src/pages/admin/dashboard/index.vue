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
  devices_last_month_ios: number
  devices_last_month_android: number
  stars: number
  need_upgrade: number
  builds_total: number
  builds_ios: number
  builds_android: number
  builds_last_month: number
  builds_last_month_ios: number
  builds_last_month_android: number
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

const devicePlatformTrendSeries = computed(() => {
  if (globalStatsTrendData.value.length === 0)
    return []

  return [
    {
      label: 'iOS Devices',
      data: globalStatsTrendData.value.map(item => ({
        date: item.date,
        value: item.devices_last_month_ios || 0,
      })),
      color: '#000000', // black (Apple)
    },
    {
      label: 'Android Devices',
      data: globalStatsTrendData.value.map(item => ({
        date: item.date,
        value: item.devices_last_month_android || 0,
      })),
      color: '#3ddc84', // Android green
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
      color: '#8b5cf6', // purple
    },
    {
      label: 'iOS Builds',
      data: globalStatsTrendData.value.map(item => ({
        date: item.date,
        value: item.builds_ios || 0,
      })),
      color: '#000000', // black (Apple)
    },
    {
      label: 'Android Builds',
      data: globalStatsTrendData.value.map(item => ({
        date: item.date,
        value: item.builds_android || 0,
      })),
      color: '#3ddc84', // Android green
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
      color: '#8b5cf6', // purple
    },
    {
      label: 'Last Month iOS',
      data: globalStatsTrendData.value.map(item => ({
        date: item.date,
        value: item.builds_last_month_ios || 0,
      })),
      color: '#000000', // black (Apple)
    },
    {
      label: 'Last Month Android',
      data: globalStatsTrendData.value.map(item => ({
        date: item.date,
        value: item.builds_last_month_android || 0,
      })),
      color: '#3ddc84', // Android green
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

          <!-- Device Platform Distribution -->
          <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
            <!-- iOS Devices Card -->
            <div class="flex flex-col justify-between p-6 bg-white border rounded-lg shadow-lg border-slate-300 dark:bg-gray-800 dark:border-slate-900">
              <div class="flex items-start justify-between mb-4">
                <div class="p-3 rounded-lg bg-gray-900/10 dark:bg-gray-100/10">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6 text-gray-900 dark:text-gray-100">
                    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
                  </svg>
                </div>
              </div>
              <div>
                <p class="text-sm text-slate-600 dark:text-slate-400">
                  iOS Devices (30d)
                </p>
                <div v-if="isLoadingGlobalStatsTrend" class="my-2">
                  <span class="loading loading-spinner loading-lg text-gray-900 dark:text-gray-100" />
                </div>
                <p v-else-if="latestGlobalStats" class="mt-2 text-3xl font-bold text-gray-900 dark:text-gray-100">
                  {{ (latestGlobalStats.devices_last_month_ios || 0).toLocaleString() }}
                </p>
                <p v-else class="mt-2 text-3xl font-bold text-gray-900 dark:text-gray-100">
                  0
                </p>
                <p v-if="latestGlobalStats && latestGlobalStats.devices_last_month" class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {{ ((latestGlobalStats.devices_last_month_ios || 0) / latestGlobalStats.devices_last_month * 100).toFixed(1) }}% of total
                </p>
              </div>
            </div>

            <!-- Android Devices Card -->
            <div class="flex flex-col justify-between p-6 bg-white border rounded-lg shadow-lg border-slate-300 dark:bg-gray-800 dark:border-slate-900">
              <div class="flex items-start justify-between mb-4">
                <div class="p-3 rounded-lg bg-green-500/10">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6 text-green-500">
                    <path d="M17.523 2.477a.75.75 0 0 0-1.06 1.06l1.47 1.47A6.472 6.472 0 0 0 12 3.5a6.472 6.472 0 0 0-5.933 1.507l1.47-1.47a.75.75 0 0 0-1.06-1.06L4.537 4.417a.75.75 0 0 0 0 1.06l1.94 1.94A6.5 6.5 0 0 0 5.5 11v5.5a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V11a6.5 6.5 0 0 0-.977-3.583l1.94-1.94a.75.75 0 0 0 0-1.06l-1.94-1.94zM9 10a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm6 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2z" />
                  </svg>
                </div>
              </div>
              <div>
                <p class="text-sm text-slate-600 dark:text-slate-400">
                  Android Devices (30d)
                </p>
                <div v-if="isLoadingGlobalStatsTrend" class="my-2">
                  <span class="loading loading-spinner loading-lg text-green-500" />
                </div>
                <p v-else-if="latestGlobalStats" class="mt-2 text-3xl font-bold text-green-500">
                  {{ (latestGlobalStats.devices_last_month_android || 0).toLocaleString() }}
                </p>
                <p v-else class="mt-2 text-3xl font-bold text-green-500">
                  0
                </p>
                <p v-if="latestGlobalStats && latestGlobalStats.devices_last_month" class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {{ ((latestGlobalStats.devices_last_month_android || 0) / latestGlobalStats.devices_last_month * 100).toFixed(1) }}% of total
                </p>
              </div>
            </div>
          </div>

          <!-- Device Platform Trend Chart -->
          <div class="grid grid-cols-1 gap-6">
            <ChartCard
              :title="t('device-platform-trend')"
              :is-loading="isLoadingGlobalStatsTrend"
              :has-data="devicePlatformTrendSeries.length > 0"
            >
              <AdminMultiLineChart
                :series="devicePlatformTrendSeries"
                :is-loading="isLoadingGlobalStatsTrend"
              />
            </ChartCard>
          </div>

          <!-- Build Statistics Section - All Time -->
          <div class="grid grid-cols-1 gap-6 md:grid-cols-3">
            <!-- Total Builds Card -->
            <div class="flex flex-col justify-between p-6 bg-white border rounded-lg shadow-lg border-slate-300 dark:bg-gray-800 dark:border-slate-900">
              <div class="flex items-start justify-between mb-4">
                <div class="p-3 rounded-lg bg-purple-500/10">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6 text-purple-500">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
                  </svg>
                </div>
              </div>
              <div>
                <p class="text-sm text-slate-600 dark:text-slate-400">
                  Total Builds (All Time)
                </p>
                <div v-if="isLoadingGlobalStatsTrend" class="my-2">
                  <span class="loading loading-spinner loading-lg text-purple-500" />
                </div>
                <p v-else-if="latestGlobalStats" class="mt-2 text-3xl font-bold text-purple-500">
                  {{ (latestGlobalStats.builds_total || 0).toLocaleString() }}
                </p>
                <p v-else class="mt-2 text-3xl font-bold text-purple-500">
                  0
                </p>
                <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Native builds recorded
                </p>
              </div>
            </div>

            <!-- iOS Builds Card -->
            <div class="flex flex-col justify-between p-6 bg-white border rounded-lg shadow-lg border-slate-300 dark:bg-gray-800 dark:border-slate-900">
              <div class="flex items-start justify-between mb-4">
                <div class="p-3 rounded-lg bg-gray-900/10 dark:bg-gray-100/10">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6 text-gray-900 dark:text-gray-100">
                    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
                  </svg>
                </div>
              </div>
              <div>
                <p class="text-sm text-slate-600 dark:text-slate-400">
                  iOS Builds (All Time)
                </p>
                <div v-if="isLoadingGlobalStatsTrend" class="my-2">
                  <span class="loading loading-spinner loading-lg text-gray-900 dark:text-gray-100" />
                </div>
                <p v-else-if="latestGlobalStats" class="mt-2 text-3xl font-bold text-gray-900 dark:text-gray-100">
                  {{ (latestGlobalStats.builds_ios || 0).toLocaleString() }}
                </p>
                <p v-else class="mt-2 text-3xl font-bold text-gray-900 dark:text-gray-100">
                  0
                </p>
                <p v-if="latestGlobalStats && latestGlobalStats.builds_total" class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {{ latestGlobalStats.builds_total > 0 ? ((latestGlobalStats.builds_ios || 0) / latestGlobalStats.builds_total * 100).toFixed(1) : '0.0' }}% of total
                </p>
              </div>
            </div>

            <!-- Android Builds Card -->
            <div class="flex flex-col justify-between p-6 bg-white border rounded-lg shadow-lg border-slate-300 dark:bg-gray-800 dark:border-slate-900">
              <div class="flex items-start justify-between mb-4">
                <div class="p-3 rounded-lg bg-green-500/10">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6 text-green-500">
                    <path d="M17.523 2.477a.75.75 0 0 0-1.06 1.06l1.47 1.47A6.472 6.472 0 0 0 12 3.5a6.472 6.472 0 0 0-5.933 1.507l1.47-1.47a.75.75 0 0 0-1.06-1.06L4.537 4.417a.75.75 0 0 0 0 1.06l1.94 1.94A6.5 6.5 0 0 0 5.5 11v5.5a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V11a6.5 6.5 0 0 0-.977-3.583l1.94-1.94a.75.75 0 0 0 0-1.06l-1.94-1.94zM9 10a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm6 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2z" />
                  </svg>
                </div>
              </div>
              <div>
                <p class="text-sm text-slate-600 dark:text-slate-400">
                  Android Builds (All Time)
                </p>
                <div v-if="isLoadingGlobalStatsTrend" class="my-2">
                  <span class="loading loading-spinner loading-lg text-green-500" />
                </div>
                <p v-else-if="latestGlobalStats" class="mt-2 text-3xl font-bold text-green-500">
                  {{ (latestGlobalStats.builds_android || 0).toLocaleString() }}
                </p>
                <p v-else class="mt-2 text-3xl font-bold text-green-500">
                  0
                </p>
                <p v-if="latestGlobalStats && latestGlobalStats.builds_total" class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {{ latestGlobalStats.builds_total > 0 ? ((latestGlobalStats.builds_android || 0) / latestGlobalStats.builds_total * 100).toFixed(1) : '0.0' }}% of total
                </p>
              </div>
            </div>
          </div>

          <!-- Build Statistics Section - Last 30 Days -->
          <div class="grid grid-cols-1 gap-6 md:grid-cols-3">
            <!-- Total Builds Last Month Card -->
            <div class="flex flex-col justify-between p-6 bg-white border rounded-lg shadow-lg border-slate-300 dark:bg-gray-800 dark:border-slate-900">
              <div class="flex items-start justify-between mb-4">
                <div class="p-3 rounded-lg bg-purple-500/10">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6 text-purple-500">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
                  </svg>
                </div>
              </div>
              <div>
                <p class="text-sm text-slate-600 dark:text-slate-400">
                  Total Builds (30d)
                </p>
                <div v-if="isLoadingGlobalStatsTrend" class="my-2">
                  <span class="loading loading-spinner loading-lg text-purple-500" />
                </div>
                <p v-else-if="latestGlobalStats" class="mt-2 text-3xl font-bold text-purple-500">
                  {{ (latestGlobalStats.builds_last_month || 0).toLocaleString() }}
                </p>
                <p v-else class="mt-2 text-3xl font-bold text-purple-500">
                  0
                </p>
                <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Builds in last 30 days
                </p>
              </div>
            </div>

            <!-- iOS Builds Last Month Card -->
            <div class="flex flex-col justify-between p-6 bg-white border rounded-lg shadow-lg border-slate-300 dark:bg-gray-800 dark:border-slate-900">
              <div class="flex items-start justify-between mb-4">
                <div class="p-3 rounded-lg bg-gray-900/10 dark:bg-gray-100/10">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6 text-gray-900 dark:text-gray-100">
                    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
                  </svg>
                </div>
              </div>
              <div>
                <p class="text-sm text-slate-600 dark:text-slate-400">
                  iOS Builds (30d)
                </p>
                <div v-if="isLoadingGlobalStatsTrend" class="my-2">
                  <span class="loading loading-spinner loading-lg text-gray-900 dark:text-gray-100" />
                </div>
                <p v-else-if="latestGlobalStats" class="mt-2 text-3xl font-bold text-gray-900 dark:text-gray-100">
                  {{ (latestGlobalStats.builds_last_month_ios || 0).toLocaleString() }}
                </p>
                <p v-else class="mt-2 text-3xl font-bold text-gray-900 dark:text-gray-100">
                  0
                </p>
                <p v-if="latestGlobalStats && latestGlobalStats.builds_last_month" class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {{ latestGlobalStats.builds_last_month > 0 ? ((latestGlobalStats.builds_last_month_ios || 0) / latestGlobalStats.builds_last_month * 100).toFixed(1) : '0.0' }}% of last month
                </p>
              </div>
            </div>

            <!-- Android Builds Last Month Card -->
            <div class="flex flex-col justify-between p-6 bg-white border rounded-lg shadow-lg border-slate-300 dark:bg-gray-800 dark:border-slate-900">
              <div class="flex items-start justify-between mb-4">
                <div class="p-3 rounded-lg bg-green-500/10">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6 text-green-500">
                    <path d="M17.523 2.477a.75.75 0 0 0-1.06 1.06l1.47 1.47A6.472 6.472 0 0 0 12 3.5a6.472 6.472 0 0 0-5.933 1.507l1.47-1.47a.75.75 0 0 0-1.06-1.06L4.537 4.417a.75.75 0 0 0 0 1.06l1.94 1.94A6.5 6.5 0 0 0 5.5 11v5.5a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V11a6.5 6.5 0 0 0-.977-3.583l1.94-1.94a.75.75 0 0 0 0-1.06l-1.94-1.94zM9 10a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm6 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2z" />
                  </svg>
                </div>
              </div>
              <div>
                <p class="text-sm text-slate-600 dark:text-slate-400">
                  Android Builds (30d)
                </p>
                <div v-if="isLoadingGlobalStatsTrend" class="my-2">
                  <span class="loading loading-spinner loading-lg text-green-500" />
                </div>
                <p v-else-if="latestGlobalStats" class="mt-2 text-3xl font-bold text-green-500">
                  {{ (latestGlobalStats.builds_last_month_android || 0).toLocaleString() }}
                </p>
                <p v-else class="mt-2 text-3xl font-bold text-green-500">
                  0
                </p>
                <p v-if="latestGlobalStats && latestGlobalStats.builds_last_month" class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {{ latestGlobalStats.builds_last_month > 0 ? ((latestGlobalStats.builds_last_month_android || 0) / latestGlobalStats.builds_last_month * 100).toFixed(1) : '0.0' }}% of last month
                </p>
              </div>
            </div>
          </div>

          <!-- Builds Trend Charts -->
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
