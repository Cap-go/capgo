import { Hono } from 'hono/tiny'
import type { Context } from 'hono'
import { middlewareAPISecret, useCors } from '../utils/hono.ts'
import { supabaseAdmin } from '../utils/supabase.ts'
import { readStatsBandwidth, readStatsMau } from '../utils/stats.ts'

interface dataToGet {
  appId?: string
  orgId?: string
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
    // get the period of the billing of the organization
    const cycleInfoData = await supabase.rpc('get_cycle_info_org', { orgid: body.orgId }).single()
    const cycleInfo = cycleInfoData.data
    if (!cycleInfo || !cycleInfo.subscription_anchor_start || !cycleInfo.subscription_anchor_end)
      return c.json({ status: 'Cannot get cycle info' }, 400)

    console.log('cycleInfo', cycleInfo)
    // get mau
    const mau = await readStatsMau(c, body.appId, cycleInfo.subscription_anchor_start, cycleInfo.subscription_anchor_end)

    // get bandwidth
    const bandwidth = await readStatsBandwidth(c, body.appId, cycleInfo.subscription_anchor_start, cycleInfo.subscription_anchor_end)
    // save to daily_mau and daily_bandwidth
    await supabase.from('daily_mau')
      .upsert(mau)
      .eq('app_id', body.appId)

    await supabase.from('daily_bandwidth')
      .upsert(bandwidth)
      .eq('app_id', body.appId)

    console.log('stats saved')
    return c.json({ status: 'Stats saved' })
  }
  catch (e) {
    return c.json({ status: 'Cannot get stats', error: JSON.stringify(e) }, 500)
  }
})
