import { Hono } from 'hono/tiny'
import type { Context } from '@hono/hono'
import { middlewareAuth, useCors } from '../utils/hono.ts'
import { countDevices, readDevices } from '../utils/stats.ts'
import { hasAppRight, supabaseAdmin, supabaseClient } from '../utils/supabase.ts'
import type { Order } from '../utils/types.ts'

interface dataDevice {
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

export const app = new Hono()

app.use('/', useCors)

app.post('/', middlewareAuth, async (c: Context) => {
  try {
    const body = await c.req.json<dataDevice>()
    console.log(c.get('requestId'), 'post devices body', body)
    const devicesIds = body.devicesId || body.deviceIds || []
    const apikey_string = c.req.header('capgkey')
    const authorization = c.req.header('authorization')
    if (apikey_string) {
      const { data: userId, error: _errorUserId } = await supabaseAdmin(c)
        .rpc('get_user_id', { apikey: apikey_string, app_id: body.appId })
      if (_errorUserId || !userId)
        return c.json({ status: 'You can\'t access this app user not found', app_id: body.appId }, 400)
      if (!(await hasAppRight(c, body.appId, userId, 'read')))
        return c.json({ status: 'You can\'t access this app', app_id: body.appId }, 400)
    }
    else if (authorization) {
      const reqOwner = await supabaseClient(c, authorization)
        .rpc('has_app_right', { appid: body.appId, right: 'read' })
        .then(res => res.data || false)
      if (!reqOwner)
        return c.json({ status: 'You can\'t access this app', app_id: body.appId }, 400)
    }
    else {
      return c.json({ status: 'You can\'t access this app auth not found', app_id: body.appId }, 400)
    }
    if (body.count)
      return c.json({ count: await countDevices(c, body.appId) })
    return c.json(await readDevices(c, body.appId, body.rangeStart as any, body.rangeEnd as any, body.versionId as any, devicesIds, body.search, body.order))
  }
  catch (e) {
    return c.json({ status: 'Cannot get devices', error: JSON.stringify(e) }, 500)
  }
})
