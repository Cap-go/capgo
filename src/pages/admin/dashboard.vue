<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import AdminFilterBar from '~/components/admin/AdminFilterBar.vue'
import AdminTrendChart from '~/components/admin/AdminTrendChart.vue'
import ChartCard from '~/components/dashboard/ChartCard.vue'
import { useAdminDashboardStore } from '~/stores/adminDashboard'
import { useDisplayStore } from '~/stores/display'
import { useMainStore } from '~/stores/main'

const { t } = useI18n()
const displayStore = useDisplayStore()
const mainStore = useMainStore()
const adminStore = useAdminDashboardStore()
const router = useRouter()
const isLoading = ref(true)
const activeTab = ref<'overview' | 'updates' | 'performance' | 'users'>('overview')

// Platform overview stats
const platformStats = ref({
  mau: 0,
  activeApps: 0,
  activeOrgs: 0,
  successRate: 0,
})

// Trend data
const mauTrendData = ref<Array<{ date: string, mau: number }>>([])
const successRateTrendData = ref<Array<{ date: string, installs: number, fails: number, success_rate: number }>>([])
const appsTrendData = ref<Array<{ date: string, apps_created: number }>>([])
const bundlesTrendData = ref<Array<{ date: string, bundles_created: number }>>([])
const deploymentsTrendData = ref<Array<{ date: string, deployments: number }>>([])

const isLoadingMauTrend = ref(false)
const isLoadingSuccessRateTrend = ref(false)
const isLoadingAppsTrend = ref(false)
const isLoadingBundlesTrend = ref(false)
const isLoadingDeploymentsTrend = ref(false)

async function loadPlatformOverview() {
  try {
    const data = await adminStore.fetchStats('platform_overview')
    console.log('[Admin Dashboard] Platform overview data:', data)
    platformStats.value = {
      mau: data?.mau || 0,
      activeApps: data?.active_apps || 0,
      activeOrgs: data?.active_orgs || 0,
      successRate: data?.success_rate || 0,
    }
  }
  catch (error) {
    console.error('[Admin Dashboard] Error loading platform overview:', error)
  }
}

async function loadMauTrend() {
  isLoadingMauTrend.value = true
  try {
    const data = await adminStore.fetchStats('mau_trend')
    console.log('[Admin Dashboard] MAU trend data:', data)
    mauTrendData.value = data || []
  }
  catch (error) {
    console.error('[Admin Dashboard] Error loading MAU trend:', error)
    mauTrendData.value = []
  }
  finally {
    isLoadingMauTrend.value = false
  }
}

async function loadSuccessRateTrend() {
  isLoadingSuccessRateTrend.value = true
  try {
    const data = await adminStore.fetchStats('success_rate_trend')
    console.log('[Admin Dashboard] Success rate trend data:', data)
    successRateTrendData.value = data || []
  }
  catch (error) {
    console.error('[Admin Dashboard] Error loading success rate trend:', error)
    successRateTrendData.value = []
  }
  finally {
    isLoadingSuccessRateTrend.value = false
  }
}

async function loadAppsTrend() {
  isLoadingAppsTrend.value = true
  try {
    const data = await adminStore.fetchStats('apps_trend')
    console.log('[Admin Dashboard] Apps trend data:', data)
    appsTrendData.value = data || []
  }
  catch (error) {
    console.error('[Admin Dashboard] Error loading apps trend:', error)
    appsTrendData.value = []
  }
  finally {
    isLoadingAppsTrend.value = false
  }
}

async function loadBundlesTrend() {
  isLoadingBundlesTrend.value = true
  try {
    const data = await adminStore.fetchStats('bundles_trend')
    console.log('[Admin Dashboard] Bundles trend data:', data)
    bundlesTrendData.value = data || []
  }
  catch (error) {
    console.error('[Admin Dashboard] Error loading bundles trend:', error)
    bundlesTrendData.value = []
  }
  finally {
    isLoadingBundlesTrend.value = false
  }
}

async function loadDeploymentsTrend() {
  isLoadingDeploymentsTrend.value = true
  try {
    const data = await adminStore.fetchStats('deployments_trend')
    console.log('[Admin Dashboard] Deployments trend data:', data)
    deploymentsTrendData.value = data || []
  }
  catch (error) {
    console.error('[Admin Dashboard] Error loading deployments trend:', error)
    deploymentsTrendData.value = []
  }
  finally {
    isLoadingDeploymentsTrend.value = false
  }
}

// Computed properties for chart data
const mauChartData = computed(() => {
  return mauTrendData.value.map(item => ({
    date: item.date,
    value: item.mau,
  }))
})

const successRateChartData = computed(() => {
  return successRateTrendData.value.map(item => ({
    date: item.date,
    value: item.success_rate,
  }))
})

const appsChartData = computed(() => {
  return appsTrendData.value.map(item => ({
    date: item.date,
    value: item.apps_created,
  }))
})

const bundlesChartData = computed(() => {
  return bundlesTrendData.value.map(item => ({
    date: item.date,
    value: item.bundles_created,
  }))
})

const deploymentsChartData = computed(() => {
  return deploymentsTrendData.value.map(item => ({
    date: item.date,
    value: item.deployments,
  }))
})

// Watch for date range changes and reload all data
watch(() => adminStore.activeDateRange, () => {
  if (activeTab.value === 'overview') {
    loadPlatformOverview()
    loadMauTrend()
    loadSuccessRateTrend()
    loadAppsTrend()
    loadBundlesTrend()
    loadDeploymentsTrend()
  }
}, { deep: true })

onMounted(async () => {
  // Verify admin access
  if (!mainStore.isAdmin) {
    console.error('Non-admin user attempted to access admin dashboard')
    router.push('/dashboard')
    return
  }

  isLoading.value = true

  // Load ALL platform overview and trend data in parallel
  await Promise.all([
    loadPlatformOverview(),
    loadMauTrend(),
    loadSuccessRateTrend(),
    loadAppsTrend(),
    loadBundlesTrend(),
    loadDeploymentsTrend(),
  ])

  isLoading.value = false
  displayStore.NavTitle = t('admin-dashboard')
})

displayStore.NavTitle = t('admin-dashboard')
displayStore.defaultBack = '/dashboard'

function switchTab(tab: 'overview' | 'updates' | 'performance' | 'users') {
  activeTab.value = tab
}
</script>

<template>
  <div>
    <div class="h-full pb-4 overflow-hidden">
      <div class="w-full h-full px-4 pt-2 mx-auto mb-8 overflow-y-auto sm:px-6 md:pt-8 lg:px-8 max-w-9xl max-h-fit">
        <!-- Admin Dashboard Header -->
        <div class="mb-6">
          <h1 class="text-3xl font-bold text-base-content">
            {{ t('admin-dashboard') }}
          </h1>
          <p class="mt-2 text-base-content/60">
            {{ t('admin-dashboard-description') }}
          </p>
        </div>

        <!-- Filter Bar -->
        <AdminFilterBar />

        <!-- Loading State -->
        <div v-if="isLoading" class="flex items-center justify-center h-64">
          <span class="loading loading-spinner loading-lg" />
        </div>

        <!-- Dashboard Content -->
        <div v-else>
          <!-- Tabs Navigation -->
          <div class="mb-6 tabs tabs-boxed">
            <button
              class="tab"
              :class="{ 'tab-active': activeTab === 'overview' }"
              @click="switchTab('overview')"
            >
              {{ t('overview') }}
            </button>
            <button
              class="tab"
              :class="{ 'tab-active': activeTab === 'updates' }"
              @click="switchTab('updates')"
            >
              {{ t('updates') }}
            </button>
            <button
              class="tab"
              :class="{ 'tab-active': activeTab === 'performance' }"
              @click="switchTab('performance')"
            >
              {{ t('performance') }}
            </button>
            <button
              class="tab"
              :class="{ 'tab-active': activeTab === 'users' }"
              @click="switchTab('users')"
            >
              {{ t('users-and-revenue') }}
            </button>
          </div>

          <!-- Tab Content -->
          <div class="tab-content">
            <!-- Overview Tab -->
            <div v-if="activeTab === 'overview'" class="space-y-6">
              <!-- Key Metrics - Properly styled cards -->
              <div class="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
                <!-- MAU Card -->
                <div class="flex flex-col justify-between p-6 bg-white rounded-lg border shadow-lg border-slate-300 dark:bg-gray-800 dark:border-slate-900">
                  <div class="flex justify-between items-start mb-4">
                    <div class="p-3 rounded-lg bg-primary/10">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="w-6 h-6 stroke-current text-primary"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                    </div>
                  </div>
                  <div>
                    <p class="text-sm text-slate-600 dark:text-slate-400">
                      Monthly Active Users
                    </p>
                    <div v-if="adminStore.isLoading && adminStore.loadingCategory === 'platform_overview'" class="my-2">
                      <span class="loading loading-spinner loading-lg text-primary" />
                    </div>
                    <p v-else class="mt-2 text-3xl font-bold text-primary">
                      {{ platformStats.mau.toLocaleString() }}
                    </p>
                    <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Total unique users this period
                    </p>
                  </div>
                </div>

                <!-- Active Apps Card -->
                <div class="flex flex-col justify-between p-6 bg-white rounded-lg border shadow-lg border-slate-300 dark:bg-gray-800 dark:border-slate-900">
                  <div class="flex justify-between items-start mb-4">
                    <div class="p-3 rounded-lg bg-secondary/10">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="w-6 h-6 stroke-current text-secondary"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                    </div>
                  </div>
                  <div>
                    <p class="text-sm text-slate-600 dark:text-slate-400">
                      Active Applications
                    </p>
                    <div v-if="adminStore.isLoading && adminStore.loadingCategory === 'platform_overview'" class="my-2">
                      <span class="loading loading-spinner loading-lg text-secondary" />
                    </div>
                    <p v-else class="mt-2 text-3xl font-bold text-secondary">
                      {{ platformStats.activeApps.toLocaleString() }}
                    </p>
                    <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Apps with activity this period
                    </p>
                  </div>
                </div>

                <!-- Active Orgs Card -->
                <div class="flex flex-col justify-between p-6 bg-white rounded-lg border shadow-lg border-slate-300 dark:bg-gray-800 dark:border-slate-900">
                  <div class="flex justify-between items-start mb-4">
                    <div class="p-3 rounded-lg bg-accent/10">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="w-6 h-6 stroke-current text-accent"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                    </div>
                  </div>
                  <div>
                    <p class="text-sm text-slate-600 dark:text-slate-400">
                      Active Organizations
                    </p>
                    <div v-if="adminStore.isLoading && adminStore.loadingCategory === 'platform_overview'" class="my-2">
                      <span class="loading loading-spinner loading-lg text-accent" />
                    </div>
                    <p v-else class="mt-2 text-3xl font-bold text-accent">
                      {{ platformStats.activeOrgs.toLocaleString() }}
                    </p>
                    <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Organizations with users
                    </p>
                  </div>
                </div>

                <!-- Success Rate Card -->
                <div class="flex flex-col justify-between p-6 bg-white rounded-lg border shadow-lg border-slate-300 dark:bg-gray-800 dark:border-slate-900">
                  <div class="flex justify-between items-start mb-4">
                    <div class="p-3 rounded-lg bg-success/10">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="w-6 h-6 stroke-current text-success"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </div>
                  </div>
                  <div>
                    <p class="text-sm text-slate-600 dark:text-slate-400">
                      Update Success Rate
                    </p>
                    <div v-if="adminStore.isLoading && adminStore.loadingCategory === 'platform_overview'" class="my-2">
                      <span class="loading loading-spinner loading-lg text-success" />
                    </div>
                    <p v-else class="mt-2 text-3xl font-bold text-success">
                      {{ platformStats.successRate.toFixed(1) }}%
                    </p>
                    <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Successful installs vs failures
                    </p>
                  </div>
                </div>
              </div>

              <!-- Trend Charts - Row 1 -->
              <div class="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <!-- MAU Trend Chart -->
                <ChartCard
                  :title="t('mau-trend')"
                  :is-loading="isLoadingMauTrend"
                  :has-data="mauChartData.length > 0"
                >
                  <AdminTrendChart
                    :data="mauChartData"
                    :label="t('monthly-active-users')"
                    color="#6366f1"
                  />
                </ChartCard>

                <!-- Success Rate Trend Chart -->
                <ChartCard
                  :title="t('success-rate-trend')"
                  :is-loading="isLoadingSuccessRateTrend"
                  :has-data="successRateChartData.length > 0"
                >
                  <AdminTrendChart
                    :data="successRateChartData"
                    :label="t('success-rate')"
                    color="#10b981"
                  />
                </ChartCard>
              </div>

              <!-- Trend Charts - Row 2 -->
              <div class="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <!-- Apps Activity Trend Chart -->
                <ChartCard
                  :title="t('apps-activity-trend')"
                  :is-loading="isLoadingAppsTrend"
                  :has-data="appsChartData.length > 0"
                >
                  <AdminTrendChart
                    :data="appsChartData"
                    :label="t('active-apps-per-day')"
                    color="#f59e0b"
                  />
                </ChartCard>

                <!-- Bundles Upload Trend Chart -->
                <ChartCard
                  :title="t('bundles-upload-trend')"
                  :is-loading="isLoadingBundlesTrend"
                  :has-data="bundlesChartData.length > 0"
                >
                  <AdminTrendChart
                    :data="bundlesChartData"
                    :label="t('bundles-uploaded-per-day')"
                    color="#8b5cf6"
                  />
                </ChartCard>
              </div>

              <!-- Trend Charts - Row 3 -->
              <div class="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <!-- Deployments Trend Chart -->
                <ChartCard
                  :title="t('deployments-trend')"
                  :is-loading="isLoadingDeploymentsTrend"
                  :has-data="deploymentsChartData.length > 0"
                >
                  <AdminTrendChart
                    :data="deploymentsChartData"
                    :label="t('deployments-per-day')"
                    color="#ec4899"
                  />
                </ChartCard>
              </div>
            </div>

            <!-- Updates Tab -->
            <div v-if="activeTab === 'updates'" class="space-y-6">
              <div class="shadow-xl card bg-base-100">
                <div class="card-body">
                  <h2 class="card-title">
                    Update Metrics
                  </h2>
                  <p class="text-base-content/60">
                    Upload, distribution, and download statistics will appear here
                  </p>
                </div>
              </div>
            </div>

            <!-- Performance Tab -->
            <div v-if="activeTab === 'performance'" class="space-y-6">
              <div class="shadow-xl card bg-base-100">
                <div class="card-body">
                  <h2 class="card-title">
                    Performance Metrics
                  </h2>
                  <p class="text-base-content/60">
                    Success rates, failure analysis, and timing statistics will appear here
                  </p>
                </div>
              </div>
            </div>

            <!-- Users & Revenue Tab -->
            <div v-if="activeTab === 'users'" class="space-y-6">
              <div class="shadow-xl card bg-base-100">
                <div class="card-body">
                  <h2 class="card-title">
                    Users & Revenue
                  </h2>
                  <p class="text-base-content/60">
                    MAU trends, paying users, and plan distribution will appear here
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
