import { Hono } from 'hono/tiny'
import type { Context } from 'hono'
import { BRES, useCors } from '../../utils/hono.ts'
import { updateDeviceCustomId } from '../../utils/supabase.ts'

interface dataDevice {
  appId: string
  deviceId: string
  customId: string
}

export const app = new Hono()
app.use('/', useCors)

app.post('/', async (c: Context) => {
  try {
    const body = await c.req.json<dataDevice>()
    console.log('body', body)
    await updateDeviceCustomId(c, c.req.header('authorization') || '', body.appId, body.deviceId, body.customId)
    return c.json(BRES)
  }
  catch (e) {
    return c.json({ status: 'Cannot set custom ids', error: JSON.stringify(e) }, 500)
  }
})
