
import { Hono } from 'hono'
import type { Context } from 'hono'
import { getSDevice } from '../../_utils/supabase.ts'
import { Order } from '../../_utils/types.ts'

interface dataDevice {
  appId: string
  versionId?: string
  deviceIds?: string[]
  search?: string
  order?: Order[]
  rangeStart?: number
  rangeEnd?: number
}

export const app = new Hono()

app.post('/', async (c: Context) => {
  try {
    const body = await c.req.json<dataDevice>()
    console.log('body', body)
    return c.json(await getSDevice(c, c.req.header('authorization') || 'MISSING', body.appId, body.versionId, body.deviceIds, body.search, body.order, body.rangeStart, body.rangeEnd, true))
  } catch (e) {
    return c.json({ status: 'Cannot get devices', error: JSON.stringify(e) }, 500) 
  }
})
