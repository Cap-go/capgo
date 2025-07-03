import type { Context } from 'hono'
import type { AuthInfo } from '../../utils/hono.ts'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import { z } from 'zod'
import { honoFactory, middlewareV2, quickError, simpleError, useCors } from '../../utils/hono.ts'
import { cloudlog, cloudlogErr } from '../../utils/loggin.ts'
import { hasAppRight, hasAppRightApikey, hasOrgRight, supabaseAdmin } from '../../utils/supabase.ts'

dayjs.extend(utc)

export const app = honoFactory.createApp()
app.use('*', useCors)
app.use('*', middlewareV2(['all', 'read']))

const bundleUsageSchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
})

const normalStatsSchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
})

interface VersionName {
  id: number
  name: string
  created_at: string | null
}

interface AppUsageByVersion {
  date: string
  app_id: string
  version_id: number
  install: number | null
  uninstall: number | null
}

app.get('/app/:app_id', async (c) => {
  const appId = c.req.param('app_id')
  const query = c.req.query()
  const bodyParsed = normalStatsSchema.safeParse(query)
  if (!bodyParsed.success) {
    throw simpleError('invalid_body', 'Invalid body', { error: bodyParsed.error })
  }
  const body = bodyParsed.data

  const auth = c.get('auth') as AuthInfo
  if (auth.authType === 'apikey') {
    if (!await hasAppRightApikey(c, appId, auth.userId, 'read', auth.apikey!.key)) {
      throw simpleError('invalid_apikey', 'Invalid apikey', { data: auth })
    }
  }
  else if (!await hasAppRight(c, appId, auth.userId, 'read')) {
    throw simpleError('invalid_jwt', 'Invalid jwt', { data: auth.userId })
  }

  const supabase = supabaseAdmin(c)
  const { data: finalStats, error } = await getNormalStats(c, appId, null, body.from, body.to, supabase, c.get('auth')?.authType === 'jwt')

  if (error) {
    throw quickError(500, 'cannot_get_app_statistics', 'Cannot get app statistics', { error })
  }

  return c.json(finalStats)
})

app.get('/org/:org_id', async (c) => {
  const orgId = c.req.param('org_id')
  const query = c.req.query()

  // Check if user has access to this organization
  const supabase = supabaseAdmin(c)

  const bodyParsed = normalStatsSchema.safeParse(query)
  if (!bodyParsed.success) {
    throw simpleError('invalid_body', 'Invalid body', { error: bodyParsed.error })
  }
  const body = bodyParsed.data

  const auth = c.get('auth') as AuthInfo
  if (!(await hasOrgRight(c, orgId, auth.userId, 'read'))) {
    throw simpleError('invalid_jwt', 'Invalid jwt', { data: auth.userId })
  }
  if (auth.authType === 'apikey' && auth.apikey!.limited_to_orgs && auth.apikey!.limited_to_orgs.length > 0) {
    if (!auth.apikey!.limited_to_orgs.includes(orgId)) {
      throw simpleError('invalid_apikey', 'Invalid apikey', { data: auth.apikey!.key })
    }
  }

  if (auth.authType === 'apikey' && auth.apikey!.limited_to_apps && auth.apikey!.limited_to_apps.length > 0) {
    throw simpleError('invalid_apikey', 'Invalid apikey', { data: auth.apikey!.key })
  }

  const { data: finalStats, error } = await getNormalStats(c, null, orgId, body.from, body.to, supabase, c.get('auth')?.authType === 'jwt')

  if (error) {
    throw quickError(500, 'cannot_get_organization_statistics', 'Cannot get organization statistics', { error })
  }

  return c.json(finalStats)
})

app.get('/app/:app_id/bundle_usage', async (c) => {
  const appId = c.req.param('app_id')
  const query = c.req.query()
  const useDashbord = false

  const bodyParsed = bundleUsageSchema.safeParse(query)
  if (!bodyParsed.success) {
    throw simpleError('invalid_body', 'Invalid body', { error: bodyParsed.error })
  }
  const body = bodyParsed.data

  const auth = c.get('auth') as AuthInfo
  if (auth.authType === 'apikey') {
    if (!await hasAppRightApikey(c, appId, auth.userId, 'read', auth.apikey!.key)) {
      throw simpleError('invalid_apikey', 'Invalid apikey', { data: auth.apikey!.key })
    }
  }
  else if (!await hasAppRight(c, appId, auth.userId, 'read')) {
    throw simpleError('invalid_jwt', 'Invalid jwt', { data: auth.userId })
  }

  const supabase = supabaseAdmin(c)
  const { data, error } = await getBundleUsage(appId, body.from, body.to, useDashbord, supabase)

  if (error) {
    throw quickError(500, 'cannot_get_app_statistics', 'Cannot get app statistics', { error })
  }

  return c.json(data)
})

app.get('/user', async (c) => {
  const auth = c.get('auth') as AuthInfo
  const supabase = supabaseAdmin(c)

  const query = c.req.query()
  const bodyParsed = normalStatsSchema.safeParse(query)
  if (!bodyParsed.success) {
    throw simpleError('invalid_body', 'Invalid body', { error: bodyParsed.error })
  }
  const body = bodyParsed.data

  const orgsReq = supabase.from('org_users').select('*').eq('user_id', auth.userId)
  if (auth.authType === 'apikey' && auth.apikey!.limited_to_orgs && auth.apikey!.limited_to_orgs.length > 0) {
    orgsReq.in('org_id', auth.apikey!.limited_to_orgs)
  }
  const orgs = await orgsReq
  if (orgs.error) {
    throw quickError(404, 'user_not_found', 'User not found', { error: orgs.error })
  }

  cloudlogErr({ requestId: c.get('requestId'), message: 'orgs', data: orgs.data })

  // Deduplicate organizations by org_id using Set for better performance
  const uniqueOrgs = Array.from(
    new Map(orgs.data.map(org => [org.org_id, org])).values(),
  )
  if (uniqueOrgs.length === 0) {
    throw quickError(401, 'no_organizations_found', 'No organizations found', { data: auth.userId })
  }

  let stats: Array<{ data: any, error: any }> = []
  if (auth.authType === 'apikey' && auth.apikey!.limited_to_apps && auth.apikey!.limited_to_apps.length > 0) {
    stats = await Promise.all(auth.apikey!.limited_to_apps.map(appId => getNormalStats(c, appId, null, body.from, body.to, supabase, auth.authType === 'jwt')))
  }
  else {
    stats = await Promise.all(uniqueOrgs.map(org => getNormalStats(c, null, org.org_id, body.from, body.to, supabase, auth.authType === 'jwt')))
  }

  const errors = stats.filter(stat => stat.error).map(stat => stat.error)
  if (errors.length > 0) {
    throw quickError(500, 'cannot_get_user_statistics', 'Cannot get user statistics', { error: errors })
  }

  const finalStats = Array.from(stats.map(stat => stat.data!).flat().reduce((acc, curr) => {
    const current = acc.get(curr.date)
    if (current) {
      current.mau += curr.mau
      current.storage += curr.storage
      current.bandwidth += curr.bandwidth
    }
    else {
      acc.set(curr.date, curr)
    }
    return acc
  }, new Map<string, NonNullable<Awaited<ReturnType<typeof getNormalStats>>['data']>[number]>()).values())

  return c.json(finalStats)
})

async function getNormalStats(c: Context, appId: string | null, ownerOrg: string | null, from: Date, to: Date, supabase: ReturnType<typeof supabaseAdmin>, isDashboard: boolean = false) {
  if (!appId && !ownerOrg)
    return { data: null, error: 'Invalid appId or ownerOrg' }

  let ownerOrgId = ownerOrg
  if (appId) {
    const { data, error } = await supabase.from('apps').select('*').eq('app_id', appId).single()
    if (error)
      return { data: null, error }
    ownerOrgId = data.owner_org
  }

  const { data: metrics, error: metricsError } = await supabase.rpc('get_app_metrics', { org_id: ownerOrgId!, start_date: from.toISOString(), end_date: to.toISOString() })
  if (metricsError)
    return { data: null, error: metricsError }
  const graphDays = getDaysBetweenDates(from, to)

  const createUndefinedArray = (length: number) => {
    const arr: any[] = [] as any[]
    for (let i = 0; i < length; i++)
      arr.push(0)
    return arr
  }

  let mau = createUndefinedArray(graphDays) as number[]
  let storage = createUndefinedArray(graphDays) as number[]
  let bandwidth = createUndefinedArray(graphDays) as number[]
  let gets = isDashboard ? createUndefinedArray(graphDays) as number[] : []

  // Group metrics by app_id
  let metricsByApp = metrics.reduce((acc, metric) => {
    if (!acc[metric.app_id]) {
      acc[metric.app_id] = [metric]
    }
    else {
      acc[metric.app_id].push(metric)
    }
    return acc
  }, {} as Record<string, typeof metrics[0][]>)

  if (appId) {
    metricsByApp = { [appId]: metricsByApp[appId] }
  }

  for (const key in metricsByApp) {
    metricsByApp[key] ??= []
  }

  Object.values(metricsByApp)
    .forEach((arrItem) => {
      const sortedArrItem = arrItem.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      cloudlog({ requestId: c.get('requestId'), message: 'sortedArrItem', data: sortedArrItem })
      arrItem?.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).forEach((item, i) => {
        if (item.date) {
          const dayNumber = i
          if (mau[dayNumber])
            mau[dayNumber] += item.mau
          else
            mau[dayNumber] = item.mau

          const storageVal = item.storage
          if (storage[dayNumber])
            storage[dayNumber] += storageVal
          else
            storage[dayNumber] = storageVal

          const bandwidthVal = item.bandwidth ?? 0
          if (bandwidth[dayNumber])
            bandwidth[dayNumber] += bandwidthVal
          else
            bandwidth[dayNumber] = bandwidthVal

          if (isDashboard) {
            gets[dayNumber] = item.get
          }
        }
      })
    })

  if (storage.length !== 0) {
    // some magic, copied from the frontend without much understanding
    const { data: currentStorageBytes, error: storageError } = await supabase.rpc(appId ? 'get_total_app_storage_size_orgs' : 'get_total_storage_size_org', appId ? { org_id: ownerOrgId!, app_id: appId } : { org_id: ownerOrgId! })
      .single()
    if (storageError)
      return { data: null, error: storageError }

    const storageVariance = storage.reduce((p, c) => (p + (c ?? 0)), 0)
    const currentStorage = currentStorageBytes
    const initValue = Math.max(0, (currentStorage - storageVariance + (storage[0] ?? 0)))
    storage[0] = initValue
  }

  // eslint-disable-next-line style/max-statements-per-line
  storage = (storage as number[]).reduce((p, c) => { if (p.length > 0) { c += p[p.length - 1] } p.push(c); return p }, [] as number[])
  // eslint-disable-next-line style/max-statements-per-line
  mau = (mau as number[]).reduce((p, c) => { if (p.length > 0) { c += p[p.length - 1] } p.push(c); return p }, [] as number[])
  // eslint-disable-next-line style/max-statements-per-line
  bandwidth = (bandwidth as number[]).reduce((p, c) => { if (p.length > 0) { c += p[p.length - 1] } p.push(c); return p }, [] as number[])
  if (isDashboard) {
    // eslint-disable-next-line style/max-statements-per-line
    gets = (gets as number[]).reduce((p, c) => { if (p.length > 0) { c += p[p.length - 1] } p.push(c); return p }, [] as number[])
  }
  const baseDay = dayjs(from).utc()

  const finalStats = createUndefinedArray(graphDays) as { date: string, mau: number, storage: number, bandwidth: number, get: number | undefined }[]
  const today = dayjs().utc()
  for (let i = 0; i < graphDays; i++) {
    const day = baseDay.add(i, 'day')
    if (day.utc().startOf('day').isAfter(today.utc().endOf('day')))
      continue
    finalStats[i] = {
      mau: mau[i],
      storage: storage[i],
      bandwidth: bandwidth[i],
      get: isDashboard ? gets[i] : undefined,
      date: day.toISOString(),
    }
  }
  return { data: finalStats.filter(x => !!x), error: null }
}

async function getBundleUsage(appId: string, from: Date, to: Date, shouldGetLatestVersion: boolean, supabase: ReturnType<typeof supabaseAdmin>) {
  const { data: dailyVersion, error: dailyVersionError } = await supabase
    .from('daily_version')
    .select('date, app_id, version_id, install, uninstall')
    .eq('app_id', appId)
    .gte('date', from.toISOString())
    .lte('date', to.toISOString())
    .order('date', { ascending: true })
  if (dailyVersionError)
    return { data: null, error: dailyVersionError }

  const { data: versionNames, error: versionNamesError } = await supabase
    .from('app_versions')
    .select('id, name, created_at')
    .eq('app_id', appId)
    .in('id', dailyVersion.map(d => d.version_id))

  if (versionNamesError)
    return { data: null, error: versionNamesError }

  // stolen from MobileStats.vue
  const versions = [...new Set(dailyVersion.map(d => d.version_id))]
  const dates = [...new Set(dailyVersion.map(d => d.date))].sort((a, b) => new Date(a).getTime() - new Date(b).getTime())

  // Step 1: Calculate accumulated data
  const accumulatedData = calculateAccumulatedData(dailyVersion, dates, versions)
  // Step 2: Convert to percentages, ensuring total <= 100% per day
  const percentageData = convertToPercentages(accumulatedData)
  // Step 3: Get active versions (versions with non-zero usage)
  const activeVersions = getActiveVersions(versions, percentageData)
  // Step 4: Create datasets for the chart
  const datasets = createDatasets(activeVersions, dates, percentageData, versionNames)

  if (shouldGetLatestVersion) {
    const latestVersion = getLatestVersion(versionNames)
    const latestVersionPercentage = getLatestVersionPercentage(datasets, latestVersion)

    return {
      data: {
        labels: dates,
        datasets,
        latestVersion: {
          name: latestVersion?.name,
          percentage: latestVersionPercentage.toFixed(2),
        },
      },
      error: null,
    }
  }

  return {
    data: {
      labels: dates,
      datasets,
    },
    error: null,
  }
}

// Calculate cumulative installs for each version over time
function calculateAccumulatedData(usage: AppUsageByVersion[], dates: string[], versions: number[]) {
  const accumulated: { [date: string]: { [version: number]: number } } = {}

  // Initialize with zeros
  dates.forEach((date) => {
    accumulated[date] = {}
    versions.forEach(version => accumulated[date][version] = 0)
  })

  // Process data day by day
  dates.forEach((date, index) => {
    const dailyUsage = usage.filter(u => u.date === date)
    const totalNewInstalls = dailyUsage.reduce((sum, u) => sum + (u.install ?? 0), 0)

    if (index === 0) {
      // First day: just add installs
      dailyUsage.forEach(({ version_id, install }) => {
        accumulated[date][version_id] = install ?? 0
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
        if (change?.uninstall) {
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
        percentages[date][version as any] = (dayData[version as any] / total) * 100
      })
    }
  })

  return percentages
}

// Filter out versions with no usage
function getActiveVersions(versions: number[], percentages: { [date: string]: { [version: number]: number } }) {
  return versions.filter(version =>
    Object.values(percentages).some(dayData => (dayData[version] ?? 0) > 0),
  )
}

// Create datasets for Chart.js
function createDatasets(versions: number[], dates: string[], percentages: { [date: string]: { [version: number]: number } }, versionNames: VersionName[]) {
  return versions.map((version) => {
    const percentageData = dates.map(date => percentages[date][version] ?? 0)
    // const color = colorKeys[(i + SKIP_COLOR) % colorKeys.length]
    const versionName = versionNames.find(v => v.id === version)?.name ?? version

    return {
      label: versionName,
      data: percentageData,
    }
  })
}

// Find the latest version based on creation date
function getLatestVersion(versions: VersionName[]) {
  return versions.reduce((latest, current) =>
    new Date(current.created_at ?? '') > new Date(latest.created_at ?? '') ? current : latest, versions[0])
}

// Get the percentage of the latest version on the last day
function getLatestVersionPercentage(datasets: any[], latestVersion: { name: string }) {
  const latestVersionDataset = datasets.find(dataset => dataset.label === latestVersion?.name)
  return latestVersionDataset ? latestVersionDataset.data[latestVersionDataset.data.length - 1] : 0
}

function getDaysBetweenDates(firstDate: Date, secondDate: Date) {
  const oneDay = 24 * 60 * 60 * 1000
  const res = Math.round(Math.abs((firstDate.valueOf() - secondDate.valueOf()) / oneDay))
  return res
}
