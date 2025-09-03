import type { AuthInfo, MiddlewareKeyVariables } from '../utils/hono.ts'
import type { Order } from '../utils/types.ts'
import { Hono } from 'hono/tiny'
import { middlewareV2, parseBody, simpleError, useCors } from '../utils/hono.ts'
import { cloudlog } from '../utils/loggin.ts'
import { countDevices, readDevices } from '../utils/stats.ts'
import { hasAppRight } from '../utils/supabase.ts'

interface DataDevice {
  appId: string
  count?: boolean
  versionId?: string
  devicesId?: string[]
  deviceIds?: string[] // TODO: remove when migration is done
  search?: string
  order?: Order[]
  rangeStart?: number
  rangeEnd?: number
}

export const app = new Hono<MiddlewareKeyVariables>()

app.use('/', useCors)

app.post('/', middlewareV2(['read', 'write', 'all', 'upload']), async (c) => {
  const body = await parseBody<DataDevice>(c)
  cloudlog({ requestId: c.get('requestId'), message: 'post devices body', body })
  const auth = c.get('auth') as AuthInfo
  if (!(await hasAppRight(c, body.appId, auth.userId, 'read'))) {
    throw simpleError('app_access_denied', 'You can\'t access this app', { app_id: body.appId })
  }
  const devicesIds = body.devicesId ?? body.deviceIds ?? []
  if (body.count)
    return c.json({ count: await countDevices(c, body.appId) })
  return c.json(await readDevices(c, {
    app_id: body.appId,
    rangeStart: body.rangeStart,
    rangeEnd: body.rangeEnd,
    version_id: body.versionId,
    deviceIds: devicesIds,
    search: body.search,
    order: body.order,
  }))
})
