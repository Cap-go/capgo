// @transform node import 'hono' to deno 'npm:hono'
import { Hono } from 'hono'
import type { Context } from 'hono'
import { BRES } from '../../_utils/hono.ts'
import { updateDeviceCustomId } from '../../_utils/supabase.ts'

interface dataDevice {
  appId: string
  deviceId: string
  customId: string
}

export const app = new Hono()

app.post('/', async (c: Context) => {
  try {
    const body = await c.req.json<dataDevice>()
    console.log('body', body)
    await updateDeviceCustomId(c, c.req.header('authorization') || '', body.appId, body.deviceId, body.customId)
    return c.json(BRES)
  } catch (e) {
    return c.json({ status: 'Cannot post bundle', error: JSON.stringify(e) }, 500)
  }
})
