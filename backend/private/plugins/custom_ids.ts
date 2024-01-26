import { Hono } from 'https://deno.land/x/hono/mod.ts'
import type { Context } from 'https://deno.land/x/hono/mod.ts'
import { BRES } from 'backend/_utils/hono.ts'
import { updateDeviceCustomId } from 'backend/_utils/supabase.ts'

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
    await updateDeviceCustomId(c.req.headers.get('authorization') || '', body.appId, body.deviceId, body.customId, c)
    return c.json(BRES)
  } catch (e) {
    return c.send({ status: 'Cannot post bundle', error: JSON.stringify(e) }, 500)
  }
})
