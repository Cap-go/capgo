import { Hono } from 'hono/tiny'
import type { Context } from 'hono'
import { middlewareAuth, useCors } from '../utils/hono.ts'
import { hasAppRight, supabaseAdmin } from '../utils/supabase.ts'
import type { Order } from '../utils/types.ts'
import { getSStats } from '../utils/clickhouse.ts'
import { readStats } from '../utils/stats.ts'

// get_stats

interface dataStats {
  appId: string
  api?: 'v2' | null
  devicesId?: string[]
  search?: string
  order?: Order[]
  rangeStart?: number
  rangeEnd?: number
  after?: string
}

export const app = new Hono()

app.use('/', useCors)

app.post('/', middlewareAuth, async (c: Context) => {
  try {
    const body = await c.req.json<dataStats>()
    console.log('body', body)
    const apikey_string = c.req.header('capgkey')
    const authorization = apikey_string || c.req.header('authorization') || 'MISSING'
    const { data: userId, error: _errorUserId } = await supabaseAdmin(c)
      .rpc('get_user_id', { apikey: authorization, app_id: body.appId })
    if (_errorUserId) {
      console.log('_errorUserId', _errorUserId)
      return c.json({ status: 'You can\'t access this app user not found', app_id: body.appId }, 400)
    }
    if (!(await hasAppRight(c, body.appId, userId, 'read')))
      return c.json({ status: 'You can\'t access this app', app_id: body.appId }, 400)

    if (body.api === 'v2')
      return c.json(await readStats(c, body.appId, body.rangeStart as any, body.rangeEnd as any, body.devicesId, body.search))
    return c.json(await getSStats(c, body.appId, body.devicesId, body.search, body.order, body.rangeStart, body.rangeEnd, body.after, true))
  }
  catch (e) {
    return c.json({ status: 'Cannot get stats', error: JSON.stringify(e) }, 500)
  }
})
