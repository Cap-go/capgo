import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { BRES, middlewareAPISecret, parseBody, simpleError } from '../utils/hono.ts'
import { cloudlog } from '../utils/logging.ts'
import { closeClient, getDrizzleClient, getPgClient } from '../utils/pg.ts'
import { syncSubscriptionAndEvents } from '../utils/plans.ts'

interface OrgToGet {
  orgId?: string
  customerId?: string
}

export const app = new Hono<MiddlewareKeyVariables>()

app.post('/', middlewareAPISecret, async (c) => {
  const body = await parseBody<OrgToGet>(c)
  cloudlog({ requestId: c.get('requestId'), message: 'post cron_sync_sub body', body })
  if (!body.orgId)
    throw simpleError('no_orgId', 'No orgId', { body })

  const pgClient = getPgClient(c, true)
  const drizzleClient = getDrizzleClient(pgClient)
  try {
    await syncSubscriptionAndEvents(c, body.orgId, drizzleClient)
    return c.json(BRES)
  }
  finally {
    closeClient(c, pgClient)
  }
})
