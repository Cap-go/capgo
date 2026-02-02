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

function createCountDatasetsByName(versions: string[], dates: string[], countsByDate: { [date: string]: { [version: string]: number } }) {
  return versions.map((version) => {
    const countData = dates.map(date => Math.round(countsByDate[date]?.[version] ?? 0))

    return {
      label: version,
      data: countData,
    }
  })
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

    const channelVersions = new Set<string>()
    const versionIdToName: Record<string, string> = {}
    const firstDeployByVersion: Record<string, string> = {}

    if (currentVersionName) {
      channelVersions.add(currentVersionName)
    }

    for (const deploy of (deployHistory || [])) {
      const versionName = (deploy.app_versions as any)?.name
      const versionId = deploy.version_id
      if (versionName) {
        channelVersions.add(versionName)
        if (versionId !== null && versionId !== undefined) {
          versionIdToName[String(versionId)] = versionName
        }
      }
      if (versionName && deploy.deployed_at) {
        const deployDate = dayjs(deploy.deployed_at).utc().format('YYYY-MM-DD')
        if (!firstDeployByVersion[versionName] || deployDate < firstDeployByVersion[versionName])
          firstDeployByVersion[versionName] = deployDate
      }
    }

    if (currentVersionName && !firstDeployByVersion[currentVersionName]) {
      const fallbackDate = channelData.updated_at
        ? dayjs(channelData.updated_at).utc().format('YYYY-MM-DD')
        : dayjs(startDate).utc().format('YYYY-MM-DD')
      firstDeployByVersion[currentVersionName] = fallbackDate
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

    for (const versionName of Object.keys(currentCounts)) {
      if (!channelVersions.has(versionName))
        channelVersions.add(versionName)
    }

    const versions = Array.from(channelVersions)

    const filteredDailyVersion = dailyVersion.filter(row => versions.includes(row.version_name))

    const dailyDeltas: Record<string, Record<string, { install: number, uninstall: number }>> = {}
    for (const row of filteredDailyVersion) {
      if (!dailyDeltas[row.date])
        dailyDeltas[row.date] = {}
      if (!dailyDeltas[row.date][row.version_name]) {
        dailyDeltas[row.date][row.version_name] = { install: 0, uninstall: 0 }
      }
      dailyDeltas[row.date][row.version_name].install += row.install ?? 0
      dailyDeltas[row.date][row.version_name].uninstall += row.uninstall ?? 0
    }

    const countsByDate: Record<string, Record<string, number>> = {}
    const rollingCounts: Record<string, number> = {}
    versions.forEach((version) => {
      rollingCounts[version] = Math.round(currentCounts[version] ?? 0)
    })

    for (let index = labels.length - 1; index >= 0; index--) {
      const date = labels[index]
      countsByDate[date] = { ...rollingCounts }
      const deltas = dailyDeltas[date] || {}
      Object.entries(deltas).forEach(([versionName, delta]) => {
        const currentValue = rollingCounts[versionName] ?? 0
        const previousValue = currentValue - delta.install + delta.uninstall
        rollingCounts[versionName] = Math.max(0, Math.round(previousValue))
      })
    }

    const activeVersions = versions.filter((version) => {
      if (version === currentVersionName)
        return true
      return labels.some(label => (countsByDate[label]?.[version] ?? 0) > 0)
    })

    let datasets = createCountDatasetsByName(activeVersions, labels, countsByDate)
    datasets = fillMissingDailyData(datasets, labels)

    const totalDevices = Object.values(rollingCounts).reduce((sum, val) => sum + val, 0)
    const devicesOnCurrent = currentVersionName ? rollingCounts[currentVersionName] ?? 0 : 0
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
