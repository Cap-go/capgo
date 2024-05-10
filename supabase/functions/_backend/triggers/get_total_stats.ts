import { Hono } from 'hono/tiny'
import type { Context } from 'hono'
import { middlewareAPISecret, useCors } from '../utils/hono.ts'
import { getSDashboardV2 } from '../utils/clickhouse.ts'

interface dataDevice {
  orgId: string
  appId?: string
  startDate: string
  endDate: string
}

export const app = new Hono()

app.use('/', useCors)

app.post('/', middlewareAPISecret, async (c: Context) => {
  try {
    const body = await c.req.json<dataDevice>()
    console.log('body', body)
    return c.json(await getSDashboardV2(c, '', body.orgId, body.startDate, body.endDate, body.appId))
  }
  catch (e) {
    return c.json({ status: 'Cannot get dashboard', error: JSON.stringify(e) }, 500)
  }
})
