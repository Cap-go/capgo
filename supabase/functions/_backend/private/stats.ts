import type { Context } from '@hono/hono'
import type { Order } from '../utils/types.ts'
import { Hono } from 'hono/tiny'
import { useCors } from '../utils/hono.ts'
import { readStats } from '../utils/stats.ts'
import { hasAppRight, supabaseAdmin, supabaseClient } from '../utils/supabase.ts'

// get_stats

interface dataStats {
  appId: string
  devicesId?: string[]
  search?: string
  order?: Order[]
  rangeStart?: string
  rangeEnd?: string
  limit?: number
}

export const app = new Hono()

app.use('/', useCors)

// No middleware applied to this route, as we allow both authorization and capgkey for CLI and webapp access
app.post('/', async (c: Context) => {
  try {
    const body = await c.req.json<dataStats>()
    console.log({ requestId: c.get('requestId'), context: 'post private/stats body', body })
    const apikey_string = c.req.header('capgkey')
    const authorization = c.req.header('authorization')
    if (apikey_string) {
      const { data: userId, error: _errorUserId } = await supabaseAdmin(c)
        .rpc('get_user_id', { apikey: apikey_string, app_id: body.appId })
      if (_errorUserId || !userId) {
        console.log({ requestId: c.get('requestId'), context: 'error', error: _errorUserId, userId })
        return c.json({ status: 'You can\'t access this app user not found', app_id: body.appId }, 400)
      }
      if (!(await hasAppRight(c, body.appId, userId, 'read'))) {
        console.log({ requestId: c.get('requestId'), context: 'error hasAppRight not found', userId })
        return c.json({ status: 'You can\'t access this app', app_id: body.appId }, 400)
      }
    }
    else if (authorization) {
      const reqOwner = await supabaseClient(c, authorization)
        .rpc('has_app_right', { appid: body.appId, right: 'read' })
        .then(res => res.data || false)
      if (!reqOwner) {
        console.log({ requestId: c.get('requestId'), context: 'error reqOwner', reqOwner })
        return c.json({ status: 'You can\'t access this app', app_id: body.appId }, 400)
      }
    }
    else {
      console.log({ requestId: c.get('requestId'), context: 'error no auth', auth: authorization })
      return c.json({ status: 'You can\'t access this app auth not found', app_id: body.appId }, 400)
    }

    return c.json(await readStats(c, body.appId, body.rangeStart, body.rangeEnd, body.devicesId, body.search, body.order, body.limit))
  }
  catch (e) {
    return c.json({ status: 'Cannot get stats', error: JSON.stringify(e) }, 500)
  }
})
