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
  success_rate: number
  bundle_storage_gb: number
  plan_solo: number
  plan_maker: number
  plan_team: number
  plan_payg: number
  registers_today: number
}>>([])

const isLoadingGlobalStatsTrend = ref(false)

async function loadGlobalStatsTrend() {
  isLoadingGlobalStatsTrend.value = true
  try {
    const data = await adminStore.fetchStats('global_stats_trend')
    console.log('[Admin Dashboard Users] Global stats trend data:', data)
    globalStatsTrendData.value = data || []
  }
  catch (error) {
    console.error('[Admin Dashboard Users] Error loading global stats trend:', error)
    globalStatsTrendData.value = []
  }
  finally {
    isLoadingGlobalStatsTrend.value = false
  }
}

// Computed properties for multi-line charts
const usersTrendSeries = computed(() => {
  if (globalStatsTrendData.value.length === 0)
    return []

  return [
    {
      label: 'Paying Users',
      data: globalStatsTrendData.value.map(item => ({
        date: item.date,
        value: item.paying,
      })),
      color: '#10b981', // green
    },
    {
      label: 'Trial Users',
      data: globalStatsTrendData.value.map(item => ({
        date: item.date,
        value: item.trial,
      })),
      color: '#f59e0b', // amber
    },
  ]
})

const registrationsTrendSeries = computed(() => {
  if (globalStatsTrendData.value.length === 0)
    return []

  return [
    {
      label: 'Daily Registrations',
      data: globalStatsTrendData.value.map(item => ({
        date: item.date,
        value: item.registers_today,
      })),
      color: '#3b82f6', // blue
    },
  ]
})

const planDistributionData = computed(() => {
  if (globalStatsTrendData.value.length === 0)
    return []

  const latest = globalStatsTrendData.value[globalStatsTrendData.value.length - 1]
  return [
    { label: 'Solo', value: latest.plan_solo },
    { label: 'Maker', value: latest.plan_maker },
    { label: 'Team', value: latest.plan_team },
    { label: 'Pay-as-you-go', value: latest.plan_payg },
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

onMounted(async () => {
  if (!mainStore.isAdmin) {
    console.error('Non-admin user attempted to access admin dashboard')
    router.push('/dashboard')
    return
  }

  isLoading.value = true
  await loadGlobalStatsTrend()
  isLoading.value = false

  displayStore.NavTitle = t('users-and-revenue')
})

displayStore.NavTitle = t('users-and-revenue')
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
          <!-- User Metrics Cards -->
          <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
            <!-- Paying Users -->
            <div class="flex flex-col justify-between p-6 bg-white border rounded-lg shadow-lg border-slate-300 dark:bg-gray-800 dark:border-slate-900">
              <div class="flex items-start justify-between mb-4">
                <div class="p-3 rounded-lg bg-success/10">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="w-6 h-6 stroke-current text-success"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
              </div>
              <div>
                <p class="text-sm text-slate-600 dark:text-slate-400">
                  Paying Users
                </p>
                <p v-if="latestGlobalStats" class="mt-2 text-3xl font-bold text-success">
                  {{ latestGlobalStats.paying.toLocaleString() }}
                </p>
                <p v-else class="mt-2 text-3xl font-bold text-success">
                  0
                </p>
                <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Active paying subscriptions
                </p>
              </div>
            </div>

            <!-- Trial Users -->
            <div class="flex flex-col justify-between p-6 bg-white border rounded-lg shadow-lg border-slate-300 dark:bg-gray-800 dark:border-slate-900">
              <div class="flex items-start justify-between mb-4">
                <div class="p-3 rounded-lg bg-warning/10">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="w-6 h-6 stroke-current text-warning"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
              </div>
              <div>
                <p class="text-sm text-slate-600 dark:text-slate-400">
                  Trial Users
                </p>
                <p v-if="latestGlobalStats" class="mt-2 text-3xl font-bold text-warning">
                  {{ latestGlobalStats.trial.toLocaleString() }}
                </p>
                <p v-else class="mt-2 text-3xl font-bold text-warning">
                  0
                </p>
                <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Users in trial period
                </p>
              </div>
            </div>
          </div>

          <!-- Plan Distribution -->
          <div class="grid grid-cols-1 gap-6">
            <div class="p-6 bg-white border rounded-lg shadow-lg border-slate-300 dark:bg-gray-800 dark:border-slate-900">
              <h3 class="mb-4 text-lg font-semibold">
                {{ t('plan-distribution') }}
              </h3>
              <div v-if="isLoadingGlobalStatsTrend" class="flex items-center justify-center h-32">
                <span class="loading loading-spinner loading-lg" />
              </div>
              <div v-else-if="planDistributionData.length > 0" class="grid grid-cols-2 gap-4 md:grid-cols-4">
                <div v-for="plan in planDistributionData" :key="plan.label" class="flex flex-col items-center p-4 bg-gray-100 rounded-lg dark:bg-gray-700">
                  <span class="text-sm font-medium text-gray-600 dark:text-gray-400">{{ plan.label }}</span>
                  <span class="mt-2 text-2xl font-bold">{{ plan.value.toLocaleString() }}</span>
                </div>
              </div>
              <div v-else class="flex items-center justify-center h-32 text-slate-400">
                No data available
              </div>
            </div>
          </div>

          <!-- Charts - 2 per row -->
          <div class="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <!-- Users Trend -->
            <ChartCard
              :title="t('users-trend')"
              :is-loading="isLoadingGlobalStatsTrend"
              :has-data="usersTrendSeries.length > 0"
            >
              <AdminMultiLineChart
                :series="usersTrendSeries"
                :is-loading="isLoadingGlobalStatsTrend"
              />
            </ChartCard>

            <!-- Daily Registrations -->
            <ChartCard
              :title="t('daily-registrations')"
              :is-loading="isLoadingGlobalStatsTrend"
              :has-data="registrationsTrendSeries.length > 0"
            >
              <AdminMultiLineChart
                :series="registrationsTrendSeries"
                :is-loading="isLoadingGlobalStatsTrend"
              />
            </ChartCard>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
