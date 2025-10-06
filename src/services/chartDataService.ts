import type { SupabaseClient } from '@supabase/supabase-js'
import colors from 'tailwindcss/colors'
import { ref } from 'vue'

const SKIP_COLOR = 10
const colorKeys = Object.keys(colors)
const chartDataCache = ref<Map<string, any>>(new Map())

function buildCacheKey(appId: string, from: Date, to: Date) {
  return `${appId}|${from.toISOString()}|${to.toISOString()}`
}

export async function useChartData(supabase: SupabaseClient, appId: string, from: Date, to: Date) {
  const cacheKey = buildCacheKey(appId, from, to)

  if (chartDataCache.value.has(cacheKey))
    return chartDataCache.value.get(cacheKey)

  const { error, data } = await supabase.functions.invoke(`statistics/app/${appId}/bundle_usage?from=${from.toISOString()}&to=${to.toISOString()}`, {
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
