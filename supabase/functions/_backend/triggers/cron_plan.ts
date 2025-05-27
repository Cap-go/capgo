import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { BRES, middlewareAPISecret } from '../utils/hono.ts'
import { cloudlog } from '../utils/loggin.ts'
import { checkPlanOrg } from '../utils/plans.ts'

interface orgToGet {
  orgId?: string
}

export const app = new Hono<MiddlewareKeyVariables>()

app.post('/', middlewareAPISecret, async (c) => {
  try {
    const body = await c.req.json<orgToGet>()
    cloudlog({ requestId: c.get('requestId'), message: 'post cron plan body', body })
    if (!body.orgId)
      return c.json({ status: 'No orgId' }, 400)

    await checkPlanOrg(c as any, body.orgId)
    return c.json(BRES)
  }
  catch (e) {
    return c.json({ status: 'Cannot get stats', error: JSON.stringify(e) }, 500)
  }
})
