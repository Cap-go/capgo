<script setup lang="ts">
import type { ChartData, ChartOptions, Plugin } from 'chart.js'
import type { TooltipClickHandler } from '~/services/chartTooltip'
import type { Organization } from '~/stores/organization'
import { useDark } from '@vueuse/core'
import { CategoryScale, Chart, Filler, LinearScale, LineElement, PointElement, Tooltip } from 'chart.js'
import { computed, ref, watch } from 'vue'
import { Line } from 'vue-chartjs'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { createChartScales } from '~/services/chartConfig'
import { useChartData } from '~/services/chartDataService'
import { createTooltipConfig, todayLinePlugin, verticalLinePlugin } from '~/services/chartTooltip'
import { generateChartDayLabels, getChartDateRange, normalizeToStartOfDay } from '~/services/date'
import { useSupabase } from '~/services/supabase'
import { useOrganizationStore } from '~/stores/organization'
import ChartCard from './ChartCard.vue'

const props = defineProps({
  useBillingPeriod: {
    type: Boolean,
    default: true,
  },
  accumulated: {
    type: Boolean,
    default: true,
  },
  reloadTrigger: {
    type: Number,
    default: 0,
  },
})

interface ChartDataset {
  label: string
  data: Array<number | undefined>
}

interface ChartApiData {
  labels: string[]
  datasets: ChartDataset[]
}

Chart.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler)

const isDark = useDark()
const { t } = useI18n()
const route = useRoute('/app/[package]')
const router = useRouter()
const organizationStore = useOrganizationStore()
const supabase = useSupabase()
const rawChartData = ref<ChartApiData | null>(null)

const appId = ref('')

// Cache for bundle ID lookups (version name -> bundle ID)
const bundleIdCache = ref<Record<string, number>>({})

// Create a mapping from version label to itself for tooltip clicks
// Version names are the labels (e.g., "1.0.0")
const versionByLabel = computed(() => {
  const mapping: Record<string, string> = {}
  const datasets = rawChartData.value?.datasets ?? []
  datasets.forEach((dataset) => {
    // The label is the version name, we use it as both key and value
    mapping[dataset.label] = dataset.label
  })
  return mapping
})

// Look up bundle ID and navigate directly to bundle page
async function navigateToBundle(versionName: string) {
  // Check cache first
  if (bundleIdCache.value[versionName]) {
    router.push(`/app/${appId.value}/bundle/${bundleIdCache.value[versionName]}`)
    return
  }

  // Query the database to get the bundle ID from version name
  const { data } = await supabase
    .from('app_versions')
    .select('id')
    .eq('app_id', appId.value)
    .eq('name', versionName)
    .limit(1)
    .single()

  if (data?.id) {
    // Cache the result
    bundleIdCache.value[versionName] = data.id
    router.push(`/app/${appId.value}/bundle/${data.id}`)
  }
}

// Click handler for tooltip items - navigates directly to bundle page
const tooltipClickHandler = computed<TooltipClickHandler>(() => ({
  onAppClick: navigateToBundle,
  appIdByLabel: versionByLabel.value,
}))
const isLoading = ref(true)
const currentRange = ref<{ startDate: Date, endDate: Date } | null>(null)
let requestToken = 0

// Cache for both billing period and last 30 days data
const cachedBillingData = ref<{ data: ChartApiData, range: { startDate: Date, endDate: Date } } | null>(null)
const cached30DayData = ref<{ data: ChartApiData, range: { startDate: Date, endDate: Date } } | null>(null)

const latestVersion = computed(() => {
  const chartData = rawChartData.value
  const datasets = chartData?.datasets ?? []

  if (!datasets.length)
    return null

  const lastIndexWithData = datasets.reduce((maxIndex, dataset) => {
    const values = dataset.data ?? []

    for (let index = values.length - 1; index >= 0; index--) {
      const value = values[index]
      if (typeof value === 'number' && !Number.isNaN(value))
        return Math.max(maxIndex, index)
    }

    return maxIndex
  }, -1)

  if (lastIndexWithData < 0)
    return null

  const datasetAtLastDay = datasets.reduce<{ name: string, percentage: number } | null>((current, dataset) => {
    const value = dataset.data?.[lastIndexWithData]
    const numericValue = typeof value === 'number' && !Number.isNaN(value) ? value : null

    if (numericValue === null)
      return current

    if (!current || numericValue > current.percentage)
      return { name: dataset.label, percentage: numericValue }

    return current
  }, null)

  if (datasetAtLastDay)
    return datasetAtLastDay

  const fallbackDataset = datasets.find(dataset => dataset.data && dataset.data[lastIndexWithData] !== undefined)
  if (fallbackDataset) {
    const fallbackValue = fallbackDataset.data?.[lastIndexWithData]
    const numericFallback = typeof fallbackValue === 'number' && !Number.isNaN(fallbackValue) ? fallbackValue : 0
    return {
      name: fallbackDataset.label,
      percentage: numericFallback,
    }
  }

  return null
})
const latestVersionPercentageDisplay = computed(() => {
  const rawPercentage = latestVersion.value?.percentage ?? 0
  if (rawPercentage === null || rawPercentage === undefined)
    return ''

  const percentage = typeof rawPercentage === 'number' ? rawPercentage.toString() : rawPercentage
  const hasSymbol = percentage.includes('%')

  const match = percentage.match(/(\d+(?:\.\d+)?)/)
  if (!match)
    return hasSymbol ? percentage : `${percentage}%`

  const numeric = Number(match[1])
  if (Number.isNaN(numeric))
    return hasSymbol ? percentage : `${percentage}%`

  const rounded = Number(numeric.toFixed(1))
  const formatted = Number.isInteger(rounded) ? Math.trunc(rounded).toString() : rounded.toFixed(1)
  const replaced = percentage.replace(match[1], formatted)
  return hasSymbol ? replaced : `${formatted}%`
})

function resolveOrganizationForCurrentContext(): Organization | undefined {
  if (appId.value) {
    const org = organizationStore.getOrgByAppId(appId.value)
    if (org)
      return org
  }
  return organizationStore.currentOrganization
}

function getDateRange() {
  const activeOrganization = resolveOrganizationForCurrentContext()
  return getChartDateRange(
    props.useBillingPeriod,
    activeOrganization?.subscription_start,
    activeOrganization?.subscription_end,
  )
}

const totalDays = computed(() => {
  if (!currentRange.value) {
    return rawChartData.value?.labels.length ?? 0
  }

  // Both modes: show full date range (billing cycle or last 30 days)
  const { startDate, endDate } = currentRange.value
  return Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
})

function generateDayLabels(_totalLength: number) {
  if (!currentRange.value)
    return []

  // Both modes: generate labels for the full date range
  const { startDate, endDate } = currentRange.value
  return generateChartDayLabels(props.useBillingPeriod, startDate, endDate)
}

function roundPercentageInString(text: string) {
  if (!text)
    return text

  return text.replace(/(\d+(?:\.\d+)?)(?=%)/g, (match) => {
    const numeric = Number(match)
    if (Number.isNaN(numeric))
      return match

    const rounded = Number(numeric.toFixed(1))
    return Number.isInteger(rounded) ? Math.trunc(rounded).toString() : rounded.toFixed(1)
  })
}

const processedChartData = computed<ChartData<'line'> | null>(() => {
  if (!rawChartData.value)
    return null

  const targetLength = totalDays.value

  // Calculate offset for padding in both modes
  // If API data starts later than our range start, we need padding
  let dataOffset = 0
  if (currentRange.value && rawChartData.value.labels.length > 0) {
    const firstApiDate = new Date(rawChartData.value.labels[0])
    const rangeStart = currentRange.value.startDate
    dataOffset = Math.floor((firstApiDate.getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24))
    if (dataOffset < 0)
      dataOffset = 0
  }

  let globalLastDataIndex = -1
  const normalizedDatasets = rawChartData.value.datasets.map((dataset) => {
    const rawValues = dataset.data ?? []
    const limitIndex = (() => {
      if (!props.useBillingPeriod)
        return rawValues.length - 1

      if (!currentRange.value)
        return rawValues.length - 1

      const today = normalizeToStartOfDay(new Date())
      const diff = Math.floor((today.getTime() - currentRange.value.startDate.getTime()) / (24 * 60 * 60 * 1000))

      if (Number.isNaN(diff))
        return -1

      if (diff < 0)
        return -1

      return Math.min(diff, rawValues.length - 1)
    })()
    const normalizedValues = rawValues.map((value) => {
      if (typeof value === 'number')
        return value
      if (value === null || value === undefined)
        return undefined
      const parsed = Number(value)
      return Number.isNaN(parsed) ? undefined : parsed
    }).map((value, index) => {
      if (limitIndex < 0)
        return undefined
      if (index > limitIndex)
        return undefined
      return value
    })

    for (let index = normalizedValues.length - 1; index >= 0; index--) {
      const candidate = normalizedValues[index]
      if (typeof candidate === 'number' && Number.isFinite(candidate)) {
        // Account for offset when tracking last data index
        globalLastDataIndex = Math.max(globalLastDataIndex, index + dataOffset)
        break
      }
    }

    return { dataset, normalizedValues }
  })
  const formattedLabels = generateDayLabels(targetLength)
  const datasets: ChartData<'line'>['datasets'] = []

  normalizedDatasets.forEach(({ dataset, normalizedValues }, datasetIndex) => {
    // Pad with nulls at the start if needed (when billing period starts before API data)
    const paddedValues = Array.from({ length: targetLength }, (_val, index) => {
      const dataIndex = index - dataOffset
      return dataIndex >= 0 && dataIndex < normalizedValues.length ? normalizedValues[dataIndex] : undefined
    })
    const previousDataset = datasetIndex > 0 ? datasets[datasetIndex - 1] : null
    const previousDatasetData = previousDataset && Array.isArray(previousDataset.data)
      ? previousDataset.data as Array<number | null | undefined>
      : undefined
    let lastKnownBaseValue = 0
    let hasSeenValue = false
    const tooltipBaseValues: Array<number | null> = []
    const processedData = props.accumulated
      ? paddedValues.map((value, pointIndex) => {
          if (globalLastDataIndex < 0) {
            tooltipBaseValues.push(null)
            return null
          }
          if (globalLastDataIndex >= 0 && pointIndex > globalLastDataIndex) {
            tooltipBaseValues.push(null)
            return null
          }
          if (typeof value === 'number' && Number.isFinite(value)) {
            lastKnownBaseValue = value
            hasSeenValue = true
          }

          const hasValidValue = typeof value === 'number' && Number.isFinite(value)
          const baseValue = hasValidValue
            ? value
            : hasSeenValue
              ? lastKnownBaseValue
              : null
          tooltipBaseValues.push(baseValue)
          const previousValueRaw = previousDatasetData?.[pointIndex]
          const hasPreviousValue = typeof previousValueRaw === 'number' && Number.isFinite(previousValueRaw)
          const previousValue = hasPreviousValue ? previousValueRaw : 0
          if (baseValue === null)
            return null

          const stackedValue = datasetIndex === 0 ? baseValue : baseValue + previousValue

          if (!Number.isFinite(stackedValue))
            return datasetIndex > 0 && hasPreviousValue ? previousValue : null

          return stackedValue
        })
      : paddedValues.map((val, pointIndex) => {
          if (globalLastDataIndex >= 0 && pointIndex > globalLastDataIndex) {
            tooltipBaseValues.push(null)
            return null
          }
          const numericValue = typeof val === 'number' && Number.isFinite(val) ? val : null
          tooltipBaseValues.push(numericValue)
          return numericValue
        })

    const chartDataset = {
      ...dataset,
      data: processedData,
      fill: props.accumulated ? (datasetIndex === 0 ? 'origin' : '-1') : false,
      tension: 0.3,
      pointRadius: props.accumulated ? 0 : 2,
      pointBorderWidth: 0,
      borderWidth: 2,
    } as ChartData<'line'>['datasets'][number]
    Object.assign(chartDataset, { metaBaseValues: tooltipBaseValues })
    datasets.push(chartDataset)
  })

  return {
    labels: formattedLabels,
    datasets,
  }
})

const hasData = computed(() => !!(processedChartData.value && processedChartData.value.datasets.length > 0))

const todayLineOptions = computed(() => {
  if (!props.useBillingPeriod || !currentRange.value)
    return { enabled: false }

  const today = normalizeToStartOfDay(new Date())
  const { startDate, endDate } = currentRange.value

  if (today < startDate || today > endDate)
    return { enabled: false }

  const index = Math.floor((today.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000))
  const labels = Array.isArray(processedChartData.value?.labels) ? processedChartData.value!.labels : []

  if (index < 0 || index >= labels.length)
    return { enabled: false }

  const strokeColor = isDark.value ? 'rgba(165, 180, 252, 0.75)' : 'rgba(99, 102, 241, 0.7)'
  const glowColor = isDark.value ? 'rgba(129, 140, 248, 0.35)' : 'rgba(165, 180, 252, 0.35)'
  const badgeFill = isDark.value ? 'rgba(67, 56, 202, 0.45)' : 'rgba(199, 210, 254, 0.85)'
  const textColor = isDark.value ? '#e0e7ff' : '#312e81'

  return {
    enabled: true,
    xIndex: index,
    label: t('today'),
    color: strokeColor,
    glowColor,
    badgeFill,
    textColor,
  }
})

const chartOptions = computed<ChartOptions<'line'>>(() => {
  const hasMultipleDatasets = (processedChartData.value?.datasets.length ?? 0) > 1
  const tooltipOptions = createTooltipConfig(hasMultipleDatasets, props.accumulated, props.useBillingPeriod ? currentRange.value?.startDate : false, hasMultipleDatasets ? tooltipClickHandler.value : undefined)

  const pluginOptions = {
    legend: {
      display: hasMultipleDatasets,
      position: 'bottom',
      labels: {
        color: isDark.value ? 'white' : 'black',
        padding: 10,
        font: {
          size: 11,
        },
        generateLabels(chart: Chart) {
          const original = Chart.defaults.plugins.legend.labels.generateLabels(chart)
          return original.map(item => ({
            ...item,
            text: roundPercentageInString(item.text),
          }))
        },
      },
    },
    title: { display: false },
    tooltip: tooltipOptions,
    filler: {
      propagate: false,
    },
    todayLine: todayLineOptions.value,
  } as const

  return {
    maintainAspectRatio: false,
    scales: createChartScales(isDark.value, {
      max: 110,
      xStacked: props.accumulated,
      yStacked: props.accumulated,
      yTickCallback: (tickValue: string | number) => {
        const numericValue = typeof tickValue === 'number' ? tickValue : Number(tickValue)
        // Hide the 110% tick - it's only there for visual spacing
        if (numericValue > 100)
          return ''
        const display = Number.isFinite(numericValue) ? numericValue : tickValue
        return `${display}%`
      },
    }),
    plugins: pluginOptions as unknown as NonNullable<ChartOptions<'line'>['plugins']>,
  }
})

const chartPlugins = [verticalLinePlugin, todayLinePlugin] as unknown as Plugin<'line'>[]

async function loadData(forceRefetch = false) {
  if (!appId.value) {
    rawChartData.value = null
    return
  }

  try {
    await organizationStore.dedupFetchOrganizations()
    await organizationStore.awaitInitialLoad()
  }
  catch (error) {
    console.error('[DevicesStats] Error preparing organization data for mobile stats:', error)
  }

  const { startDate, endDate } = getDateRange()
  const isBillingMode = props.useBillingPeriod

  // Check if we have cached data for this mode that matches the current date range
  const cachedData = isBillingMode ? cachedBillingData.value : cached30DayData.value

  // Validate cache: dates must match (comparing timestamps to avoid reference issues)
  const cacheIsValid = cachedData
    && cachedData.range.startDate.getTime() === startDate.getTime()
    && cachedData.range.endDate.getTime() === endDate.getTime()

  if (cacheIsValid && !forceRefetch) {
    rawChartData.value = cachedData.data
    currentRange.value = cachedData.range
    return
  }

  // Clear invalid cache for this mode
  if (cachedData && !cacheIsValid) {
    if (isBillingMode) {
      cachedBillingData.value = null
    }
    else {
      cached30DayData.value = null
    }
  }

  const currentToken = ++requestToken
  isLoading.value = true
  rawChartData.value = null
  currentRange.value = { startDate, endDate }

  try {
    const data = await useChartData(supabase, appId.value, startDate, endDate)

    if (currentToken !== requestToken)
      return

    rawChartData.value = data

    // Cache the data for this mode
    const cacheEntry = { data, range: { startDate, endDate } }
    if (isBillingMode) {
      cachedBillingData.value = cacheEntry
    }
    else {
      cached30DayData.value = cacheEntry
    }
  }
  catch (error) {
    console.error('[DevicesStats] Error fetching chart data:', error)
    if (currentToken !== requestToken)
      return
    rawChartData.value = null
  }
  finally {
    if (currentToken === requestToken) {
      isLoading.value = false
    }
  }
}

// Watch billing period changes - use cached data if available
watch(() => props.useBillingPeriod, async () => {
  if (appId.value)
    await loadData(false) // Use cache if available
})

// Watch for reload trigger - force refetch
watch(() => props.reloadTrigger, async () => {
  if (appId.value)
    await loadData(true) // Force refetch
})

watch(
  () => [route.path, route.params.package as string | undefined] as const,
  async ([path, packageId], old) => {
    const oldPackageId = old?.[1]
    // Check for /app/[package] route pattern
    if (path.includes('/app/') && packageId) {
      const packageChanged = packageId !== oldPackageId
      appId.value = packageId
      if (packageChanged) {
        // Clear cache when switching apps
        cachedBillingData.value = null
        cached30DayData.value = null
        await loadData(true) // Force refetch for new app
      }
      else if (!rawChartData.value) {
        // Initial load - no data yet
        await loadData(true)
      }
    }
    else {
      appId.value = ''
      requestToken++
      rawChartData.value = null
      isLoading.value = true
    }
  },
  { immediate: true },
)
</script>

<template>
  <ChartCard
    :title="t('active_users_by_version')"
    :is-loading="isLoading"
    :has-data="hasData"
  >
    <template #header>
      <div class="flex items-start justify-between flex-1 gap-2">
        <h2 class="flex-1 min-w-0 text-2xl font-semibold leading-tight dark:text-white text-slate-600">
          {{ t('active_users_by_version') }}
        </h2>

        <div class="flex flex-col items-end text-right shrink-0">
          <div
            class="inline-flex items-center justify-center px-2 py-1 text-xs font-bold text-white rounded-full shadow-lg whitespace-nowrap bg-emerald-500"
          >
            {{ latestVersionPercentageDisplay }}
          </div>
          <div v-if="latestVersion" class="text-3xl font-bold dark:text-white text-slate-600">
            {{ latestVersion.name }}
          </div>
        </div>
      </div>
    </template>

    <Line :data="processedChartData!" :options="chartOptions" :plugins="chartPlugins" />
  </ChartCard>
</template>
