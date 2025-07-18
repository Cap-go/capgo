import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { Order } from '../utils/types.ts'
import { Hono } from 'hono/tiny'
import { parseBody, quickError, simpleError, useCors } from '../utils/hono.ts'
import { cloudlog } from '../utils/loggin.ts'
import { readStats } from '../utils/stats.ts'
import { hasAppRightApikey, supabaseAdmin, supabaseClient } from '../utils/supabase.ts'

interface DataStats {
  appId: string
  devicesId?: string[]
  search?: string
  order?: Order[]
  rangeStart?: string
  rangeEnd?: string
  limit?: number
}

export const app = new Hono<MiddlewareKeyVariables>()

app.use('/', useCors)

// No middleware applied to this route, as we allow both authorization and capgkey for CLI and webapp access
app.post('/', async (c) => {
  const body = await parseBody<DataStats>(c)
  cloudlog({ requestId: c.get('requestId'), message: 'post private/stats body', body })
  const apikey_string = c.req.header('capgkey')
  const authorization = c.req.header('authorization')
  if (apikey_string) {
    const { data: userId, error: _errorUserId } = await supabaseAdmin(c)
      .rpc('get_user_id', { apikey: apikey_string, app_id: body.appId })
    if (_errorUserId || !userId) {
      throw quickError(404, 'user_not_found', 'You can\'t access this app user not found', { app_id: body.appId })
    }
    if (!(await hasAppRightApikey(c, body.appId, userId, 'read', apikey_string))) {
      throw simpleError('app_access_denied', 'You can\'t access this app', { app_id: body.appId })
    }
  }
  else if (authorization) {
    const reqOwner = await supabaseClient(c, authorization)
      .rpc('has_app_right', { appid: body.appId, right: 'read' })
      .then(res => res.data ?? false)
    if (!reqOwner) {
      throw simpleError('app_access_denied', 'You can\'t access this app', { app_id: body.appId })
    }
  }
  else {
    throw quickError(401, 'auth_not_found', 'You can\'t access this app auth not found', { app_id: body.appId })
  }

  return c.json(await readStats(c, {
    app_id: body.appId,
    start_date: body.rangeStart,
    end_date: body.rangeEnd,
    deviceIds: body.devicesId,
    search: body.search,
    order: body.order,
    limit: body.limit,
  }))
})
