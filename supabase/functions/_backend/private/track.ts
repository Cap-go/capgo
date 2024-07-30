import { Hono } from 'hono/tiny'
import type { Context } from '@hono/hono'
import { useCors } from '../utils/hono.ts'
import { trackEvent } from '../utils/tracking.ts'

export const app = new Hono()

interface dataTrack {
  orgId: string
  event: string
  data: any
}

app.use('/', useCors)

app.get('/', async (c: Context) => {
  try {
    const body = await c.req.json<dataTrack>()
    await trackEvent(c, body.orgId, body.data, body.event)
    return c.json({ status: 'ok' })
  }
  catch (e) {
    return c.json({ status: 'Cannot get config', error: JSON.stringify(e) }, 500)
  }
})
