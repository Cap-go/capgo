import { Hono } from 'hono'
import type { Context } from 'hono'
import { getSDashboard } from '../../utils/supabase.ts'
import { useCors } from '../../utils/hono.ts'

interface dataDevice {
  userId: string
  appId?: string
  startDate: string
  endDate: string
}

export const app = new Hono()

app.use('/', useCors)

app.post('/', async (c: Context) => {
  try {
    const body = await c.req.json<dataDevice>()
    console.log('body', body)
    return c.json(await getSDashboard(c, c.req.header('authorization') || 'MISSING', body.userId, body.startDate, body.endDate, body.appId))
  }
  catch (e) {
    return c.json({ status: 'Cannot get dashboard', error: JSON.stringify(e) }, 500)
  }
})
