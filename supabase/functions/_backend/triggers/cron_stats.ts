import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { middlewareAPISecret, useCors } from '../utils/hono.ts'
import { readStatsBandwidth, readStatsMau, readStatsStorage, readStatsVersion } from '../utils/stats.ts'
import { supabaseAdmin } from '../utils/supabase.ts'

interface dataToGet {
  appId?: string
  orgId?: string
  todayOnly?: boolean
}

export const app = new Hono<MiddlewareKeyVariables>()

app.use('/', useCors)

app.post('/', middlewareAPISecret, async (c) => {
  try {
    const body = await c.req.json<dataToGet>()
    console.log({ requestId: c.get('requestId'), message: 'postcron stats body', body })
    if (!body.appId || !body.orgId)
      return c.json({ status: 'No appId' }, 400)

    const supabase = supabaseAdmin(c as any)

    // get the period of the billing of the organization
    const cycleInfoData = await supabase.rpc('get_cycle_info_org', { orgid: body.orgId }).single()
    const cycleInfo = cycleInfoData.data
    if (!cycleInfo || !cycleInfo.subscription_anchor_start || !cycleInfo.subscription_anchor_end)
      return c.json({ status: 'Cannot get cycle info' }, 400)

    console.log({ requestId: c.get('requestId'), message: 'cycleInfo', cycleInfo })
    const startDate = cycleInfo.subscription_anchor_start
    const endDate = cycleInfo.subscription_anchor_end

    // get mau
    let mau = await readStatsMau(c as any, body.appId, startDate, endDate)
    // get bandwidth
    let bandwidth = await readStatsBandwidth(c as any, body.appId, startDate, endDate)
    // get storage
    let storage = await readStatsStorage(c as any, body.appId, startDate, endDate)
    let versionUsage = await readStatsVersion(c as any, body.appId, startDate, endDate)

    if (body.todayOnly) {
      // take only the last day
      mau = mau.slice(-1)
      bandwidth = bandwidth.slice(-1)
      storage = storage.slice(-1)
      versionUsage = versionUsage.slice(-1)
    }

    console.log({ requestId: c.get('requestId'), message: 'mau', mauLength: mau.length, mauCount: mau.reduce((acc, curr) => acc + curr.mau, 0), mau: JSON.stringify(mau) })
    console.log({ requestId: c.get('requestId'), message: 'bandwidth', bandwidthLength: bandwidth.length, bandwidthCount: bandwidth.reduce((acc, curr) => acc + curr.bandwidth, 0), bandwidth: JSON.stringify(bandwidth) })
    console.log({ requestId: c.get('requestId'), message: 'storage', storageLength: storage.length, storageCount: storage.reduce((acc, curr) => acc + curr.storage, 0), storage: JSON.stringify(storage) })
    console.log({ requestId: c.get('requestId'), message: 'versionUsage', versionUsageLength: versionUsage.length, versionUsageCount: versionUsage.reduce((acc, curr) => acc + curr.get + curr.fail + curr.install + curr.uninstall, 0), versionUsage: JSON.stringify(versionUsage) })

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

    console.log({ requestId: c.get('requestId'), message: 'stats saved', mauLength: mau.length, bandwidthLength: bandwidth.length, storageLength: storage.length, versionUsageLength: versionUsage.length })
    return c.json({ status: 'Stats saved', mau, bandwidth, storage, versionUsage })
  }
  catch (e) {
    console.error({ requestId: c.get('requestId'), message: 'Error getting stats', e })
    return c.json({ status: 'Cannot get stats', error: JSON.stringify(e) }, 500)
  }
})
