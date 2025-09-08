import type { AuthInfo, MiddlewareKeyVariables } from '../utils/hono.ts'
import type { Order } from '../utils/types.ts'
import { Hono } from 'hono/tiny'
import { middlewareV2, parseBody, simpleError, useCors } from '../utils/hono.ts'
import { cloudlog } from '../utils/loggin.ts'
import { readStats } from '../utils/stats.ts'
import { hasAppRight } from '../utils/supabase.ts'

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

app.post('/', middlewareV2(['read', 'write', 'all', 'upload']), async (c) => {
  const body = await parseBody<DataStats>(c)
  const auth = c.get('auth') as AuthInfo
  cloudlog({ requestId: c.get('requestId'), message: 'post private/stats body', body })
  if (!(await hasAppRight(c, body.appId, auth.userId, 'read'))) {
    throw simpleError('app_access_denied', 'You can\'t access this app', { app_id: body.appId })
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
