import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { BRES, middlewareAPISecret, parseBody, simpleError } from '../utils/hono.ts'
import { cloudlog } from '../utils/loggin.ts'
import { checkPlanOrg } from '../utils/plans.ts'

interface OrgToGet {
  orgId?: string
}

export const app = new Hono<MiddlewareKeyVariables>()

app.post('/', middlewareAPISecret, async (c) => {
  const body = await parseBody<OrgToGet>(c)
  cloudlog({ requestId: c.get('requestId'), message: 'post cron plan body', body })
  if (!body.orgId)
    throw simpleError('no_orgId', 'No orgId', { body })

  await checkPlanOrg(c, body.orgId)
  return c.json(BRES)
})
