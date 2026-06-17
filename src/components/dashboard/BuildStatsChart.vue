<script setup lang="ts">
import type { ChartData, ChartOptions, Plugin } from 'chart.js'
import { useDark } from '@vueuse/core'
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Filler,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js'
import { computed } from 'vue'
import { Bar, Line } from 'vue-chartjs'
import { useI18n } from 'vue-i18n'
import { BUILD_SERIES_KEYS, getTodayLimit, transformSeries } from '~/services/buildCharts'
import { createLegendConfig, createStackedChartScales } from '~/services/chartConfig'
import { createTooltipConfig, todayLinePlugin, verticalLinePlugin } from '~/services/chartTooltip'
import { generateMonthDays } from '~/services/date'
import { useOrganizationStore } from '~/stores/organization'

const props = defineProps({
  // { ios_succeeded: number[], android_succeeded: number[], ios_failed: number[], android_failed: number[] }
  dataBySeries: { type: Object, default: () => ({}) },
  useBillingPeriod: { type: Boolean, default: true },
  accumulated: { type: Boolean, default: false },
  appId: { type: String, default: '' },
})

const isDark = useDark()
const { t } = useI18n()
const organizationStore = useOrganizationStore()
// Resolve the app's organization (may differ from the selected org) so the
// billing cycle stays correct, and stay reactive to appId changes.
const cycleStart = computed(() => {
  const org = organizationStore.getOrgByAppId(props.appId) ?? organizationStore.currentOrganization
  const date = new Date(org?.subscription_start ?? new Date())
  date.setHours(0, 0, 0, 0)
  return date
})
const cycleEnd = computed(() => {
  const org = organizationStore.getOrgByAppId(props.appId) ?? organizationStore.currentOrganization
  const date = new Date(org?.subscription_end ?? new Date())
  date.setHours(0, 0, 0, 0)
  return date
})

Chart.register(
  Tooltip,
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Filler,
)

// Semantic, fixed colors: greens for succeeded (iOS deeper, Android lighter),
// red / orange for failed (iOS red, Android orange).
const SERIES_STYLE: Record<string, { labelKey: string, bar: string, line: string, border: string }> = {
  ios_succeeded: { labelKey: 'build-ios-succeeded', bar: 'hsla(145, 63%, 42%, 0.85)', line: 'hsla(145, 63%, 50%, 0.45)', border: 'hsl(145, 63%, 32%)' },
  android_succeeded: { labelKey: 'build-android-succeeded', bar: 'hsla(168, 55%, 55%, 0.85)', line: 'hsla(168, 55%, 58%, 0.4)', border: 'hsl(168, 55%, 38%)' },
  ios_failed: { labelKey: 'build-ios-failed', bar: 'hsla(0, 72%, 52%, 0.85)', line: 'hsla(0, 72%, 58%, 0.4)', border: 'hsl(0, 72%, 40%)' },
  android_failed: { labelKey: 'build-android-failed', bar: 'hsla(28, 85%, 58%, 0.85)', line: 'hsla(28, 85%, 60%, 0.4)', border: 'hsl(28, 80%, 46%)' },
}

function monthdays() {
  return generateMonthDays(props.useBillingPeriod, cycleStart.value, cycleEnd.value)
}

const chartData = computed<ChartData<any>>(() => {
  const labels = monthdays()
  const labelCount = labels.length
  const limitIndex = getTodayLimit(labelCount, props.useBillingPeriod, cycleStart.value, cycleEnd.value)
  const source = props.dataBySeries as Record<string, number[]>

  const datasets = BUILD_SERIES_KEYS.map((key, index) => {
    const style = SERIES_STYLE[key]
    const processed = transformSeries(source[key] ?? [], props.accumulated, labelCount, limitIndex)

    const baseDataset: any = {
      label: t(style.labelKey),
      data: processed.display,
      backgroundColor: props.accumulated ? style.line : style.bar,
      borderColor: style.border,
      borderWidth: 1,
      metaBaseValues: processed.base,
    }

    return props.accumulated
      ? {
          ...baseDataset,
          fill: index === 0 ? 'origin' : '-1',
          tension: 0.3,
          pointRadius: 0,
          pointBorderWidth: 0,
        }
      : baseDataset
  })

  return { labels, datasets }
})

const todayLineOptions = computed(() => {
  if (!props.useBillingPeriod)
    return { enabled: false }

  const labels = Array.isArray(chartData.value.labels) ? chartData.value.labels : []
  const index = getTodayLimit(labels.length, props.useBillingPeriod, cycleStart.value, cycleEnd.value)
  if (index < 0 || index >= labels.length)
    return { enabled: false }

  const strokeColor = isDark.value ? 'rgba(165, 180, 252, 0.75)' : 'rgba(99, 102, 241, 0.7)'
  const glowColor = isDark.value ? 'rgba(129, 140, 248, 0.35)' : 'rgba(165, 180, 252, 0.35)'
  const badgeFill = isDark.value ? 'rgba(67, 56, 202, 0.45)' : 'rgba(199, 210, 254, 0.85)'
  const textColor = isDark.value ? '#e0e7ff' : '#312e81'

  return { enabled: true, xIndex: index, label: t('today'), color: strokeColor, glowColor, badgeFill, textColor }
})

const chartOptions = computed(() => ({
  maintainAspectRatio: false,
  scales: createStackedChartScales(isDark.value, true),
  plugins: {
    legend: createLegendConfig(isDark.value, true),
    title: { display: false },
    tooltip: createTooltipConfig(true, props.accumulated, props.useBillingPeriod ? cycleStart.value : false, undefined),
    todayLine: todayLineOptions.value,
  },
}))

const lineChartOptions = computed(() => chartOptions.value as unknown as ChartOptions<'line'>)
const barChartOptions = computed(() => chartOptions.value as unknown as ChartOptions<'bar'>)
const sharedPlugins = [verticalLinePlugin, todayLinePlugin]
const linePlugins = sharedPlugins as unknown as Plugin<'line'>[]
const barPlugins = sharedPlugins as unknown as Plugin<'bar'>[]
</script>

<template>
  <div class="w-full h-full">
    <Line
      v-if="accumulated"
      :data="chartData"
      :options="lineChartOptions"
      :plugins="linePlugins"
    />
    <Bar
      v-else
      :data="chartData"
      :options="barChartOptions"
      :plugins="barPlugins"
    />
  </div>
</template>
