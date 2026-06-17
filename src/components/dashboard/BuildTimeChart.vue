<script setup lang="ts">
import type { ChartData, ChartOptions, Plugin } from 'chart.js'
import { useDark } from '@vueuse/core'
import {
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
import { Line } from 'vue-chartjs'
import { useI18n } from 'vue-i18n'
import { getTodayLimit, transformSeries } from '~/services/buildCharts'
import { createLegendConfig, createStackedChartScales } from '~/services/chartConfig'
import { createTooltipConfig, todayLinePlugin, verticalLinePlugin } from '~/services/chartTooltip'
import { generateMonthDays } from '~/services/date'
import { useOrganizationStore } from '~/stores/organization'

const props = defineProps({
  // Real build minutes per day.
  data: { type: Array, default: () => [] },
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
  LineController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Filler,
)

function monthdays() {
  return generateMonthDays(props.useBillingPeriod, cycleStart.value, cycleEnd.value)
}

// Build time is always rendered as a line (daily values or cumulative).
const chartData = computed<ChartData<'line'>>(() => {
  const labels = monthdays()
  const labelCount = labels.length
  const limitIndex = getTodayLimit(labelCount, props.useBillingPeriod, cycleStart.value, cycleEnd.value)
  const processed = transformSeries(props.data as number[], props.accumulated, labelCount, limitIndex)

  return {
    labels,
    datasets: [
      {
        label: t('build-time'),
        data: processed.display as number[],
        backgroundColor: 'hsla(265, 60%, 60%, 0.22)',
        borderColor: 'hsl(265, 60%, 52%)',
        borderWidth: 2,
        fill: 'origin',
        tension: 0.3,
        pointRadius: 0,
        pointBorderWidth: 0,
        metaBaseValues: processed.base,
      },
    ],
  }
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
  scales: createStackedChartScales(isDark.value, false),
  plugins: {
    legend: createLegendConfig(isDark.value, false),
    title: { display: false },
    tooltip: createTooltipConfig(false, props.accumulated, props.useBillingPeriod ? cycleStart.value : false, undefined),
    todayLine: todayLineOptions.value,
  },
}))

const lineChartOptions = computed(() => chartOptions.value as unknown as ChartOptions<'line'>)
const linePlugins = [verticalLinePlugin, todayLinePlugin] as unknown as Plugin<'line'>[]
</script>

<template>
  <div class="w-full h-full">
    <Line :data="chartData" :options="lineChartOptions" :plugins="linePlugins" />
  </div>
</template>
