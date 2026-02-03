import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { BRES, middlewareAPISecret, parseBody, simpleError } from '../utils/hono.ts'
import { cloudlog } from '../utils/logging.ts'
import { closeClient, getDrizzleClient, getPgClient } from '../utils/pg.ts'
import { checkPlanStatusOnly } from '../utils/plans.ts'
import { supabaseAdmin } from '../utils/supabase.ts'

interface OrgToGet {
  orgId?: string
  customerId?: string
}

export const app = new Hono<MiddlewareKeyVariables>()

app.post('/', middlewareAPISecret, async (c) => {
  const body = await parseBody<OrgToGet>(c)
  cloudlog({ requestId: c.get('requestId'), message: 'post cron_stat_org body', body })
  if (!body.orgId)
    throw simpleError('no_orgId', 'No orgId', { body })

  const pgClient = getPgClient(c, true)
  const drizzleClient = getDrizzleClient(pgClient)
  try {
    let planStatusCalculated = false
    try {
      await checkPlanStatusOnly(c, body.orgId, drizzleClient)
      planStatusCalculated = true
    }
    catch (error) {
      cloudlog({ requestId: c.get('requestId'), message: 'checkPlanStatusOnly failed', orgId: body.orgId, error })
    }

    // Update plan_calculated_at timestamp if we have customerId
    if (body.customerId && planStatusCalculated) {
      try {
        const supabase = supabaseAdmin(c)
        await supabase
          .from('stripe_info')
          .update({ plan_calculated_at: new Date().toISOString() })
          .eq('customer_id', body.customerId)
          .throwOnError()

        cloudlog({ requestId: c.get('requestId'), message: 'plan calculated timestamp updated', customerId: body.customerId })
      }
      catch (error) {
        cloudlog({ requestId: c.get('requestId'), message: 'plan calculated timestamp update failed', customerId: body.customerId, error })
      }
    }
    else if (body.customerId) {
      cloudlog({ requestId: c.get('requestId'), message: 'plan calculated timestamp skipped', customerId: body.customerId })
    }

    return c.json(BRES)
  }
  finally {
    closeClient(c, pgClient)
  }
})
