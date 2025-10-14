import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { BRES, middlewareAPISecret, parseBody, simpleError } from '../utils/hono.ts'
import { cloudlog } from '../utils/loggin.ts'
import { checkPlanOrg } from '../utils/plans.ts'
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

  await checkPlanOrg(c, body.orgId)

  // Update plan_calculated_at timestamp if we have customerId
  if (body.customerId) {
    const supabase = supabaseAdmin(c)
    await supabase
      .from('stripe_info')
      .update({ plan_calculated_at: new Date().toISOString() })
      .eq('customer_id', body.customerId)
      .throwOnError()

    cloudlog({ requestId: c.get('requestId'), message: 'plan calculated timestamp updated', customerId: body.customerId })
  }

  return c.json(BRES)
})
