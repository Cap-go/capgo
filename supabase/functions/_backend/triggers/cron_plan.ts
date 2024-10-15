import type { Context } from '@hono/hono'
import { Hono } from 'hono/tiny'
import { BRES, middlewareAPISecret } from '../utils/hono.ts'
import { checkPlanOrg } from '../utils/plans.ts'

interface orgToGet {
  orgId?: string
}

export const app = new Hono()

app.post('/', middlewareAPISecret, async (c: Context) => {
  try {
    const body = await c.req.json<orgToGet>()
    console.log({ requestId: c.get('requestId'), context: 'post cron plan body', body })
    if (!body.orgId)
      return c.json({ status: 'No orgId' }, 400)

    await checkPlanOrg(c, body.orgId)
    return c.json(BRES)
  }
  catch (e) {
    return c.json({ status: 'Cannot get stats', error: JSON.stringify(e) }, 500)
  }
})
