// chartDataService.ts

import colors from 'tailwindcss/colors'
import type { VersionName, appUsageByVersion } from '~/services/supabase'

const SKIP_COLOR = 10
const colorKeys = Object.keys(colors)

export function useChartData(dailyUsage: Ref<appUsageByVersion[]>, versionNames: Ref<VersionName[]>) {
  return computed(() => {
    const versions = [...new Set(dailyUsage.value.map(d => d.version_id))]
    const dates = [...new Set(dailyUsage.value.map(d => d.date))].sort((a, b) => new Date(a).getTime() - new Date(b).getTime())

    // Step 1: Calculate accumulated data
    const accumulatedData = calculateAccumulatedData(dailyUsage.value, dates, versions)

    // Step 2: Convert to percentages, ensuring total <= 100% per day
    const percentageData = convertToPercentages(accumulatedData)

    // Step 3: Get active versions (versions with non-zero usage)
    const activeVersions = getActiveVersions(versions, percentageData)

    // Step 4: Create datasets for the chart
    const datasets = createDatasets(activeVersions, dates, percentageData, versionNames.value)

    // Step 5: Get latest version information
    const latestVersion = getLatestVersion(versionNames.value)
    const latestVersionPercentage = getLatestVersionPercentage(datasets, latestVersion)

    return {
      labels: dates,
      datasets,
      latestVersion: {
        name: latestVersion?.name,
        percentage: latestVersionPercentage.toFixed(2),
      },
    }
  })
}

// Calculate cumulative installs for each version over time
function calculateAccumulatedData(usage: appUsageByVersion[], dates: string[], versions: number[]) {
  const accumulated: { [date: string]: { [version: number]: number } } = {}

  // Initialize with zeros
  dates.forEach((date) => {
    accumulated[date] = {}
    versions.forEach(version => accumulated[date][version] = 0)
  })

  // Process data day by day
  dates.forEach((date, index) => {
    const dailyUsage = usage.filter(u => u.date === date)
    const totalNewInstalls = dailyUsage.reduce((sum, u) => sum + (u.install || 0), 0)

    if (index === 0) {
      // First day: just add installs
      dailyUsage.forEach(({ version_id, install }) => {
        accumulated[date][version_id] = install || 0
      })
    }
    else {
      const prevDate = dates[index - 1]
      const prevTotal = Object.values(accumulated[prevDate]).reduce((sum, val) => sum + val, 0)

      versions.forEach((version) => {
        const change = dailyUsage.find(u => u.version_id === version)
        const prevValue = accumulated[prevDate][version]

        if (change && change.install) {
          // Version has new installs: add them
          accumulated[date][version] = prevValue + change.install
        }
        else {
          // Version has no new installs: decrease proportionally
          const decreaseFactor = Math.max(0, 1 - (totalNewInstalls / prevTotal))
          accumulated[date][version] = Math.max(0, prevValue * decreaseFactor)
        }

        // Subtract uninstalls if any
        if (change && change.uninstall) {
          accumulated[date][version] = Math.max(0, accumulated[date][version] - change.uninstall)
        }
      })
    }
  })

  return accumulated
}

// Convert accumulated data to percentages, ensuring total <= 100% per day
function convertToPercentages(accumulated: { [date: string]: { [version: number]: number } }) {
  const percentages: { [date: string]: { [version: number]: number } } = {}

  Object.keys(accumulated).forEach((date) => {
    const dayData = accumulated[date]
    const total = Object.values(dayData).reduce((sum, value) => sum + value, 0)

    percentages[date] = {}
    if (total > 0) {
      Object.keys(dayData).forEach((version) => {
        percentages[date][version] = (dayData[version] / total) * 100
      })
    }
  })

  return percentages
}

// Filter out versions with no usage
function getActiveVersions(versions: number[], percentages: { [date: string]: { [version: number]: number } }) {
  return versions.filter(version =>
    Object.values(percentages).some(dayData => (dayData[version] || 0) > 0),
  )
}

// Create datasets for Chart.js
function createDatasets(versions: number[], dates: string[], percentages: { [date: string]: { [version: number]: number } }, versionNames: VersionName[]) {
  return versions.map((version, i) => {
    const percentageData = dates.map(date => percentages[date][version] || 0)
    const color = colorKeys[(i + SKIP_COLOR) % colorKeys.length]
    const versionName = versionNames.find(v => v.id === version)?.name || version

    return {
      label: versionName,
      data: percentageData,
      borderColor: colors[color][400],
      backgroundColor: colors[color][200],
      tension: 0.3,
      pointRadius: 2,
      pointBorderWidth: 0,
    }
  })
}

// Find the latest version based on creation date
function getLatestVersion(versions: VersionName[]) {
  return versions.reduce((latest, current) =>
    new Date(current.created_at) > new Date(latest.created_at) ? current : latest, versions[0])
}

// Get the percentage of the latest version on the last day
function getLatestVersionPercentage(datasets: any[], latestVersion: { name: string }) {
  const latestVersionDataset = datasets.find(dataset => dataset.label === latestVersion?.name)
  return latestVersionDataset ? latestVersionDataset.data[latestVersionDataset.data.length - 1] : 0
}
