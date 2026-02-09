<script setup lang="ts">
import type { ChartData, ChartOptions } from 'chart.js'
import type { TooltipClickHandler } from '~/services/chartTooltip'
import type { Database } from '~/types/supabase.types'
import { CategoryScale, Chart, Filler, LinearScale, LineElement, PointElement, Tooltip } from 'chart.js'
import { computed, ref, watchEffect } from 'vue'
import { Line } from 'vue-chartjs'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import IconAlertCircle from '~icons/lucide/alert-circle'
import IconAlertTriangle from '~icons/lucide/alert-triangle'
import IconCheckCircle from '~icons/lucide/check-circle'
import IconTrendingUp from '~icons/lucide/trending-up'
import { createTooltipConfig } from '~/services/chartTooltip'
import { formatDistanceToNow } from '~/services/date'
import { defaultApiHost, useSupabase } from '~/services/supabase'
import { useAppDetailStore } from '~/stores/appDetail'
import { useDisplayStore } from '~/stores/display'

Chart.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler)

interface Channel {
  version: Database['public']['Tables']['app_versions']['Row']
}

interface ChannelStatsResponse {
  labels: string[]
  datasets: Array<{ label: string, data: number[] }>
  latestVersion: {
    name: string
    percentage: string
  }
  currentVersion: string
  currentVersionReleasedAt: string | null
  deploymentHistory: Array<{ version_name: string, deployed_at: string }>
  lastDeploymentAt: string | null
  totalDeployments: number
  deploymentWindowCounts: {
    h24: number
    h72: number
    d7: number
  }
  totals: {
    total_devices: number
    devices_on_current: number
    devices_on_other: number
    percent_on_current: number
  }
}

const route = useRoute('/app/[app].channel.[channel].statistics')
const router = useRouter()
const displayStore = useDisplayStore()
const appDetailStore = useAppDetailStore()
const { t } = useI18n()
const supabase = useSupabase()

const packageId = ref<string>('')
const id = ref<number>(0)
const loading = ref(true)
const statsLoading = ref(true)
const channel = ref<Database['public']['Tables']['channels']['Row'] & Channel>()
const stats = ref<ChannelStatsResponse | null>(null)
const days = ref(14)

const bundleIdCache = ref<Record<string, number>>({})
const versionByLabel = computed(() => {
  const mapping: Record<string, string> = {}
  const datasets = stats.value?.datasets ?? []
  datasets.forEach((dataset) => {
    mapping[dataset.label] = dataset.label
  })
  return mapping
})

async function navigateToBundle(versionName: string) {
  if (!packageId.value)
    return
  if (bundleIdCache.value[versionName]) {
    router.push(`/app/${packageId.value}/bundle/${bundleIdCache.value[versionName]}`)
    return
  }
  const { data } = await supabase
    .from('app_versions')
    .select('id')
    .eq('app_id', packageId.value)
    .eq('name', versionName)
    .limit(1)
    .single()
  if (data?.id) {
    bundleIdCache.value[versionName] = data.id
    router.push(`/app/${packageId.value}/bundle/${data.id}`)
  }
}

const tooltipClickHandler = computed<TooltipClickHandler | undefined>(() => {
  if (!stats.value?.datasets?.length)
    return undefined
  return {
    onAppClick: navigateToBundle,
    appIdByLabel: versionByLabel.value,
  }
})

const statusType = computed(() => {
  if (!stats.value)
    return 'loading'
  if (stats.value.totals.total_devices === 0)
    return 'no-devices'
  if (stats.value.totals.percent_on_current >= 90)
    return 'healthy'
  if (stats.value.totals.percent_on_current >= 50)
    return 'warning'
  return 'critical'
})

const statusMessage = computed(() => {
  switch (statusType.value) {
    case 'loading':
      return t('loading-statistics')
    case 'no-devices':
      return t('no-devices-on-channel')
    case 'healthy':
      return t('updates-working-well', { percent: stats.value?.totals.percent_on_current.toFixed(1) })
    case 'warning':
      return t('partial-adoption', { percent: stats.value?.totals.percent_on_current.toFixed(1) })
    case 'critical':
      return t('low-adoption-warning', { percent: stats.value?.totals.percent_on_current.toFixed(1) })
    default:
      return ''
  }
})

const currentVersionDeployLabel = computed(() => {
  if (!stats.value?.currentVersionReleasedAt)
    return '-'
  const date = new Date(stats.value.currentVersionReleasedAt)
  if (Number.isNaN(date.getTime()))
    return '-'
  const diffMs = Date.now() - date.getTime()
  if (diffMs < 24 * 60 * 60 * 1000)
    return formatDistanceToNow(date)
  return date.toLocaleDateString()
})

const chartPalette = [
  { border: 'rgb(34, 197, 94)', background: 'rgba(34, 197, 94, 0.3)' },
  { border: 'rgb(251, 146, 60)', background: 'rgba(251, 146, 60, 0.3)' },
  { border: 'rgb(244, 63, 94)', background: 'rgba(244, 63, 94, 0.3)' },
  { border: 'rgb(59, 130, 246)', background: 'rgba(59, 130, 246, 0.3)' },
  { border: 'rgb(168, 85, 247)', background: 'rgba(168, 85, 247, 0.3)' },
  { border: 'rgb(16, 185, 129)', background: 'rgba(16, 185, 129, 0.3)' },
] as const

const chartData = computed<ChartData<'line'>>(() => {
  if (!stats.value) {
    return {
      labels: [],
      datasets: [],
    }
  }

  return {
    labels: stats.value.labels.map((d) => {
      const date = new Date(d)
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    }),
    datasets: stats.value.datasets.map((dataset, index) => {
      const color = chartPalette[index % chartPalette.length]
      return {
        label: dataset.label,
        data: dataset.data,
        backgroundColor: color.background,
        borderColor: color.border,
        borderWidth: 2,
        fill: false,
        tension: 0.4,
        pointRadius: 3,
        pointHoverRadius: 5,
      }
    }),
  }
})

const currentVersionColor = computed(() => {
  const current = stats.value?.currentVersion
  if (!current || !stats.value?.datasets?.length)
    return null
  const index = stats.value.datasets.findIndex(dataset => dataset.label === current)
  if (index < 0)
    return null
  return chartPalette[index % chartPalette.length]
})

const chartOptions = computed<ChartOptions<'line'>>(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: {
    mode: 'index',
    intersect: false,
  },
  plugins: {
    legend: {
      display: false,
    },
    tooltip: createTooltipConfig(true, false, undefined, tooltipClickHandler.value),
  },
  scales: {
    x: {
      grid: {
        display: false,
      },
      ticks: {
        font: {
          size: 11,
        },
      },
    },
    y: {
      beginAtZero: true,
      grid: {
        color: 'rgba(0, 0, 0, 0.05)',
      },
      ticks: {
        font: {
          size: 11,
        },
        precision: 0,
      },
    },
  },
}))

async function getChannel() {
  if (!id.value)
    return

  if (appDetailStore.currentChannelId === id.value && appDetailStore.currentChannel) {
    channel.value = appDetailStore.currentChannel as any
    if (channel.value?.name)
      displayStore.setChannelName(String(channel.value.id), channel.value.name)
    displayStore.NavTitle = channel.value?.name ?? t('channel')
    return
  }

  try {
    const { data, error } = await supabase
      .from('channels')
      .select(`
          id,
          name,
          public,
          owner_org,
          version (
            id,
            name,
            app_id,
            created_at,
            min_update_version,
            storage_provider,
            link,
            comment
          ),
          created_at,
          app_id,
          allow_emulator,
          allow_device,
          allow_dev,
          allow_prod,
          allow_device_self_set,
          disable_auto_update_under_native,
          disable_auto_update,
          ios,
          android,
          updated_at
        `)
      .eq('id', id.value)
      .single()

    if (error) {
      console.error('no channel', error)
      return
    }

    channel.value = data as unknown as Database['public']['Tables']['channels']['Row'] & Channel
    appDetailStore.setChannel(id.value, channel.value)

    if (channel.value?.name)
      displayStore.setChannelName(String(channel.value.id), channel.value.name)
    displayStore.NavTitle = channel.value?.name ?? t('channel')
  }
  catch (error) {
    console.error(error)
  }
}

async function fetchStats() {
  if (!id.value || !channel.value)
    return

  statsLoading.value = true
  try {
    const { data: sessionData } = await supabase.auth.getSession()
    if (!sessionData.session) {
      toast.error(t('not-authenticated'))
      return
    }

    const response = await fetch(`${defaultApiHost}/private/channel_stats`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'authorization': `Bearer ${sessionData.session.access_token}`,
      },
      body: JSON.stringify({
        channel_id: id.value,
        app_id: packageId.value,
        days: days.value,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('Failed to fetch channel stats:', errorData)
      toast.error(t('failed-to-fetch-statistics'))
      return
    }

    const result: ChannelStatsResponse = await response.json()
    stats.value = result
  }
  catch (error) {
    console.error('Error fetching channel stats:', error)
    toast.error(t('failed-to-fetch-statistics'))
  }
  finally {
    statsLoading.value = false
  }
}

watchEffect(async () => {
  if (route.path.includes('/channel/') && route.path.includes('/statistics')) {
    loading.value = true
    packageId.value = route.params.app as string
    id.value = Number(route.params.channel as string)
    await getChannel()
    await fetchStats()
    loading.value = false

    if (!channel.value?.name)
      displayStore.NavTitle = t('channel')
    displayStore.defaultBack = `/app/${route.params.app}/channels`
  }
})
</script>

<template>
  <div>
    <div v-if="loading" class="flex flex-col justify-center items-center min-h-[50vh]">
      <Spinner size="w-40 h-40" />
    </div>
    <div v-else-if="channel" class="w-full h-full px-0 pt-0 mx-auto mb-8 sm:px-6 md:pt-8 lg:px-8 max-w-9xl max-h-fit">
      <div class="flex flex-col gap-6">
        <!-- Status Banner -->
        <div
          class="p-4 border rounded-lg shadow-sm"
          :class="{
            'bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800': statusType === 'healthy',
            'bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800': statusType === 'warning' || statusType === 'no-devices',
            'bg-rose-50 border-rose-200 dark:bg-rose-900/20 dark:border-rose-800': statusType === 'critical',
            'bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-700': statusType === 'loading',
          }"
        >
          <div class="flex items-center gap-3">
            <IconCheckCircle
              v-if="statusType === 'healthy'"
              class="w-6 h-6 text-emerald-600 dark:text-emerald-400"
            />
            <IconAlertTriangle
              v-else-if="statusType === 'warning' || statusType === 'no-devices'"
              class="w-6 h-6 text-amber-600 dark:text-amber-400"
            />
            <IconAlertCircle
              v-else-if="statusType === 'critical'"
              class="w-6 h-6 text-rose-600 dark:text-rose-400"
            />
            <div
              v-else
              class="w-6 h-6 border-2 rounded-full border-slate-300 dark:border-slate-600 border-t-transparent animate-spin"
            />
            <div>
              <h3
                class="font-semibold"
                :class="{
                  'text-emerald-800 dark:text-emerald-200': statusType === 'healthy',
                  'text-amber-800 dark:text-amber-200': statusType === 'warning' || statusType === 'no-devices',
                  'text-rose-800 dark:text-rose-200': statusType === 'critical',
                  'text-slate-800 dark:text-slate-200': statusType === 'loading',
                }"
              >
                {{ statusMessage }}
              </h3>
              <p
                v-if="stats && stats.totals.total_devices > 0"
                class="mt-1 text-sm"
                :class="{
                  'text-emerald-700 dark:text-emerald-300': statusType === 'healthy',
                  'text-amber-700 dark:text-amber-300': statusType === 'warning',
                  'text-rose-700 dark:text-rose-300': statusType === 'critical',
                }"
              >
                {{ Math.round(stats.totals.devices_on_current) }} / {{ Math.round(stats.totals.total_devices) }} {{ t('devices-updated') }}
              </p>
            </div>
          </div>
        </div>

        <!-- Stats Overview Cards -->
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div class="p-4 bg-white border rounded-lg shadow-sm dark:bg-slate-800 border-slate-200 dark:border-slate-700">
            <div class="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
              <span
                class="w-2.5 h-2.5 rounded-full"
                :style="currentVersionColor ? { backgroundColor: currentVersionColor.border } : undefined"
              />
              <IconTrendingUp class="w-4 h-4" />
              {{ t('current-version') }}
            </div>
            <div class="mt-2 text-lg font-semibold text-slate-900 dark:text-white">
              {{ stats?.currentVersion || '-' }}
            </div>
            <div class="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {{ t('released') }}: {{ currentVersionDeployLabel }}
            </div>
          </div>

          <div class="p-4 bg-white border rounded-lg shadow-sm dark:bg-slate-800 border-slate-200 dark:border-slate-700">
            <div class="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
              <IconCheckCircle class="w-4 h-4" />
              {{ t('adoption-rate') }}
            </div>
            <div
              class="mt-2 text-lg font-semibold" :class="{
                'text-emerald-600 dark:text-emerald-400': (stats?.totals.percent_on_current || 0) >= 90,
                'text-amber-600 dark:text-amber-400': (stats?.totals.percent_on_current || 0) >= 50 && (stats?.totals.percent_on_current || 0) < 90,
                'text-rose-600 dark:text-rose-400': (stats?.totals.percent_on_current || 0) < 50,
              }"
            >
              {{ stats?.totals.percent_on_current.toFixed(1) || '0.0' }}%
            </div>
          </div>

          <div class="p-4 bg-white border rounded-lg shadow-sm dark:bg-slate-800 border-slate-200 dark:border-slate-700">
            <div class="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
              <IconAlertCircle class="w-4 h-4" />
              {{ t('updated-devices') }}
            </div>
            <div class="mt-2 text-lg font-semibold text-slate-900 dark:text-white">
              {{ stats ? Math.round(stats.totals.total_devices) : 0 }}
            </div>
          </div>
        </div>

        <!-- Chart -->
        <div class="p-4 bg-white border rounded-lg shadow-sm dark:bg-slate-800 border-slate-200 dark:border-slate-700">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
              {{ t('device-version-adoption-over-time') }}
            </h3>
            <div class="flex items-center gap-2">
              <button
                v-for="d in [7, 14, 30]"
                :key="d"
                class="px-3 py-1 text-sm transition-colors rounded-md"
                :class="days === d
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'"
                @click="days = d; fetchStats()"
              >
                {{ d }} {{ t('days') }}
              </button>
            </div>
          </div>

          <div v-if="statsLoading" class="flex items-center justify-center h-64">
            <Spinner size="w-12 h-12" />
          </div>

          <div v-else-if="!stats || stats.totals.total_devices === 0" class="flex flex-col items-center justify-center h-64 text-slate-500 dark:text-slate-400">
            <IconAlertCircle class="w-12 h-12 mb-2" />
            <p>{{ t('no-data-available') }}</p>
            <p class="mt-1 text-sm">
              {{ t('devices-will-appear-here') }}
            </p>
          </div>

          <div v-else class="relative h-64">
            <Line :data="chartData" :options="chartOptions" />
          </div>

          <!-- Legend -->
          <div v-if="stats && stats.totals.total_devices > 0" class="flex flex-wrap items-center justify-center gap-4 mt-4 text-sm">
            <div
              v-for="(dataset, index) in stats.datasets"
              :key="dataset.label"
              class="flex items-center gap-2"
            >
              <div
                class="w-3 h-3 rounded-full"
                :class="[
                  index === 0 ? 'bg-emerald-500'
                  : index === 1 ? 'bg-orange-400'
                    : index === 2 ? 'bg-rose-400'
                      : index === 3 ? 'bg-blue-500'
                        : index === 4 ? 'bg-purple-500'
                          : 'bg-teal-500',
                ]"
              />
              <span class="text-slate-700 dark:text-slate-300">
                {{ dataset.label }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="flex flex-col justify-center items-center min-h-[50vh]">
      <IconAlertCircle class="w-16 h-16 mb-4 text-destructive" />
      <h2 class="text-xl font-semibold text-foreground">
        {{ t('channel-not-found') }}
      </h2>
      <p class="mt-2 text-muted-foreground">
        {{ t('channel-not-found-description') }}
      </p>
      <button class="mt-4 text-white d-btn d-btn-primary" @click="router.push(`/app/${packageId}/channels`)">
        {{ t('back-to-channels') }}
      </button>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: app
</route>
