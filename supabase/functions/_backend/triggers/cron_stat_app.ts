import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { middlewareAPISecret, parseBody, quickError, simpleError, useCors } from '../utils/hono.ts'
import { cloudlog } from '../utils/logging.ts'
import { readStatsBandwidth, readStatsMau, readStatsStorage, readStatsVersion } from '../utils/stats.ts'
import { supabaseAdmin } from '../utils/supabase.ts'

interface DataToGet {
  appId?: string
  orgId?: string
  todayOnly?: boolean
}

export const app = new Hono<MiddlewareKeyVariables>()

app.use('/', useCors)

app.post('/', middlewareAPISecret, async (c) => {
  const body = await parseBody<DataToGet>(c)
  cloudlog({ requestId: c.get('requestId'), message: 'post cron_stat_app body', body })
  if (!body.appId)
    throw simpleError('no_appId', 'No appId', { body })
  if (!body.orgId)
    throw simpleError('no_orgId', 'No orgId', { body })

  const supabase = supabaseAdmin(c)

  const app = await supabase.from('apps')
    .select('*')
    .eq('app_id', body.appId)
    .single()
  if (!app.data)
    return quickError(404, 'app_not_found', 'App not found', { body })
  if (app.data.owner_org !== body.orgId)
    return quickError(401, 'app_not_found', 'This app is not owned by the organization', { body })

  // get the period of the billing of the organization
  const cycleInfoData = await supabase.rpc('get_cycle_info_org', { orgid: body.orgId }).single()
  const cycleInfo = cycleInfoData.data
  if (!cycleInfo?.subscription_anchor_start || !cycleInfo?.subscription_anchor_end)
    throw simpleError('cannot_get_cycle_info', 'Cannot get cycle info', { cycleInfoData })

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
    const { data: versions } = await supabase
      .from('app_versions')
      .select('id, name')
      .in('id', versionNamesToResolve)
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
    supabase.from('daily_mau')
      .upsert(mau, { onConflict: 'app_id,date' })
      .eq('app_id', body.appId)
      .throwOnError(),
    supabase.from('daily_bandwidth')
      .upsert(bandwidth, { onConflict: 'app_id,date' })
      .eq('app_id', body.appId)
      .throwOnError(),
    supabase.from('daily_storage')
      .upsert(storage, { onConflict: 'app_id,date' })
      .eq('app_id', body.appId)
      .throwOnError(),
    supabase.from('daily_version')
      .upsert(resolvedVersionUsage, { onConflict: 'app_id,date,version_name' })
      .eq('app_id', body.appId)
      .throwOnError(),
  ])

  cloudlog({ requestId: c.get('requestId'), message: 'stats saved', mauLength: mau.length, bandwidthLength: bandwidth.length, storageLength: storage.length, versionUsageLength: versionUsage.length })
  // Get customer_id for the organization to queue plan processing
  const { data: orgData, error: orgError } = await supabase
    .from('orgs')
    .select('customer_id,stats_updated_at')
    .eq('id', body.orgId)
    .single()

  await supabase.from('orgs')
    .update({
      stats_updated_at: new Date().toISOString(),
      last_stats_updated_at: orgData?.stats_updated_at,
    })
    .eq('id', body.orgId)
    .throwOnError()

  if (!orgError && orgData?.customer_id) {
    // Queue plan processing for this organization
    await supabase.rpc('queue_cron_stat_org_for_org', {
      org_id: body.orgId,
      customer_id: orgData.customer_id,
    }).throwOnError()

    cloudlog({ requestId: c.get('requestId'), message: 'plan processing queued for org', orgId: body.orgId, customerId: orgData.customer_id })
  }

  return c.json({ status: 'Stats saved', mau, bandwidth, storage, versionUsage })
})
