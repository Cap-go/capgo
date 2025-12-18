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
    return simpleError('no_appId', 'No appId', { body })
  if (!body.orgId)
    return simpleError('no_orgId', 'No orgId', { body })

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
    return simpleError('cannot_get_cycle_info', 'Cannot get cycle info', { cycleInfoData })

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

  cloudlog({ requestId: c.get('requestId'), message: 'mau', mauLength: mau.length, mauCount: mau.reduce((acc, curr) => acc + curr.mau, 0), mau: JSON.stringify(mau) })
  cloudlog({ requestId: c.get('requestId'), message: 'bandwidth', bandwidthLength: bandwidth.length, bandwidthCount: bandwidth.reduce((acc, curr) => acc + curr.bandwidth, 0), bandwidth: JSON.stringify(bandwidth) })
  cloudlog({ requestId: c.get('requestId'), message: 'storage', storageLength: storage.length, storageCount: storage.reduce((acc, curr) => acc + curr.storage, 0), storage: JSON.stringify(storage) })
  cloudlog({ requestId: c.get('requestId'), message: 'versionUsage', versionUsageLength: versionUsage.length, versionUsageCount: versionUsage.reduce((acc, curr) => acc + curr.get + curr.fail + curr.install + curr.uninstall, 0), versionUsage: JSON.stringify(versionUsage) })

  // save to daily_mau, daily_bandwidth and daily_storage
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
      .upsert(versionUsage, { onConflict: 'app_id,date,version_id' })
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
