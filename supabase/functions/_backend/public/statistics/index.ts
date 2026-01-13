import type { Context } from 'hono'
import type { AuthInfo } from '../../utils/hono.ts'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc.js'
import { z } from 'zod/mini'
import { honoFactory, quickError, simpleError, useCors } from '../../utils/hono.ts'
import { middlewareV2 } from '../../utils/hono_middleware.ts'
import { cloudlog, cloudlogErr } from '../../utils/logging.ts'
import { supabaseApikey, supabaseClient } from '../../utils/supabase.ts'
import { checkPermission } from '../../utils/rbac.ts'

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
  breakdown: z.optional(z.coerce.boolean()),
  noAccumulate: z.optional(z.coerce.boolean()), // Default to true for backward compatibility
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

// Helper to get authenticated supabase client based on auth type
function getAuthenticatedSupabase(c: Context, auth: AuthInfo) {
  if (auth.authType === 'apikey' && auth.apikey) {
    return supabaseApikey(c, auth.apikey.key)
  }
  // JWT auth
  const authorization = c.req.header('authorization')
  if (!authorization) {
    throw quickError(401, 'no_authorization', 'No authorization header')
  }
  return supabaseClient(c, authorization)
}

async function checkOrganizationAccess(c: Context, orgId: string, supabase: ReturnType<typeof supabaseClient>) {
  // Use the existing PostgreSQL function to check organization payment and plan status
  const { data: isPayingAndGoodPlan, error } = await supabase
    .rpc('is_paying_and_good_plan_org', { orgid: orgId })
    .single()

  if (error) {
    throw quickError(404, 'organization_not_found', 'Organization not found or error checking status', {
      error,
    })
  }

  // If organization is not paying or doesn't have a good plan, throw error
  if (!isPayingAndGoodPlan) {
    throw quickError(402, 'subscription_required', 'Organization subscription required or plan invalid', {
      orgId,
      isPayingAndGoodPlan,
    })
  }

  return { isPayingAndGoodPlan }
}

async function getNormalStats(c: Context, appId: string | null, ownerOrg: string | null, from: Date, to: Date, supabase: ReturnType<typeof supabaseClient>, isDashboard: boolean = false, includeBreakdown: boolean = false, noAccumulate: boolean = false) {
  if (!appId && !ownerOrg)
    return { data: null, error: 'Invalid appId or ownerOrg' }

  let ownerOrgId = ownerOrg
  if (appId) {
    const { data, error } = await supabase.from('apps').select('*').eq('app_id', appId).single()
    if (error)
      return { data: null, error }
    ownerOrgId = data.owner_org
  }

  const { data: metrics, error: metricsError } = await supabase.rpc('get_app_metrics', { org_id: ownerOrgId!, start_date: dayjs(from).utc().format('YYYY-MM-DD'), end_date: dayjs(to).utc().format('YYYY-MM-DD') })
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
  let buildTime = createUndefinedArray(graphDays) as number[]
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

          const buildTimeVal = item.build_time_unit ?? 0
          if (buildTime[dayNumber])
            buildTime[dayNumber] += buildTimeVal
          else
            buildTime[dayNumber] = buildTimeVal

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

  // Accumulate data if requested (default behavior for backward compatibility)
  if (noAccumulate === false) {
    // eslint-disable-next-line style/max-statements-per-line
    storage = (storage as number[]).reduce((p, c) => { if (p.length > 0) { c += p[p.length - 1] } p.push(c); return p }, [] as number[])
    // eslint-disable-next-line style/max-statements-per-line
    mau = (mau as number[]).reduce((p, c) => { if (p.length > 0) { c += p[p.length - 1] } p.push(c); return p }, [] as number[])
    // eslint-disable-next-line style/max-statements-per-line
    bandwidth = (bandwidth as number[]).reduce((p, c) => { if (p.length > 0) { c += p[p.length - 1] } p.push(c); return p }, [] as number[])
    // eslint-disable-next-line style/max-statements-per-line
    buildTime = (buildTime as number[]).reduce((p, c) => { if (p.length > 0) { c += p[p.length - 1] } p.push(c); return p }, [] as number[])
    if (isDashboard) {
      // eslint-disable-next-line style/max-statements-per-line
      gets = (gets as number[]).reduce((p, c) => { if (p.length > 0) { c += p[p.length - 1] } p.push(c); return p }, [] as number[])
    }
  }
  const baseDay = dayjs(from).utc()

  const finalStats = createUndefinedArray(graphDays) as { date: string, mau: number, storage: number, bandwidth: number, build_time_seconds: number, get: number | undefined }[]
  const today = dayjs().utc()
  for (let i = 0; i < graphDays; i++) {
    const day = baseDay.add(i, 'day')
    if (day.utc().startOf('day').isAfter(today.utc().endOf('day')))
      continue
    finalStats[i] = {
      mau: mau[i],
      storage: storage[i],
      bandwidth: bandwidth[i],
      build_time_seconds: buildTime[i],
      get: isDashboard ? gets[i] : undefined,
      date: day.toISOString(),
    }
  }

  // If breakdown is requested, return both aggregated and per-app data
  if (includeBreakdown && ownerOrg) {
    const breakdown: any[] = []

    // Process each app's data through the same aggregation logic
    Object.keys(metricsByApp).forEach((appId) => {
      const appMetrics = metricsByApp[appId]

      // Initialize arrays for this app
      let appMau = createUndefinedArray(graphDays) as number[]
      let appStorage = createUndefinedArray(graphDays) as number[]
      let appBandwidth = createUndefinedArray(graphDays) as number[]
      let appBuildTime = createUndefinedArray(graphDays) as number[]
      let appGets = isDashboard ? createUndefinedArray(graphDays) as number[] : []

      // Process metrics for this app (same logic as aggregated version)
      appMetrics.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).forEach((item, i) => {
        if (item.date) {
          const dayNumber = i
          if (appMau[dayNumber])
            appMau[dayNumber] += item.mau
          else
            appMau[dayNumber] = item.mau

          const storageVal = item.storage
          if (appStorage[dayNumber])
            appStorage[dayNumber] += storageVal
          else
            appStorage[dayNumber] = storageVal

          const bandwidthVal = item.bandwidth ?? 0
          if (appBandwidth[dayNumber])
            appBandwidth[dayNumber] += bandwidthVal
          else
            appBandwidth[dayNumber] = bandwidthVal

          const buildTimeVal = item.build_time_unit ?? 0
          if (appBuildTime[dayNumber])
            appBuildTime[dayNumber] += buildTimeVal
          else
            appBuildTime[dayNumber] = buildTimeVal

          if (isDashboard) {
            appGets[dayNumber] = item.get
          }
        }
      })

      // Accumulate data if requested (default behavior for backward compatibility)
      if (noAccumulate === false) {
        appStorage = (appStorage as number[]).reduce((p, c) => {
          if (p.length > 0) {
            c += p[p.length - 1]
          }
          p.push(c)
          return p
        }, [] as number[])
        appMau = (appMau as number[]).reduce((p, c) => {
          if (p.length > 0) {
            c += p[p.length - 1]
          }
          p.push(c)
          return p
        }, [] as number[])
        appBandwidth = (appBandwidth as number[]).reduce((p, c) => {
          if (p.length > 0) {
            c += p[p.length - 1]
          }
          p.push(c)
          return p
        }, [] as number[])
        appBuildTime = (appBuildTime as number[]).reduce((p, c) => {
          if (p.length > 0) {
            c += p[p.length - 1]
          }
          p.push(c)
          return p
        }, [] as number[])
        if (isDashboard) {
          appGets = (appGets as number[]).reduce((p, c) => {
            if (p.length > 0) {
              c += p[p.length - 1]
            }
            p.push(c)
            return p
          }, [] as number[])
        }
      }

      // Create final stats for this app
      for (let i = 0; i < graphDays; i++) {
        const day = baseDay.add(i, 'day')
        if (day.utc().startOf('day').isAfter(today.utc().endOf('day')))
          continue

        breakdown.push({
          app_id: appId,
          date: day.toISOString(),
          mau: appMau[i],
          storage: appStorage[i],
          bandwidth: appBandwidth[i],
          build_time_seconds: appBuildTime[i],
          get: isDashboard ? appGets[i] : undefined,
        })
      }
    })

    return {
      data: {
        global: finalStats.filter(x => !!x),
        byApp: breakdown.filter(x => !!x),
      },
      error: null,
    }
  }

  return { data: finalStats.filter(x => !!x), error: null }
}

async function getBundleUsage(appId: string, from: Date, to: Date, shouldGetLatestVersion: boolean, supabase: ReturnType<typeof supabaseClient>) {
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
  const dates = generateDateLabels(from, to)

  // Step 1: Calculate accumulated data
  const accumulatedData = calculateAccumulatedData(dailyVersion, dates, versions)
  // Step 2: Convert to percentages, ensuring total <= 100% per day
  const percentageData = convertToPercentages(accumulatedData)
  // Step 3: Get active versions (versions with non-zero usage)
  const activeVersions = getActiveVersions(versions, percentageData)
  // Step 4: Create datasets for the chart
  let datasets = createDatasets(activeVersions, dates, percentageData, versionNames)
  datasets = fillMissingDailyData(datasets, dates)

  if (shouldGetLatestVersion) {
    const latestVersion = getLatestVersion(versionNames)
    const latestVersionPercentage = getLatestVersionPercentage(datasets, latestVersion)

    return {
      data: {
        labels: dates,
        datasets,
        latestVersion: {
          name: latestVersion?.name,
          percentage: latestVersionPercentage.toFixed(1),
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

        if (change?.install) {
          // Version has new installs: add them
          accumulated[date][version] = prevValue + change.install
        }
        else {
          // Version has no new installs: decrease proportionally (guard against zero totals)
          const decreaseFactor = prevTotal === 0 ? 1 : Math.max(0, 1 - (totalNewInstalls / prevTotal))
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
    const percentageData = dates.map(date => Number((percentages[date][version] ?? 0).toFixed(1)))
    // const color = colorKeys[(i + SKIP_COLOR) % colorKeys.length]
    const versionName = versionNames.find(v => v.id === version)?.name ?? String(version)

    return {
      label: versionName,
      data: percentageData,
    }
  })
}

function generateDateLabels(from: Date, to: Date) {
  const start = dayjs(from).utc().startOf('day')
  const end = dayjs(to).utc().startOf('day')

  if (start.isAfter(end))
    return []

  const labels: string[] = []
  let cursor = start
  while (cursor.isBefore(end) || cursor.isSame(end)) {
    labels.push(cursor.format('YYYY-MM-DD'))
    cursor = cursor.add(1, 'day')
  }

  return labels
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

export const bundleUsageTestUtils = {
  generateDateLabels,
  fillMissingDailyData,
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

app.get('/app/:app_id', async (c) => {
  const appId = c.req.param('app_id')
  const query = c.req.query()
  const bodyParsed = normalStatsSchema.safeParse(query)
  if (!bodyParsed.success) {
    throw simpleError('invalid_body', 'Invalid body', { error: bodyParsed.error })
  }
  const body = bodyParsed.data
  const auth = c.get('auth') as AuthInfo

  // Use unified RBAC permission check
  if (!await checkPermission(c, 'app.read', { appId })) {
    throw quickError(401, 'no_access_to_app', 'No access to app', { data: c.get('auth') })
  }

  // Use authenticated client - RLS will enforce access
  const supabase = getAuthenticatedSupabase(c, auth)

  // Get the organization ID for this app and check organization access
  const { data: app } = await supabase
    .from('apps')
    .select('owner_org')
    .eq('app_id', appId)
    .single()

  if (app?.owner_org && auth.authType !== 'jwt') {
    await checkOrganizationAccess(c, app.owner_org, supabase)
  }

  const { data: finalStats, error } = await getNormalStats(c, appId, null, body.from, body.to, supabase, c.get('auth')?.authType === 'jwt', false, body.noAccumulate ?? false)

  if (error) {
    throw quickError(500, 'cannot_get_app_statistics', 'Cannot get app statistics', { error })
  }

  return c.json(finalStats)
})

app.get('/org/:org_id', async (c) => {
  const orgId = c.req.param('org_id')
  const query = c.req.query()

  const bodyParsed = normalStatsSchema.safeParse(query)
  if (!bodyParsed.success) {
    throw simpleError('invalid_body', 'Invalid body', { error: bodyParsed.error })
  }
  const body = bodyParsed.data

  const auth = c.get('auth') as AuthInfo
  // Use unified RBAC permission check
  if (!(await checkPermission(c, 'org.read', { orgId }))) {
    throw quickError(401, 'no_access_to_organization', 'No access to organization', { data: auth.userId })
  }
  if (auth.authType === 'apikey' && auth.apikey!.limited_to_orgs && auth.apikey!.limited_to_orgs.length > 0) {
    if (!auth.apikey!.limited_to_orgs.includes(orgId)) {
      throw quickError(401, 'invalid_apikey', 'Invalid apikey', { data: auth.apikey!.key })
    }
  }

  if (auth.authType === 'apikey' && auth.apikey!.limited_to_apps && auth.apikey!.limited_to_apps.length > 0) {
    throw quickError(401, 'invalid_apikey', 'Invalid apikey', { data: auth.apikey!.key })
  }

  // Use authenticated client - RLS will enforce access
  const supabase = getAuthenticatedSupabase(c, auth)

  // Check organization payment status before returning stats
  if (auth.authType !== 'jwt')
    await checkOrganizationAccess(c, orgId, supabase)

  const { data: finalStats, error } = await getNormalStats(c, null, orgId, body.from, body.to, supabase, c.get('auth')?.authType === 'jwt', body.breakdown ?? false, body.noAccumulate ?? false)

  if (error) {
    throw quickError(500, 'cannot_get_organization_statistics', 'Cannot get organization statistics', { error })
  }

  return c.json(finalStats)
})

app.get('/app/:app_id/bundle_usage', async (c) => {
  const appId = c.req.param('app_id')
  const query = c.req.query()
  const useDashboard = false

  const bodyParsed = bundleUsageSchema.safeParse(query)
  if (!bodyParsed.success) {
    throw simpleError('invalid_body', 'Invalid body', { error: bodyParsed.error })
  }
  const body = bodyParsed.data
  const auth = c.get('auth') as AuthInfo

  // Use unified RBAC permission check
  if (!await checkPermission(c, 'app.read', { appId })) {
    throw quickError(401, 'no_access_to_app', 'No access to app', { data: c.get('auth') })
  }

  // Use authenticated client - RLS will enforce access
  const supabase = getAuthenticatedSupabase(c, auth)

  // Get the organization ID for this app and check organization access
  const { data: app } = await supabase
    .from('apps')
    .select('owner_org')
    .eq('app_id', appId)
    .single()

  if (app?.owner_org && auth.authType !== 'jwt') {
    await checkOrganizationAccess(c, app.owner_org, supabase)
  }

  const { data, error } = await getBundleUsage(appId, body.from, body.to, useDashboard, supabase)

  if (error) {
    throw quickError(500, 'cannot_get_app_statistics', 'Cannot get app statistics', { error })
  }

  return c.json(data)
})

app.get('/user', async (c) => {
  const auth = c.get('auth') as AuthInfo
  // Use authenticated client - RLS will enforce access
  const supabase = getAuthenticatedSupabase(c, auth)

  const query = c.req.query()
  const bodyParsed = normalStatsSchema.safeParse(query)
  if (!bodyParsed.success) {
    throw simpleError('invalid_body', 'Invalid body', { error: bodyParsed.error })
  }
  const body = bodyParsed.data

  const { data: orgs, error: orgsError } = await supabase
    .rpc('get_user_org_ids')

  if (orgsError) {
    throw quickError(404, 'user_not_found', 'User not found', { error: orgsError })
  }

  const orgIds = Array.from(new Set((orgs ?? []).map(org => org.org_id)))

  cloudlogErr({ requestId: c.get('requestId'), message: 'orgs', data: orgIds })

  if (orgIds.length === 0) {
    throw quickError(401, 'no_organizations_found', 'No organizations found', { data: auth.userId })
  }

  // Check organization payment status for each organization before returning stats
  for (const orgId of orgIds) {
    if (auth.authType !== 'jwt')
      await checkOrganizationAccess(c, orgId, supabase)
  }

  let stats: Array<{ data: any, error: any }> = []
  if (auth.authType === 'apikey' && auth.apikey!.limited_to_apps && auth.apikey!.limited_to_apps.length > 0) {
    stats = await Promise.all(auth.apikey!.limited_to_apps.map(appId => getNormalStats(c, appId, null, body.from, body.to, supabase, auth.authType === 'jwt', false, body.noAccumulate ?? false)))
  }
  else {
    stats = await Promise.all(orgIds.map(orgId => getNormalStats(c, null, orgId, body.from, body.to, supabase, auth.authType === 'jwt', false, body.noAccumulate ?? false)))
  }

  const errors = stats.filter(stat => stat.error).map(stat => stat.error)
  if (errors.length > 0) {
    throw quickError(500, 'cannot_get_user_statistics', 'Cannot get user statistics', { error: errors })
  }

  interface StatEntry {
    date: string
    mau: number
    storage: number
    bandwidth: number
    build_time_seconds: number
    get?: number
  }

  const finalStats = Array.from(stats.map(stat => stat.data!).flat().reduce((acc, curr) => {
    const current = acc.get(curr.date)
    if (current) {
      current.mau += curr.mau
      current.storage += curr.storage
      current.bandwidth += curr.bandwidth
      current.build_time_seconds += curr.build_time_seconds
    }
    else {
      acc.set(curr.date, curr)
    }
    return acc
  }, new Map<string, StatEntry>()).values())

  return c.json(finalStats)
})
