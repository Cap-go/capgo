import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { middlewareAPISecret, parseBody, simpleError, useCors } from '../utils/hono.ts'
import { cloudlog, cloudlogErr } from '../utils/logging.ts'
import { retryWithBackoff } from '../utils/retry.ts'
import { readStatsBandwidth, readStatsMau, readStatsStorage, readStatsVersion } from '../utils/stats.ts'
import { supabaseAdmin } from '../utils/supabase.ts'

interface DataToGet {
  appId?: string
  orgId?: string
  todayOnly?: boolean
}

export const app = new Hono<MiddlewareKeyVariables>()

const SUPABASE_RETRY_ATTEMPTS = 3
const SUPABASE_RETRY_DELAY_MS = 300
const PLAN_REFRESH_RETRY_ATTEMPTS = 3
const PLAN_REFRESH_RETRY_DELAY_MS = 300

interface SupabaseRetryResult<T> {
  data: T | null
  error: unknown
  status?: number | null
}

interface OrgStatsRefreshTarget {
  customerId: string | null
  previousStatsUpdatedAt: string | null
}

interface AppRefreshStateRow {
  app_id: string
  stats_refresh_requested_at: string | null
  stats_updated_at: string | null
}

function parseRefreshTimestamp(value: string | null | undefined): number | null {
  if (!value)
    return null

  const normalized = /(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : `${value}Z`
  const parsed = Date.parse(normalized)
  return Number.isNaN(parsed) ? null : parsed
}

interface CycleInfo {
  subscription_anchor_start: string | null
  subscription_anchor_end: string | null
}

interface AppOwnerOrgRow {
  owner_org: string
}

interface VersionNameRow {
  id: number
  name: string
}

function getRetryablePostgrestStatus(candidate: unknown): number | null {
  if (candidate && typeof candidate === 'object') {
    if ('status' in candidate && typeof (candidate as { status?: unknown }).status === 'number') {
      return (candidate as { status: number }).status
    }

    if ('message' in candidate && typeof (candidate as { message?: unknown }).message === 'string') {
      const match = /error code:\s*(\d{3})/i.exec((candidate as { message: string }).message)
      if (match) {
        return Number.parseInt(match[1], 10)
      }
    }
  }

  return null
}

function isRetryablePostgrestStatus(status: number | null): boolean {
  return status !== null && status >= 500 && status < 600
}

function isRetryablePostgrestError(error: unknown): boolean {
  const status = getRetryablePostgrestStatus(error)
  return isRetryablePostgrestStatus(status)
}

function isRetryablePostgrestResult(result: SupabaseRetryResult<unknown> | null | undefined): boolean {
  if (!result) {
    return false
  }

  return isRetryablePostgrestStatus(getRetryablePostgrestStatus(result)) || isRetryablePostgrestError(result.error)
}

async function runSupabaseResultWithRetry<T>(
  c: Parameters<typeof supabaseAdmin>[0],
  label: string,
  operation: () => Promise<SupabaseRetryResult<T>>,
): Promise<SupabaseRetryResult<T>> {
  const { result, attempts } = await retryWithBackoff(async () => {
    try {
      return await operation()
    }
    catch (error) {
      return {
        data: null,
        error,
      }
    }
  }, {
    attempts: SUPABASE_RETRY_ATTEMPTS,
    baseDelayMs: SUPABASE_RETRY_DELAY_MS,
    shouldRetry: result => isRetryablePostgrestResult(result),
  })

  if (!result) {
    throw new Error(`${label} returned no result`)
  }

  if (attempts > 1) {
    cloudlog({
      requestId: c.get('requestId'),
      message: 'cron_stat_app retry finished',
      label,
      attempts,
      hadError: Boolean(result.error || isRetryablePostgrestStatus(getRetryablePostgrestStatus(result))),
    })
  }

  if (result.error) {
    throw result.error
  }

  if (typeof result.status === 'number' && result.status >= 400) {
    throw new Error(`${label} failed with status ${result.status}`)
  }

  return result
}

async function getOrgStatsRefreshTarget(
  c: Parameters<typeof supabaseAdmin>[0],
  supabase: ReturnType<typeof supabaseAdmin>,
  orgId: string,
): Promise<OrgStatsRefreshTarget> {
  const { data: orgData } = await runSupabaseResultWithRetry<{ customer_id: string | null, stats_updated_at: string | null }>(c, 'load_org_stats_refresh_target', async () => await supabase
    .from('orgs')
    .select('customer_id,stats_updated_at')
    .eq('id', orgId)
    .single())

  return {
    customerId: orgData?.customer_id ?? null,
    previousStatsUpdatedAt: orgData?.stats_updated_at ?? null,
  }
}

async function syncAppStatsRefresh(
  c: Parameters<typeof supabaseAdmin>[0],
  supabase: ReturnType<typeof supabaseAdmin>,
  appId: string,
  refreshCompletedAt: string,
): Promise<void> {
  await runSupabaseResultWithRetry(c, 'sync_app_stats_refresh', async () => await supabase.from('apps')
    .update({
      stats_updated_at: refreshCompletedAt,
    })
    .eq('app_id', appId))
}

async function syncOrgStatsRefresh(
  c: Parameters<typeof supabaseAdmin>[0],
  supabase: ReturnType<typeof supabaseAdmin>,
  orgId: string,
  previousStatsUpdatedAt: string | null,
  refreshCompletedAt: string,
): Promise<void> {
  await runSupabaseResultWithRetry(c, 'sync_org_stats_refresh', async () => await supabase.from('orgs')
    .update({
      stats_updated_at: refreshCompletedAt,
      last_stats_updated_at: previousStatsUpdatedAt,
    })
    .eq('id', orgId))
}

async function hasPendingAppStatsRefresh(
  supabase: ReturnType<typeof supabaseAdmin>,
  orgId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('apps')
    .select('app_id,stats_refresh_requested_at,stats_updated_at')
    .eq('owner_org', orgId)

  if (error) {
    throw error
  }

  const rows = (data ?? []) as AppRefreshStateRow[]
  return rows.some((row) => {
    const requestedAt = parseRefreshTimestamp(row.stats_refresh_requested_at)
    if (requestedAt === null)
      return false

    const updatedAt = parseRefreshTimestamp(row.stats_updated_at)
    return updatedAt === null || requestedAt > updatedAt
  })
}

async function queueOrgPlanRefresh(
  supabase: ReturnType<typeof supabaseAdmin>,
  orgId: string,
  customerId: string,
): Promise<SupabaseRetryResult<unknown>> {
  const result = await supabase.rpc('queue_cron_stat_org_for_org', {
    org_id: orgId,
    customer_id: customerId,
  })

  return {
    data: result.data,
    error: result.error,
    status: result.status,
  }
}

async function queueOrgPlanRefreshWithRetry(
  c: Parameters<typeof supabaseAdmin>[0],
  supabase: ReturnType<typeof supabaseAdmin>,
  orgId: string,
  customerId: string,
): Promise<void> {
  const { result, lastError, attempts } = await retryWithBackoff(async () => await queueOrgPlanRefresh(supabase, orgId, customerId), {
    attempts: PLAN_REFRESH_RETRY_ATTEMPTS,
    baseDelayMs: PLAN_REFRESH_RETRY_DELAY_MS,
    shouldRetry: result => isRetryablePostgrestResult(result),
  })

  if (lastError || !result || result.error || (typeof result.status === 'number' && result.status >= 400)) {
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'Failed to queue cron_stat_app org plan refresh',
      orgId,
      customerId,
      attempts,
      error: lastError ?? result?.error ?? result,
    })
    return
  }

  cloudlog({
    requestId: c.get('requestId'),
    message: attempts > 1 ? 'plan processing queued for org after retries' : 'plan processing queued for org',
    orgId,
    customerId,
    attempts,
  })
}

app.use('/', useCors)

app.post('/', middlewareAPISecret, async (c) => {
  const body = await parseBody<DataToGet>(c)
  cloudlog({ requestId: c.get('requestId'), message: 'post cron_stat_app body', body })
  if (!body.appId)
    throw simpleError('no_appId', 'No appId', { body })
  if (!body.orgId)
    throw simpleError('no_orgId', 'No orgId', { body })
  const appId = body.appId
  const orgId = body.orgId

  const supabase = supabaseAdmin(c)

  const appResult = await runSupabaseResultWithRetry<AppOwnerOrgRow>(c, 'load_app', async () => await supabase.from('apps')
    .select('owner_org')
    .eq('app_id', appId)
    .maybeSingle())
  if (!appResult.data) {
    cloudlog({ requestId: c.get('requestId'), message: 'cron_stat_app skipping missing app', body })
    return c.json({ status: 'skipped', reason: 'app_not_found' })
  }
  if (appResult.data.owner_org !== orgId) {
    cloudlog({
      requestId: c.get('requestId'),
      message: 'cron_stat_app skipping owner mismatch',
      body,
      app_owner_org: appResult.data.owner_org,
    })
    return c.json({ status: 'skipped', reason: 'owner_org_mismatch' })
  }

  // get the period of the billing of the organization
  const cycleInfoResult = await runSupabaseResultWithRetry<CycleInfo>(c, 'get_cycle_info_org', async () => await supabase.rpc('get_cycle_info_org', { orgid: orgId }).single())
  const cycleInfo = cycleInfoResult.data
  if (!cycleInfo?.subscription_anchor_start || !cycleInfo?.subscription_anchor_end)
    throw simpleError('cannot_get_cycle_info', 'Cannot get cycle info', { cycleInfoResult })

  cloudlog({ requestId: c.get('requestId'), message: 'cycleInfo', cycleInfo })
  const startDate = cycleInfo.subscription_anchor_start
  const endDate = cycleInfo.subscription_anchor_end

  // get mau
  let mau = await readStatsMau(c, body.appId, startDate, endDate)
  // get bandwidth
  let bandwidth = await readStatsBandwidth(c, body.appId, startDate, endDate)
  // get storage
  let storage = await readStatsStorage(c, body.appId, startDate, endDate)
  let versionUsage = await readStatsVersion(c, body.appId, startDate, endDate)

  if (body.todayOnly) {
    // take only the last day
    mau = mau.slice(-1)
    bandwidth = bandwidth.slice(-1)
    storage = storage.slice(-1)
    versionUsage = versionUsage.slice(-1)
  }

  // Handle backwards compatibility: old Cloudflare data has numeric version_id in blob2,
  // new data has version_name string. Detect and resolve old data.
  const versionNamesToResolve = versionUsage
    .filter(v => /^\d+$/.test(String(v.version_name)))
    .map(v => Number(v.version_name))

  let versionIdToNameMap: Record<number, string> = {}
  if (versionNamesToResolve.length > 0) {
    const { data: versions } = await runSupabaseResultWithRetry<VersionNameRow[]>(c, 'resolve_version_names', async () => await supabase
      .from('app_versions')
      .select('id, name')
      .in('id', versionNamesToResolve))
    if (versions) {
      versionIdToNameMap = Object.fromEntries(versions.map(v => [v.id, v.name]))
    }
  }

  // Map version_name for old data (numeric version_id -> actual version name)
  const mappedVersionUsage = versionUsage.map((v) => {
    const versionNameOrId = String(v.version_name)
    if (/^\d+$/.test(versionNameOrId)) {
      // Old data: resolve version_id to version_name
      const resolvedName = versionIdToNameMap[Number(versionNameOrId)]
      return { ...v, version_name: resolvedName || versionNameOrId }
    }
    return v
  })

  // Aggregate entries with same (app_id, date, version_name) after mapping
  // This handles the transition period where old (version_id) and new (version_name) data coexist
  const aggregationMap = new Map<string, typeof mappedVersionUsage[0]>()
  for (const entry of mappedVersionUsage) {
    const key = `${entry.app_id}|${entry.date}|${entry.version_name}`
    const existing = aggregationMap.get(key)
    if (existing) {
      // Aggregate stats
      existing.get += entry.get
      existing.fail += entry.fail
      existing.install += entry.install
      existing.uninstall += entry.uninstall
    }
    else {
      // Clone to avoid mutating original
      aggregationMap.set(key, { ...entry })
    }
  }
  const resolvedVersionUsage = Array.from(aggregationMap.values())

  cloudlog({ requestId: c.get('requestId'), message: 'mau', mauLength: mau.length, mauCount: mau.reduce((acc, curr) => acc + curr.mau, 0), mau: JSON.stringify(mau) })
  cloudlog({ requestId: c.get('requestId'), message: 'bandwidth', bandwidthLength: bandwidth.length, bandwidthCount: bandwidth.reduce((acc, curr) => acc + curr.bandwidth, 0), bandwidth: JSON.stringify(bandwidth) })
  cloudlog({ requestId: c.get('requestId'), message: 'storage', storageLength: storage.length, storageCount: storage.reduce((acc, curr) => acc + curr.storage, 0), storage: JSON.stringify(storage) })
  cloudlog({ requestId: c.get('requestId'), message: 'versionUsage', versionUsageLength: resolvedVersionUsage.length, versionUsageCount: resolvedVersionUsage.reduce((acc, curr) => acc + curr.get + curr.fail + curr.install + curr.uninstall, 0), versionUsage: JSON.stringify(resolvedVersionUsage) })

  // save to daily_mau, daily_bandwidth and daily_storage
  // Note: daily_version upsert uses type cast because auto-generated types are stale
  // (migration adds version_name column but types haven't been regenerated)
  await Promise.all([
    runSupabaseResultWithRetry(c, 'upsert_daily_mau', async () => await supabase.from('daily_mau')
      .upsert(mau, { onConflict: 'app_id,date' })
      .eq('app_id', appId)),
    runSupabaseResultWithRetry(c, 'upsert_daily_bandwidth', async () => await supabase.from('daily_bandwidth')
      .upsert(bandwidth, { onConflict: 'app_id,date' })
      .eq('app_id', appId)),
    runSupabaseResultWithRetry(c, 'upsert_daily_storage', async () => await supabase.from('daily_storage')
      .upsert(storage, { onConflict: 'app_id,date' })
      .eq('app_id', appId)),
    runSupabaseResultWithRetry(c, 'upsert_daily_version', async () => await supabase.from('daily_version')
      .upsert(resolvedVersionUsage, { onConflict: 'app_id,date,version_name' })
      .eq('app_id', appId)),
  ])

  cloudlog({ requestId: c.get('requestId'), message: 'stats saved', mauLength: mau.length, bandwidthLength: bandwidth.length, storageLength: storage.length, versionUsageLength: versionUsage.length })
  const refreshCompletedAt = new Date().toISOString()
  await syncAppStatsRefresh(c, supabase, body.appId, refreshCompletedAt)

  let pendingAppRefreshes = true
  try {
    pendingAppRefreshes = await hasPendingAppStatsRefresh(supabase, body.orgId)
  }
  catch (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Failed to inspect pending cron_stat_app refresh state', orgId: body.orgId, error })
  }

  let orgStatsRefreshTarget: OrgStatsRefreshTarget | null = null
  try {
    orgStatsRefreshTarget = await getOrgStatsRefreshTarget(c, supabase, orgId)
  }
  catch (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Failed to load cron_stat_app org refresh target', orgId, error })
  }

  if (orgStatsRefreshTarget && !pendingAppRefreshes) {
    try {
      await syncOrgStatsRefresh(c, supabase, orgId, orgStatsRefreshTarget.previousStatsUpdatedAt, refreshCompletedAt)
    }
    catch (error) {
      cloudlogErr({ requestId: c.get('requestId'), message: 'Failed to persist cron_stat_app org refresh metadata', orgId, error })
    }
  }

  if (orgStatsRefreshTarget?.customerId && !pendingAppRefreshes) {
    await queueOrgPlanRefreshWithRetry(c, supabase, orgId, orgStatsRefreshTarget.customerId)
  }

  return c.json({ status: 'Stats saved', mau, bandwidth, storage, versionUsage })
})

export const cronStatAppTestUtils = {
  isRetryablePostgrestError,
  runSupabaseResultWithRetry,
}
