import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { Order } from '../utils/types.ts'
import { Hono } from 'hono/tiny'
import { parseBody, simpleError, useCors } from '../utils/hono.ts'
import { middlewareV2 } from '../utils/hono_middleware.ts'
import { cloudlog } from '../utils/logging.ts'
import { checkPermission } from '../utils/rbac.ts'
import { readStats } from '../utils/stats.ts'

interface DataStats {
  appId: string
  devicesId?: string[]
  search?: string
  order?: Order[]
  rangeStart?: string
  rangeEnd?: string
  limit?: number
  actions?: string[]
}

export const app = new Hono<MiddlewareKeyVariables>()

app.use('/', useCors)

app.post('/', middlewareV2(['read', 'write', 'all', 'upload']), async (c) => {
  const body = await parseBody<DataStats>(c)
  cloudlog({ requestId: c.get('requestId'), message: 'post private/stats body', body })
  if (!(await checkPermission(c, 'app.read_logs', { appId: body.appId }))) {
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
    actions: body.actions,
  }))
})
