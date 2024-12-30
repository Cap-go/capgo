// chartDataService.ts

import type { SupabaseClient } from '@supabase/supabase-js'
import colors from 'tailwindcss/colors'

const SKIP_COLOR = 10
const colorKeys = Object.keys(colors)
const chartData = ref<Map<string, any>>(new Map())

export async function useChartData(supabase: SupabaseClient, appId: string, from: Date, to: Date) {
  if (chartData.value.has(appId))
    return chartData.value.get(appId)

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

  const chartDataFromApi = (data as { status: string, data: ChartData }).data
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
  chartData.value.set(appId, finalData)
  return finalData
}
