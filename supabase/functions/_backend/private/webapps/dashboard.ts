// @transform node import 'hono' to deno 'npm:hono'
import { Hono } from 'hono'
import type { Context } from 'hono'
import { getSDashboard } from '../../_utils/supabase.ts'

interface dataDevice {
  userId: string
  appId?: string
  startDate: string
  endDate: string
}

export const app = new Hono()

app.post('/', async (c: Context) => {
  try {
    const body = await c.req.json<dataDevice>()
    console.log('body', body)
    return c.json(await getSDashboard(c, c.req.header('authorization') || 'MISSING', body.userId, body.startDate, body.endDate, body.appId))
  } catch (e) {
    return c.json({ status: 'Cannot get dashboard', error: JSON.stringify(e) }, 500) 
  }
})
