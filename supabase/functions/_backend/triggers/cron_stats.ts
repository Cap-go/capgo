import { Hono } from 'hono/tiny'
import type { Context } from 'hono'
import { middlewareAPISecret, useCors } from '../utils/hono.ts'
import { supabaseAdmin } from '../utils/supabase.ts'
import { readStatsBandwidth, readStatsMau, readStatsStorage, readStatsVersion } from '../utils/stats.ts'

interface dataToGet {
  appId?: string
  orgId?: string
  todayOnly?: boolean
}

export const app = new Hono()

app.use('/', useCors)

app.post('/', middlewareAPISecret, async (c: Context) => {
  try {
    const body = await c.req.json<dataToGet>()
    console.log('body', body)
    if (!body.appId || !body.orgId)
      return c.json({ status: 'No appId' }, 400)

    const supabase = supabaseAdmin(c)

    let endDate = new Date().toISOString()
    // startDate = yesterday
    let startDate = new Date(new Date().setDate(new Date().getDate() - 1)).toISOString()

    if (!body.todayOnly) {
      // get the period of the billing of the organization
      const cycleInfoData = await supabase.rpc('get_cycle_info_org', { orgid: body.orgId }).single()
      const cycleInfo = cycleInfoData.data
      if (!cycleInfo || !cycleInfo.subscription_anchor_start || !cycleInfo.subscription_anchor_end)
        return c.json({ status: 'Cannot get cycle info' }, 400)

      console.log('cycleInfo', cycleInfo)
      startDate = cycleInfo.subscription_anchor_start
      endDate = cycleInfo.subscription_anchor_end
    }

    // get mau
    const mau = await readStatsMau(c, body.appId, startDate, endDate)
    // get bandwidth
    const bandwidth = await readStatsBandwidth(c, body.appId, startDate, endDate)
    // get storage
    const storage = await readStatsStorage(c, body.appId, startDate, endDate)
    const versionUsage = await readStatsVersion(c, body.appId, startDate, endDate)

    // save to daily_mau, daily_bandwidth and daily_storage
    await Promise.all([
      supabase.from('daily_mau')
        .upsert(mau)
        .eq('app_id', body.appId),
      supabase.from('daily_bandwidth')
        .upsert(bandwidth)
        .eq('app_id', body.appId),
      supabase.from('daily_storage')
        .upsert(storage)
        .eq('app_id', body.appId),
      supabase.from('daily_version')
        .upsert(versionUsage)
        .eq('app_id', body.appId),
    ])

    console.log('stats saved')
    return c.json({ status: 'Stats saved' })
  }
  catch (e) {
    return c.json({ status: 'Cannot get stats', error: JSON.stringify(e) }, 500)
  }
})
