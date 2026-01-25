<route lang="yaml">
meta:
  layout: admin
</route>

<script setup lang="ts">
import type { TableColumn } from '~/components/comp_def'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import AdminFilterBar from '~/components/admin/AdminFilterBar.vue'
import AdminMultiLineChart from '~/components/admin/AdminMultiLineChart.vue'
import ChartCard from '~/components/dashboard/ChartCard.vue'
import Spinner from '~/components/Spinner.vue'
import Table from '~/components/Table.vue'
import { defaultApiHost, useSupabase } from '~/services/supabase'
import { useAdminDashboardStore } from '~/stores/adminDashboard'
import { useDisplayStore } from '~/stores/display'
import { useMainStore } from '~/stores/main'

const { t } = useI18n()
const displayStore = useDisplayStore()
const mainStore = useMainStore()
const adminStore = useAdminDashboardStore()
const router = useRouter()
const isLoading = ref(true)

// Onboarding funnel data
interface OnboardingFunnelData {
  total_orgs: number
  orgs_with_app: number
  orgs_with_channel: number
  orgs_with_bundle: number
  app_conversion_rate: number
  channel_conversion_rate: number
  bundle_conversion_rate: number
  trend: Array<{
    date: string
    new_orgs: number
    orgs_created_app: number
    orgs_created_channel: number
    orgs_created_bundle: number
  }>
}

const onboardingFunnelData = ref<OnboardingFunnelData | null>(null)
const isLoadingOnboardingFunnel = ref(false)

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
}>>([])

const isLoadingGlobalStatsTrend = ref(false)

// Trial organizations data
interface TrialOrganization {
  org_id: string
  org_name: string
  management_email: string
  trial_end_date: string
  days_remaining: number
  created_at: string
}

interface TrialOrganizationsResponse {
  success: boolean
  data: {
    organizations: TrialOrganization[]
    total: number
  }
}

interface CancelledOrganization {
  org_id: string
  org_name: string
  management_email: string
  canceled_at: string
  cancellation_reason: string | null
}

interface CancelledOrganizationsResponse {
  success: boolean
  data: {
    organizations: CancelledOrganization[]
    total: number
  }
}

const trialOrganizations = ref<TrialOrganization[]>([])
const trialOrganizationsTotal = ref(0)
const trialOrganizationsCurrentPage = ref(1)
const isLoadingTrialOrganizations = ref(false)
const TRIAL_PAGE_SIZE = 20

const cancelledOrganizations = ref<CancelledOrganization[]>([])
const cancelledOrganizationsTotal = ref(0)
const cancelledOrganizationsCurrentPage = ref(1)
const isLoadingCancelledOrganizations = ref(false)
const CANCELLED_PAGE_SIZE = 20

const trialOrganizationsColumns = ref<TableColumn[]>([
  { label: t('org-name'), key: 'org_name', mobile: true, head: true, sortable: false },
  { label: t('email'), key: 'management_email', mobile: false, sortable: false },
  {
    label: t('days-remaining'),
    key: 'days_remaining',
    mobile: true,
    sortable: false,
    displayFunction: (item: TrialOrganization) => {
      if (item.days_remaining === 0)
        return t('expires-today')
      if (item.days_remaining === 1)
        return `1 ${t('day')}`
      return `${item.days_remaining} ${t('days')}`
    },
  },
  {
    label: t('trial-end-date'),
    key: 'trial_end_date',
    mobile: false,
    sortable: false,
    displayFunction: (item: TrialOrganization) => {
      const date = new Date(item.trial_end_date)
      return date.toLocaleDateString()
    },
  },
])

const cancelledOrganizationsColumns = ref<TableColumn[]>([
  { label: t('org-name'), key: 'org_name', mobile: true, head: true, sortable: false },
  { label: t('email'), key: 'management_email', mobile: false, sortable: false },
  {
    label: t('cancellation-date'),
    key: 'canceled_at',
    mobile: true,
    sortable: false,
    displayFunction: (item: CancelledOrganization) => {
      if (!item.canceled_at)
        return t('unknown')
      const date = new Date(item.canceled_at)
      return date.toLocaleDateString()
    },
  },
  {
    label: t('cancellation-reason'),
    key: 'cancellation_reason',
    mobile: false,
    sortable: false,
    displayFunction: (item: CancelledOrganization) => item.cancellation_reason || t('unknown'),
  },
])

async function loadTrialOrganizations() {
  isLoadingTrialOrganizations.value = true
  try {
    const supabase = useSupabase()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session)
      throw new Error('Not authenticated')

    const offset = (trialOrganizationsCurrentPage.value - 1) * TRIAL_PAGE_SIZE

    // Note: start_date and end_date are required by the API schema but not used for trial_organizations
    // which queries current trial status rather than time-series data
    const response = await fetch(`${defaultApiHost}/private/admin_stats`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        metric_category: 'trial_organizations',
        start_date: new Date().toISOString(),
        end_date: new Date().toISOString(),
        limit: TRIAL_PAGE_SIZE,
        offset,
      }),
    })

    if (!response.ok) {
      const errorData: unknown = await response.json().catch(() => ({}))
      throw new Error(`API error: ${response.status} - ${JSON.stringify(errorData)}`)
    }

    const data = await response.json() as TrialOrganizationsResponse
    if (!data.success)
      throw new Error('Failed to fetch trial organizations')

    trialOrganizations.value = data.data.organizations || []
    trialOrganizationsTotal.value = data.data.total || 0
  }
  catch (error) {
    console.error('[Admin Dashboard Users] Error loading trial organizations:', error)
    trialOrganizations.value = []
    trialOrganizationsTotal.value = 0
  }
  finally {
    isLoadingTrialOrganizations.value = false
  }
}

async function loadCancelledOrganizations() {
  isLoadingCancelledOrganizations.value = true
  try {
    const supabase = useSupabase()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session)
      throw new Error('Not authenticated')

    const offset = (cancelledOrganizationsCurrentPage.value - 1) * CANCELLED_PAGE_SIZE

    const response = await fetch(`${defaultApiHost}/private/admin_stats`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        metric_category: 'cancelled_users',
        start_date: new Date().toISOString(),
        end_date: new Date().toISOString(),
        limit: CANCELLED_PAGE_SIZE,
        offset,
      }),
    })

    if (!response.ok) {
      const errorData: unknown = await response.json().catch(() => ({}))
      throw new Error(`API error: ${response.status} - ${JSON.stringify(errorData)}`)
    }

    const data = await response.json() as CancelledOrganizationsResponse
    if (!data.success)
      throw new Error('Failed to fetch cancelled organizations')

    cancelledOrganizations.value = data.data.organizations || []
    cancelledOrganizationsTotal.value = data.data.total || 0
  }
  catch (error) {
    console.error('[Admin Dashboard Users] Error loading cancelled organizations:', error)
    cancelledOrganizations.value = []
    cancelledOrganizationsTotal.value = 0
  }
  finally {
    isLoadingCancelledOrganizations.value = false
  }
}

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

async function loadOnboardingFunnel() {
  isLoadingOnboardingFunnel.value = true
  try {
    const data = await adminStore.fetchStats('onboarding_funnel')
    console.log('[Admin Dashboard Users] Onboarding funnel data:', data)
    onboardingFunnelData.value = data || null
  }
  catch (error) {
    console.error('[Admin Dashboard Users] Error loading onboarding funnel:', error)
    onboardingFunnelData.value = null
  }
  finally {
    isLoadingOnboardingFunnel.value = false
  }
}

// Computed properties for multi-line charts
const usersTrendSeries = computed(() => {
  if (globalStatsTrendData.value.length === 0)
    return []

  return [
    {
      label: 'Paying Organizations',
      data: globalStatsTrendData.value.map(item => ({
        date: item.date,
        value: item.paying,
      })),
      color: '#10b981', // green
    },
    {
      label: 'Trial Organizations',
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
  const total = latest.plan_solo + latest.plan_maker + latest.plan_team + latest.plan_enterprise

  return [
    {
      label: 'Solo',
      value: latest.plan_solo,
      percentage: total > 0 ? ((latest.plan_solo / total) * 100).toFixed(1) : '0',
    },
    {
      label: 'Maker',
      value: latest.plan_maker,
      percentage: total > 0 ? ((latest.plan_maker / total) * 100).toFixed(1) : '0',
    },
    {
      label: 'Team',
      value: latest.plan_team,
      percentage: total > 0 ? ((latest.plan_team / total) * 100).toFixed(1) : '0',
    },
    {
      label: 'Enterprise',
      value: latest.plan_enterprise,
      percentage: total > 0 ? ((latest.plan_enterprise / total) * 100).toFixed(1) : '0',
    },
  ]
})

const planDistributionTrendSeries = computed(() => {
  if (globalStatsTrendData.value.length === 0)
    return []

  return [
    {
      label: 'Solo',
      data: globalStatsTrendData.value.map(item => ({
        date: item.date,
        value: item.plan_solo,
      })),
      color: '#8b5cf6', // purple
    },
    {
      label: 'Maker',
      data: globalStatsTrendData.value.map(item => ({
        date: item.date,
        value: item.plan_maker,
      })),
      color: '#ec4899', // pink
    },
    {
      label: 'Team',
      data: globalStatsTrendData.value.map(item => ({
        date: item.date,
        value: item.plan_team,
      })),
      color: '#10b981', // green
    },
    {
      label: 'Enterprise',
      data: globalStatsTrendData.value.map(item => ({
        date: item.date,
        value: item.plan_enterprise,
      })),
      color: '#f59e0b', // amber
    },
  ]
})

const latestGlobalStats = computed(() => {
  if (globalStatsTrendData.value.length === 0)
    return null
  return globalStatsTrendData.value[globalStatsTrendData.value.length - 1]
})

// Onboarding funnel stages for display
const onboardingFunnelStages = computed(() => {
  if (!onboardingFunnelData.value)
    return []

  const data = onboardingFunnelData.value
  return [
    {
      label: 'Organizations Created',
      value: data.total_orgs,
      percentage: 100,
      color: '#3b82f6', // blue
    },
    {
      label: 'Created an App',
      value: data.orgs_with_app,
      percentage: data.app_conversion_rate,
      color: '#8b5cf6', // purple
    },
    {
      label: 'Created a Channel',
      value: data.orgs_with_channel,
      percentage: data.channel_conversion_rate,
      color: '#f59e0b', // amber
    },
    {
      label: 'Uploaded a Bundle',
      value: data.orgs_with_bundle,
      percentage: data.bundle_conversion_rate,
      color: '#10b981', // green
    },
  ]
})

// Onboarding funnel trend for multi-line chart
const onboardingFunnelTrendSeries = computed(() => {
  if (!onboardingFunnelData.value || !onboardingFunnelData.value.trend)
    return []

  const trend = onboardingFunnelData.value.trend
  return [
    {
      label: 'New Organizations',
      data: trend.map(item => ({
        date: item.date,
        value: item.new_orgs,
      })),
      color: '#3b82f6', // blue
    },
    {
      label: 'Created App (within 7 days)',
      data: trend.map(item => ({
        date: item.date,
        value: item.orgs_created_app,
      })),
      color: '#8b5cf6', // purple
    },
    {
      label: 'Created Channel (within 7 days)',
      data: trend.map(item => ({
        date: item.date,
        value: item.orgs_created_channel,
      })),
      color: '#f59e0b', // amber
    },
    {
      label: 'Uploaded Bundle (within 7 days)',
      data: trend.map(item => ({
        date: item.date,
        value: item.orgs_created_bundle,
      })),
      color: '#10b981', // green
    },
  ]
})

watch(() => adminStore.activeDateRange, () => {
  loadGlobalStatsTrend()
  loadOnboardingFunnel()
}, { deep: true })

// Watch for refresh button clicks
watch(() => adminStore.refreshTrigger, () => {
  loadGlobalStatsTrend()
  loadOnboardingFunnel()
  loadTrialOrganizations()
  loadCancelledOrganizations()
})

onMounted(async () => {
  if (!mainStore.isAdmin) {
    console.error('Non-admin user attempted to access admin dashboard')
    router.push('/dashboard')
    return
  }

  isLoading.value = true
  await Promise.all([loadGlobalStatsTrend(), loadOnboardingFunnel(), loadTrialOrganizations(), loadCancelledOrganizations()])
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
          <!-- Onboarding Funnel Section -->
          <div class="p-6 bg-white border rounded-lg shadow-lg border-slate-300 dark:bg-gray-800 dark:border-slate-900">
            <h3 class="mb-4 text-lg font-semibold">
              {{ t('onboarding-funnel') }}
            </h3>
            <p class="mb-4 text-sm text-slate-600 dark:text-slate-400">
              {{ t('onboarding-funnel-description') }}
            </p>
            <div v-if="isLoadingOnboardingFunnel" class="flex items-center justify-center h-48">
              <span class="loading loading-spinner loading-lg" />
            </div>
            <div v-else-if="onboardingFunnelStages.length > 0" class="space-y-4">
              <!-- Funnel bars -->
              <div v-for="(stage, index) in onboardingFunnelStages" :key="stage.label" class="relative">
                <div class="flex items-center justify-between mb-1">
                  <span class="text-sm font-medium text-gray-700 dark:text-gray-300">{{ stage.label }}</span>
                  <span class="text-sm font-bold" :style="{ color: stage.color }">
                    {{ stage.value.toLocaleString() }}
                    <span v-if="index > 0" class="ml-2 text-xs text-gray-500">
                      ({{ stage.percentage.toFixed(1) }}% {{ index === 1 ? 'of orgs' : 'of previous' }})
                    </span>
                  </span>
                </div>
                <div class="w-full h-8 overflow-hidden bg-gray-200 rounded-lg dark:bg-gray-700">
                  <div
                    class="h-full transition-all duration-500 rounded-lg"
                    :style="{
                      width: `${index === 0 ? 100 : Math.max(5, (stage.value / onboardingFunnelStages[0].value) * 100)}%`,
                      backgroundColor: stage.color,
                    }"
                  />
                </div>
              </div>

              <!-- Conversion summary -->
              <div class="grid grid-cols-3 gap-4 pt-4 mt-4 border-t border-gray-200 dark:border-gray-700">
                <div class="text-center">
                  <p class="text-2xl font-bold text-purple-500">
                    {{ onboardingFunnelData?.app_conversion_rate?.toFixed(1) || 0 }}%
                  </p>
                  <p class="text-xs text-gray-500 dark:text-gray-400">
                    Org → App
                  </p>
                </div>
                <div class="text-center">
                  <p class="text-2xl font-bold text-amber-500">
                    {{ onboardingFunnelData?.channel_conversion_rate?.toFixed(1) || 0 }}%
                  </p>
                  <p class="text-xs text-gray-500 dark:text-gray-400">
                    App → Channel
                  </p>
                </div>
                <div class="text-center">
                  <p class="text-2xl font-bold text-emerald-500">
                    {{ onboardingFunnelData?.bundle_conversion_rate?.toFixed(1) || 0 }}%
                  </p>
                  <p class="text-xs text-gray-500 dark:text-gray-400">
                    Channel → Bundle
                  </p>
                </div>
              </div>
            </div>
            <div v-else class="flex items-center justify-center h-48 text-slate-400">
              {{ t('no-data-available') }}
            </div>
          </div>

          <!-- Onboarding Trend Chart -->
          <ChartCard
            :title="t('onboarding-trend')"
            :is-loading="isLoadingOnboardingFunnel"
            :has-data="onboardingFunnelTrendSeries.length > 0"
          >
            <AdminMultiLineChart
              :series="onboardingFunnelTrendSeries"
              :is-loading="isLoadingOnboardingFunnel"
            />
          </ChartCard>

          <!-- Organization Metrics Cards -->
          <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
            <!-- Paying Organizations -->
            <div class="flex flex-col justify-between p-6 bg-white border rounded-lg shadow-lg border-slate-300 dark:bg-gray-800 dark:border-slate-900">
              <div class="flex items-start justify-between mb-4">
                <div class="p-3 rounded-lg bg-success/10">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="w-6 h-6 stroke-current text-success"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
              </div>
              <div>
                <p class="text-sm text-slate-600 dark:text-slate-400">
                  Paying Organizations
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

            <!-- Trial Organizations -->
            <div class="flex flex-col justify-between p-6 bg-white border rounded-lg shadow-lg border-slate-300 dark:bg-gray-800 dark:border-slate-900">
              <div class="flex items-start justify-between mb-4">
                <div class="p-3 rounded-lg bg-warning/10">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="w-6 h-6 stroke-current text-warning"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
              </div>
              <div>
                <p class="text-sm text-slate-600 dark:text-slate-400">
                  Trial Organizations
                </p>
                <p v-if="latestGlobalStats" class="mt-2 text-3xl font-bold text-warning">
                  {{ latestGlobalStats.trial.toLocaleString() }}
                </p>
                <p v-else class="mt-2 text-3xl font-bold text-warning">
                  0
                </p>
                <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Organizations in trial period
                </p>
              </div>
            </div>
          </div>

          <!-- Trial Organizations Table -->
          <div class="p-6 bg-white border rounded-lg shadow-lg border-slate-300 dark:bg-gray-800 dark:border-slate-900">
            <h3 class="mb-4 text-lg font-semibold">
              {{ t('trial-organizations-list') }}
            </h3>
            <Table
              :is-loading="isLoadingTrialOrganizations"
              :total="trialOrganizationsTotal"
              :current-page="trialOrganizationsCurrentPage"
              :columns="trialOrganizationsColumns"
              :element-list="trialOrganizations"
              :auto-reload="false"
              @reload="loadTrialOrganizations"
              @reset="loadTrialOrganizations"
              @update:current-page="(page: number) => { trialOrganizationsCurrentPage = page; loadTrialOrganizations() }"
            />
          </div>

          <!-- Cancelled Organizations Table -->
          <div class="p-6 bg-white border rounded-lg shadow-lg border-slate-300 dark:bg-gray-800 dark:border-slate-900">
            <h3 class="mb-4 text-lg font-semibold">
              {{ t('cancelled-organizations-list') }}
            </h3>
            <Table
              :is-loading="isLoadingCancelledOrganizations"
              :total="cancelledOrganizationsTotal"
              :current-page="cancelledOrganizationsCurrentPage"
              :columns="cancelledOrganizationsColumns"
              :element-list="cancelledOrganizations"
              :auto-reload="false"
              @reload="loadCancelledOrganizations"
              @reset="loadCancelledOrganizations"
              @update:current-page="(page: number) => { cancelledOrganizationsCurrentPage = page; loadCancelledOrganizations() }"
            />
          </div>

          <!-- Plan Distribution - Full Width -->
          <div class="grid grid-cols-1 gap-6">
            <!-- Current Distribution -->
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
                  <span class="mt-1 text-xs text-gray-500 dark:text-gray-400">{{ plan.percentage }}%</span>
                </div>
              </div>
              <div v-else class="flex items-center justify-center h-32 text-slate-400">
                No data available
              </div>
            </div>
          </div>

          <!-- Plan Distribution Trend Chart -->
          <div class="grid grid-cols-1 gap-6">
            <ChartCard
              :title="t('plan-distribution-trend')"
              :is-loading="isLoadingGlobalStatsTrend"
              :has-data="planDistributionTrendSeries.length > 0"
            >
              <AdminMultiLineChart
                :series="planDistributionTrendSeries"
                :is-loading="isLoadingGlobalStatsTrend"
              />
            </ChartCard>
          </div>

          <!-- Charts - 2 per row -->
          <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
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
