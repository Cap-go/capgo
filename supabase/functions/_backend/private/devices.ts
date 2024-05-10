import { Hono } from 'hono/tiny'
import type { Context } from 'hono'
import type { Order } from '../utils/types.ts'
import { middlewareAuth, useCors } from '../utils/hono.ts'
import { getSDevice } from '../utils/clickhouse.ts'
import { readDevices } from '../utils/stats.ts'
import { hasAppRight, supabaseAdmin } from '../utils/supabase.ts'

interface dataDevice {
  appId: string
  api?: 'v2' | null
  versionId?: string
  devicesId?: string[]
  deviceIds?: string[] // TODO: remove when migration is done
  search?: string
  order?: Order[]
  rangeStart?: number
  rangeEnd?: number
}

export const app = new Hono()

app.use('/', useCors)

app.post('/', middlewareAuth, async (c: Context) => {
  try {
    const body = await c.req.json<dataDevice>()
    console.log('body', body)
    const devicesIds = body.devicesId || body.deviceIds || []
    const apikey_string = c.req.header('capgkey')
    const authorization = apikey_string || c.req.header('authorization') || 'MISSING'
    const { data: userId, error: _errorUserId } = await supabaseAdmin(c)
      .rpc('get_user_id', { apikey: authorization, app_id: body.appId })
    if (_errorUserId) {
      console.log('_errorUserId', _errorUserId)
      return c.json({ status: 'You can\'t access this app', app_id: body.appId }, 400)
    }
    if (!(await hasAppRight(c, body.appId, userId, 'read')))
      return c.json({ status: 'You can\'t access this app', app_id: body.appId }, 400)

    if (body.api === 'v2')
      return c.json(await readDevices(c, body.appId, body.rangeStart as any, body.rangeEnd as any, body.versionId as any, devicesIds, body.search))

    return c.json(await getSDevice(c, body.appId, body.versionId, devicesIds, body.search, body.order, body.rangeStart, body.rangeEnd, true))
  }
  catch (e) {
    return c.json({ status: 'Cannot get devices', error: JSON.stringify(e) }, 500)
  }
})
