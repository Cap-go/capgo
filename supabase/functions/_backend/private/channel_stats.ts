import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc.js'
import { Hono } from 'hono/tiny'
import { middlewareAuth, parseBody, simpleError, useCors } from '../utils/hono.ts'
import { cloudlog } from '../utils/logging.ts'
import { checkPermission } from '../utils/rbac.ts'
import { readDeviceVersionCounts, readStatsVersion } from '../utils/stats.ts'
import { supabaseWithAuth } from '../utils/supabase.ts'

dayjs.extend(utc)

interface ChannelStatsRequest {
  channel_id: number
  app_id: string
  days?: number
}

interface AppUsageByVersion {
  date: string
  app_id: string
  version_name: string
  get: number | null
  install: number | null
  uninstall: number | null
}

interface DeploymentHistoryEntry {
  version_name: string
  deployed_at: string
}

function generateDateLabels(from: Date, to: Date) {
  const start = dayjs(from).utc().startOf('day')
  const end = dayjs(to).utc().startOf('day')

  if (start.isAfter(end))
    return [] as string[]

  const labels: string[] = []
  let cursor = start
  while (cursor.isBefore(end) || cursor.isSame(end)) {
    labels.push(cursor.format('YYYY-MM-DD'))
    cursor = cursor.add(1, 'day')
  }

  return labels
}

function createPercentageDatasetsByName(
  versions: string[],
  dates: string[],
  percentagesByDate: { [date: string]: { [version: string]: number } },
  countsByDate: { [date: string]: { [version: string]: number } },
) {
  return versions.map((version) => {
    const percentageData = dates.map(date => percentagesByDate[date]?.[version] ?? 0)
    const countData = dates.map(date => Math.round(countsByDate[date]?.[version] ?? 0))

    return {
      label: version,
      data: percentageData,
      metaCounts: countData,
    }
  })
}

function buildDailyReportedCountsByName(
  usage: AppUsageByVersion[],
  dates: string[],
  versions: string[],
) {
  const counts: { [date: string]: { [version: string]: number } } = {}

  dates.forEach((date) => {
    counts[date] = {}
    versions.forEach((version) => {
      counts[date][version] = 0
    })
  })

  usage.forEach((entry) => {
    const date = entry.date
    const version = entry.version_name
    if (!version || !counts[date] || counts[date][version] === undefined)
      return
    counts[date][version] += Math.max(0, Math.round(entry.get ?? 0))
  })

  return counts
}

function convertCountsToPercentagesByName(
  counts: { [date: string]: { [version: string]: number } },
  dates: string[],
  versions: string[],
) {
  const percentages: { [date: string]: { [version: string]: number } } = {}

  dates.forEach((date) => {
    const dayData = counts[date] ?? {}
    const total = versions.reduce((sum, version) => sum + (dayData[version] ?? 0), 0)
    percentages[date] = {}
    if (total <= 0) {
      versions.forEach((version) => {
        percentages[date][version] = 0
      })
      return
    }

    const preciseShares = versions.map((version) => {
      const count = dayData[version] ?? 0
      return (count / total) * 100
    })
    const flooredShares = preciseShares.map(share => Math.floor(share * 10) / 10)
    const flooredSum = flooredShares.reduce((sum, share) => sum + share, 0)
    let unitsToDistribute = Math.max(0, Math.round((100 - flooredSum) * 10))

    const remainderOrder = preciseShares
      .map((share, index) => ({ index, remainder: share - flooredShares[index] }))
      .sort((a, b) => {
        if (b.remainder === a.remainder)
          return a.index - b.index
        return b.remainder - a.remainder
      })

    const roundedShares = [...flooredShares]
    for (let i = 0; i < remainderOrder.length && unitsToDistribute > 0; i++, unitsToDistribute--) {
      const target = remainderOrder[i].index
      roundedShares[target] = Number((roundedShares[target] + 0.1).toFixed(1))
    }

    versions.forEach((version, index) => {
      percentages[date][version] = roundedShares[index] ?? 0
    })
  })

  return percentages
}

function selectRecentChannelVersions(
  deploymentHistory: DeploymentHistoryEntry[],
  currentVersionName: string,
  currentCounts: Record<string, number>,
  limit: number = 10,
) {
  const sortedByRecency = [...deploymentHistory]
    .sort((a, b) => dayjs(b.deployed_at).valueOf() - dayjs(a.deployed_at).valueOf())
    .map(entry => entry.version_name)

  const uniqueRecentDeployed: string[] = []
  for (const versionName of sortedByRecency) {
    if (!versionName || uniqueRecentDeployed.includes(versionName))
      continue
    uniqueRecentDeployed.push(versionName)
    if (uniqueRecentDeployed.length >= limit)
      break
  }

  if (currentVersionName && !uniqueRecentDeployed.includes(currentVersionName)) {
    uniqueRecentDeployed.unshift(currentVersionName)
    if (uniqueRecentDeployed.length > limit)
      uniqueRecentDeployed.length = limit
  }

  if (uniqueRecentDeployed.length > 0)
    return uniqueRecentDeployed

  return Object.entries(currentCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([versionName]) => versionName)
}

function fillMissingDailyData(datasets: { label: string, data: number[] }[], labels: string[]) {
  if (datasets.length === 0 || labels.length === 0)
    return datasets

  const today = dayjs().utc().format('YYYY-MM-DD')
  const populated = datasets.map(dataset => ({
    ...dataset,
    data: [...dataset.data],
  }))

  for (let index = 1; index < labels.length; index++) {
    if (labels[index] === today)
      continue

    const dailyTotal = populated.reduce((sum, dataset) => sum + (dataset.data[index] ?? 0), 0)
    const previousTotal = populated.reduce((sum, dataset) => sum + (dataset.data[index - 1] ?? 0), 0)

    if (dailyTotal === 0 && previousTotal > 0) {
      populated.forEach((dataset) => {
        dataset.data[index] = dataset.data[index - 1] ?? 0
      })
    }
  }

  return populated
}

function maskDataBeforeFirstDeployment(
  datasets: { label: string, data: number[] }[],
  labels: string[],
  firstDeployByVersion: Record<string, string>,
) {
  if (datasets.length === 0 || labels.length === 0)
    return datasets

  const masked = datasets.map(dataset => ({
    ...dataset,
    data: [...dataset.data],
  }))

  masked.forEach((dataset) => {
    const firstDeployDate = firstDeployByVersion[dataset.label]
    if (!firstDeployDate)
      return

    // Labels use YYYY-MM-DD, so lexical comparison is chronological.
    const firstVisibleIndex = labels.findIndex(label => label >= firstDeployDate)

    if (firstVisibleIndex < 0) {
      dataset.data.fill(0)
      return
    }

    for (let index = 0; index < firstVisibleIndex; index++)
      dataset.data[index] = 0
  })

  return masked
}

function getLatestCounts(labels: string[], countsByDate: Record<string, Record<string, number>>) {
  if (labels.length === 0)
    return {} as Record<string, number>

  // Prefer the latest non-zero snapshot to avoid false "no devices" when
  // the most recent day is temporarily empty due ingestion lag.
  for (let index = labels.length - 1; index >= 0; index--) {
    const label = labels[index]
    const counts = countsByDate[label] ?? {}
    const total = Object.values(counts).reduce((sum, value) => sum + value, 0)
    if (total > 0)
      return counts
  }

  const latestLabel = labels[labels.length - 1]
  return countsByDate[latestLabel] ?? {}
}

export const app = new Hono<MiddlewareKeyVariables>()

app.use('/', useCors)

app.post('/', middlewareAuth, async (c) => {
  const body = await parseBody<ChannelStatsRequest>(c)
  cloudlog({ requestId: c.get('requestId'), message: 'post channel_stats body', body })

  if (!body.channel_id || !body.app_id) {
    throw simpleError('missing_params', 'channel_id and app_id are required')
  }

  const days = Math.min(Math.max(body.days ?? 14, 1), 30)

  if (!(await checkPermission(c, 'app.read', { appId: body.app_id }))) {
    throw simpleError('app_access_denied', 'You can\'t access this app', { app_id: body.app_id })
  }

  try {
    const auth = c.get('auth')
    if (!auth) {
      throw simpleError('not_authenticated', 'Authentication required')
    }

    const supabase = supabaseWithAuth(c, auth)

    const { data: channelData, error: channelError } = await supabase
      .from('channels')
      .select('id, name, version, updated_at, version (name)')
      .eq('id', body.channel_id)
      .eq('app_id', body.app_id)
      .single()

    if (channelError || !channelData) {
      throw simpleError('channel_not_found', 'Channel not found')
    }

    const currentVersionName = (channelData.version as any)?.name ?? ''

    const endDate = dayjs().utc().endOf('day').toDate()
    const startDate = dayjs().utc().startOf('day').subtract(days - 1, 'day').toDate()

    const { data: deployHistory, error: deployError } = await supabase
      .from('deploy_history')
      .select('version_id, deployed_at, app_versions(name)')
      .eq('channel_id', body.channel_id)
      .eq('app_id', body.app_id)
      .order('deployed_at', { ascending: true })

    if (deployError) {
      cloudlog({ requestId: c.get('requestId'), message: 'Error fetching deploy history', error: deployError })
    }

    const deploymentHistory = (deployHistory || [])
      .map((deploy) => {
        const versionName = (deploy.app_versions as any)?.name
        if (!versionName || !deploy.deployed_at)
          return null
        return {
          version_name: versionName,
          deployed_at: dayjs(deploy.deployed_at).utc().toISOString(),
        } satisfies DeploymentHistoryEntry
      })
      .filter(Boolean) as DeploymentHistoryEntry[]

    const versionIdToName: Record<string, string> = {}

    for (const deploy of (deployHistory || [])) {
      const versionName = (deploy.app_versions as any)?.name
      const versionId = deploy.version_id
      if (versionName && versionId !== null && versionId !== undefined)
        versionIdToName[String(versionId)] = versionName
    }

    const currentVersionRelease = deploymentHistory
      .filter(entry => entry.version_name === currentVersionName)
      .sort((a, b) => dayjs(b.deployed_at).valueOf() - dayjs(a.deployed_at).valueOf())[0]
    const currentVersionReleasedAt = currentVersionRelease?.deployed_at
      ?? (channelData.updated_at ? dayjs(channelData.updated_at).utc().toISOString() : null)

    const labels = generateDateLabels(startDate, endDate)

    const usageRows = await readStatsVersion(
      c,
      body.app_id,
      dayjs(startDate).utc().startOf('day').toISOString(),
      dayjs(endDate).utc().add(1, 'day').startOf('day').toISOString(),
    )

    const dailyVersion = (usageRows as unknown as AppUsageByVersion[])
      .map((row) => {
        const mapped = versionIdToName[row.version_name]
        return {
          ...row,
          version_name: mapped ?? row.version_name,
          date: dayjs(row.date).utc().format('YYYY-MM-DD'),
        }
      })
      .filter(row => row.version_name)

    const currentCounts = await readDeviceVersionCounts(c, body.app_id, channelData.name)

    const versions = selectRecentChannelVersions(deploymentHistory, currentVersionName, currentCounts, 10)

    const filteredDailyVersion = dailyVersion.filter(row => versions.includes(row.version_name))
    const countsByDate = buildDailyReportedCountsByName(filteredDailyVersion, labels, versions)

    const activeVersions = versions.filter((version) => {
      if (version === currentVersionName)
        return true
      return labels.some(label => (countsByDate[label]?.[version] ?? 0) > 0)
    })

    const percentagesByDate = convertCountsToPercentagesByName(countsByDate, labels, activeVersions)
    const datasets = createPercentageDatasetsByName(activeVersions, labels, percentagesByDate, countsByDate)

    const latestDailyCounts = getLatestCounts(labels, countsByDate)
    const currentCountTotal = Object.values(currentCounts).reduce((sum, val) => sum + Math.round(val ?? 0), 0)
    const totalsSource = currentCountTotal > 0 ? currentCounts : latestDailyCounts
    const totalDevices = Object.values(totalsSource).reduce((sum, val) => sum + Math.round(val ?? 0), 0)
    const devicesOnCurrent = currentVersionName ? Math.round(totalsSource[currentVersionName] ?? 0) : 0
    const percentOnCurrent = totalDevices > 0 ? Math.round((devicesOnCurrent / totalDevices) * 1000) / 10 : 0
    const deploymentHistorySorted = [...deploymentHistory].sort((a, b) => dayjs(b.deployed_at).valueOf() - dayjs(a.deployed_at).valueOf())

    const deploymentWindowCounts = { h24: 0, h72: 0, d7: 0 }
    if (currentVersionName && labels.length > 0) {
      const lastIndex = labels.length - 1
      const getCountAt = (index: number) => {
        const label = labels[index]
        return Math.round(countsByDate[label]?.[currentVersionName] ?? 0)
      }
      deploymentWindowCounts.h24 = getCountAt(lastIndex)
      deploymentWindowCounts.h72 = Math.max(0, lastIndex - 2) <= lastIndex
        ? labels.slice(Math.max(0, lastIndex - 2), lastIndex + 1).reduce((sum, label) => sum + Math.round(countsByDate[label]?.[currentVersionName] ?? 0), 0)
        : 0
      deploymentWindowCounts.d7 = Math.max(0, lastIndex - 6) <= lastIndex
        ? labels.slice(Math.max(0, lastIndex - 6), lastIndex + 1).reduce((sum, label) => sum + Math.round(countsByDate[label]?.[currentVersionName] ?? 0), 0)
        : 0
    }

    return c.json({
      labels,
      datasets,
      latestVersion: {
        name: currentVersionName,
        percentage: percentOnCurrent.toFixed(1),
      },
      currentVersion: currentVersionName,
      currentVersionReleasedAt,
      deploymentHistory: deploymentHistorySorted.slice(0, 10),
      lastDeploymentAt: deploymentHistorySorted[0]?.deployed_at ?? null,
      totalDeployments: deploymentHistorySorted.length,
      deploymentWindowCounts: {
        h24: deploymentWindowCounts.h24,
        h72: deploymentWindowCounts.h72,
        d7: deploymentWindowCounts.d7,
      },
      totals: {
        total_devices: totalDevices,
        devices_on_current: devicesOnCurrent,
        devices_on_other: Math.max(0, totalDevices - devicesOnCurrent),
        percent_on_current: percentOnCurrent,
      },
    })
  }
  catch (error) {
    cloudlog({ requestId: c.get('requestId'), message: 'Error fetching channel stats', error })
    throw simpleError('fetch_error', 'Failed to fetch channel statistics', { error: String(error) })
  }
})

export const channelStatsTestUtils = {
  generateDateLabels,
  fillMissingDailyData,
  buildDailyReportedCountsByName,
  convertCountsToPercentagesByName,
  selectRecentChannelVersions,
  maskDataBeforeFirstDeployment,
  getLatestCounts,
}
