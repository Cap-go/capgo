import type { Context } from 'hono'
import type { AuthInfo } from '../../utils/hono.ts'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc.js'
import { z } from 'zod/mini'
import { honoFactory, quickError, simpleError, useCors } from '../../utils/hono.ts'
import { middlewareV2 } from '../../utils/hono_middleware.ts'
import { cloudlog } from '../../utils/logging.ts'
import { checkPermission } from '../../utils/rbac.ts'
import { supabaseApikey, supabaseClient } from '../../utils/supabase.ts'
import { isStripeConfigured } from '../../utils/utils.ts'
import { buildDailyReportedCountsByName, convertCountsToPercentagesByName, fillMissingDailyCounts } from '../../utils/version_stats_helpers.ts'

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

interface AppUsageByVersion {
  date: string
  app_id: string
  version_name: string
  get: number | null
  install: number | null
  uninstall: number | null
}

interface AppMetricRow {
  app_id: string
  date: string
  mau: number
  storage: number
  bandwidth: number
  build_time_unit: number
  get: number
  fail: number
  install: number
  uninstall: number
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
  if (!isStripeConfigured(c)) {
    return { isPayingAndGoodPlan: true }
  }
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
  if (appId && !ownerOrgId) {
    const { data, error } = await supabase.from('apps').select('*').eq('app_id', appId).single()
    if (error)
      return { data: null, error }
    ownerOrgId = data.owner_org
  }

  const startDate = dayjs(from).utc().format('YYYY-MM-DD')
  const endDate = dayjs(to).utc().format('YYYY-MM-DD')

  let rawMetrics: AppMetricRow[] | null
  let metricsError: unknown

  if (appId) {
    ({ data: rawMetrics, error: metricsError } = await supabase.rpc('get_app_metrics' as any, {
      p_org_id: ownerOrgId!,
      p_app_id: appId,
      p_start_date: startDate,
      p_end_date: endDate,
    }) as { data: AppMetricRow[] | null, error: unknown })
  }
  else {
    ({ data: rawMetrics, error: metricsError } = await supabase.rpc('get_app_metrics', {
      org_id: ownerOrgId!,
      start_date: startDate,
      end_date: endDate,
    }))
  }

  if (metricsError)
    return { data: null, error: metricsError }
  const metrics = (rawMetrics ?? []) as AppMetricRow[]
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
  // Query uses version_name column - cast needed because auto-generated types are stale
  const { data: rawDailyVersion, error: dailyVersionError } = await supabase
    .from('daily_version')
    .select('date, app_id, version_name, get, install, uninstall')
    .eq('app_id', appId)
    .gte('date', from.toISOString())
    .lte('date', to.toISOString())
    .not('version_name', 'is', null)
    .order('date', { ascending: true })
  if (dailyVersionError)
    return { data: null, error: dailyVersionError }

  // Cast to our interface - the SQL table has version_name but types are stale
  const dailyVersion = rawDailyVersion as unknown as AppUsageByVersion[]

  // Get unique version names from the data
  const versions = [...new Set(dailyVersion.map(d => d.version_name).filter(Boolean))] as string[]
  const dates = generateDateLabels(from, to)

  // Daily reported devices by version (from "get" stats), not synthetic install reconstruction.
  const dailyCounts = buildDailyReportedCountsByName(dailyVersion, dates, versions)
  const filledCounts = fillMissingDailyCounts(dailyCounts, dates, versions)
  const dailyPercentages = convertCountsToPercentagesByName(filledCounts, dates, versions)
  const activeVersions = getActiveVersionsByName(versions, filledCounts)
  const datasets = createDatasetsByName(activeVersions, dates, dailyPercentages, filledCounts)

  if (shouldGetLatestVersion) {
    const latestVersion = getLatestDayVersionShare(activeVersions, dates, filledCounts)

    return {
      data: {
        labels: dates,
        datasets,
        latestVersion: {
          name: latestVersion.name,
          percentage: latestVersion.percentage.toFixed(1),
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

// Filter out versions with no usage (by version_name)
function getActiveVersionsByName(versions: string[], counts: { [date: string]: { [version: string]: number } }) {
  return versions.filter(version =>
    Object.values(counts).some(dayData => (dayData[version] ?? 0) > 0),
  )
}

// Create datasets for Chart.js (by version_name - no lookup needed)
function createDatasetsByName(
  versions: string[],
  dates: string[],
  percentages: { [date: string]: { [version: string]: number } },
  counts: { [date: string]: { [version: string]: number } },
) {
  return versions.map((version) => {
    const percentageData = dates.map(date => percentages[date][version] ?? 0)
    const countData = dates.map(date => Math.max(0, Math.round(counts[date][version] ?? 0)))

    return {
      label: version,
      data: percentageData,
      metaCounts: countData,
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
  buildDailyReportedCountsByName,
  fillMissingDailyCounts,
  convertCountsToPercentagesByName,
  getActiveVersionsByName,
  createDatasetsByName,
  getLatestDayVersionShare,
}

function getLatestDayVersionShare(
  versions: string[],
  dates: string[],
  counts: { [date: string]: { [version: string]: number } },
) {
  if (versions.length === 0 || dates.length === 0)
    return { name: '', percentage: 0 }

  for (let index = dates.length - 1; index >= 0; index--) {
    const date = dates[index]
    const dayData = counts[date] ?? {}
    let totalAtIndex = 0
    let maxVersion = ''
    let maxCount = -1

    versions.forEach((version) => {
      const count = Math.max(0, Number(dayData[version]) || 0)
      totalAtIndex += count
      if (count > maxCount) {
        maxCount = count
        maxVersion = version
      }
    })

    if (totalAtIndex > 0) {
      return {
        name: maxVersion,
        percentage: (maxCount / totalAtIndex) * 100,
      }
    }
  }

  return { name: '', percentage: 0 }
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
    throw quickError(401, 'no_access_to_app', 'No access to app', { data: auth?.userId ?? null })
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

  const { data: finalStats, error } = await getNormalStats(c, appId, app?.owner_org ?? null, body.from, body.to, supabase, c.get('auth')?.authType === 'jwt', false, body.noAccumulate ?? false)

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
    throw quickError(401, 'no_access_to_organization', 'No access to organization', { data: auth?.userId ?? null })
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
    throw quickError(401, 'no_access_to_app', 'No access to app', { data: auth?.userId ?? null })
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

  cloudlog({ requestId: c.get('requestId'), message: 'orgs', data: orgIds })

  if (orgIds.length === 0) {
    throw quickError(401, 'no_organizations_found', 'No organizations found', { data: auth?.userId ?? null })
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
