import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { Order } from '../utils/types.ts'
import { Hono } from 'hono/tiny'
import { middlewareAuth, quickError, simpleError, useCors } from '../utils/hono.ts'
import { cloudlog } from '../utils/loggin.ts'
import { countDevices, readDevices } from '../utils/stats.ts'
import { hasAppRightApikey, supabaseAdmin, supabaseClient } from '../utils/supabase.ts'

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

app.post('/', middlewareAuth, async (c) => {
  const body = await c.req.json<DataDevice>()
    .catch((e) => {
      throw simpleError('invalid_json_parse_body', 'Invalid JSON body', { e })
    })
  cloudlog({ requestId: c.get('requestId'), message: 'post devices body', body })
  const devicesIds = body.devicesId ?? body.deviceIds ?? []
  const apikey_string = c.req.header('capgkey')
  const authorization = c.req.header('authorization')
  if (apikey_string) {
    const { data: userId, error: _errorUserId } = await supabaseAdmin(c)
      .rpc('get_user_id', { apikey: apikey_string, app_id: body.appId })
    if (_errorUserId || !userId)
      throw quickError(404, 'user_not_found', 'You can\'t access this app user not found', { app_id: body.appId })
    if (!(await hasAppRightApikey(c, body.appId, userId, 'read', apikey_string)))
      throw simpleError('app_access_denied', 'You can\'t access this app', { app_id: body.appId })
  }
  else if (authorization) {
    const reqOwner = await supabaseClient(c, authorization)
      .rpc('has_app_right', { appid: body.appId, right: 'read' })
      .then(res => res.data ?? false)
    if (!reqOwner)
      throw simpleError('app_access_denied', 'You can\'t access this app', { app_id: body.appId })
  }
  else {
    throw quickError(401, 'auth_not_found', 'You can\'t access this app auth not found', { app_id: body.appId })
  }
  if (body.count)
    return c.json({ count: await countDevices(c, body.appId) })
  return c.json(await readDevices(c, body.appId, body.rangeStart as any, body.rangeEnd as any, body.versionId as any, devicesIds, body.search, body.order))
})
