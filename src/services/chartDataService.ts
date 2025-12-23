import type { SupabaseClient } from '@supabase/supabase-js'
import colors from 'tailwindcss/colors'
import { ref } from 'vue'

const SKIP_COLOR = 10
const colorKeys = Object.keys(colors)
const chartDataCache = ref<Map<string, any>>(new Map())

function formatDateParam(date: Date) {
  const normalized = new Date(date)
  normalized.setUTCHours(0, 0, 0, 0)
  return normalized.toISOString().slice(0, 10)
}

function clampToToday(date: Date): Date {
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  return date > today ? today : date
}

function buildCacheKey(appId: string, from: Date, to: Date) {
  return `${appId}|${formatDateParam(from)}|${formatDateParam(to)}`
}

export async function useChartData(supabase: SupabaseClient, appId: string, from: Date, to: Date) {
  const cacheKey = buildCacheKey(appId, from, to)

  if (chartDataCache.value.has(cacheKey))
    return chartDataCache.value.get(cacheKey)

  // Clamp the 'to' date to today - we can't fetch data for future dates
  const clampedTo = clampToToday(to)
  const fromParam = formatDateParam(from)
  const toParam = formatDateParam(clampedTo)
  const { error, data } = await supabase.functions.invoke(`statistics/app/${appId}/bundle_usage?from=${fromParam}&to=${toParam}`, {
    method: 'GET',
  })
  if (error)
    return null

  interface ChartDataset {
    label: string
    data: number[]
  }

  interface ChartData {
    labels: string[]
    datasets: ChartDataset[]
    latestVersion: {
      name: string
      percentage: string
    }
  }

  const chartDataFromApi = data as ChartData
  const finalData = {
    labels: chartDataFromApi.labels,
    datasets: chartDataFromApi.datasets.map((dataset, i) => {
      const color = colorKeys[(i + SKIP_COLOR) % colorKeys.length]

      return {
        borderColor: colors[color as keyof typeof colors][400],
        backgroundColor: colors[color as keyof typeof colors][200],
        tension: 0.3,
        pointRadius: 2,
        pointBorderWidth: 0,
        ...dataset,
      }
    }),
    latestVersion: chartDataFromApi.latestVersion,
  }
  chartDataCache.value.set(cacheKey, finalData)
  return finalData
}

export function clearChartDataCache(appId?: string) {
  if (!appId) {
    chartDataCache.value.clear()
    return
  }

  const keysToDelete: string[] = []
  chartDataCache.value.forEach((_value, key) => {
    if (key.startsWith(`${appId}|`))
      keysToDelete.push(key)
  })
  keysToDelete.forEach(key => chartDataCache.value.delete(key))
}
