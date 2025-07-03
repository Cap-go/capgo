import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { Database } from '../utils/supabase.types.ts'
import { Hono } from 'hono/tiny'
import { trackBentoEvent } from '../utils/bento.ts'
import { BRES, middlewareAPISecret, triggerValidator } from '../utils/hono.ts'
import { cloudlog, cloudlogErr } from '../utils/loggin.ts'
import { logsnag } from '../utils/logsnag.ts'
import { createStripeCustomer } from '../utils/supabase.ts'
import { backgroundTask } from '../utils/utils.ts'

export const app = new Hono<MiddlewareKeyVariables>()

app.post('/', middlewareAPISecret, triggerValidator('orgs', 'INSERT'), async (c) => {
  const record = c.get('webhookBody') as Database['public']['Tables']['orgs']['Row']
  cloudlog({ requestId: c.get('requestId'), message: 'record', record })

  if (!record.id) {
    cloudlog({ requestId: c.get('requestId'), message: 'No id' })
    return c.json(BRES)
  }

  if (!record.customer_id)
    await createStripeCustomer(c, record as any)

  const LogSnag = logsnag(c)
  await backgroundTask(c, LogSnag.track({
    channel: 'org-created',
    event: 'Org Created',
    icon: '🎉',
    user_id: record.id,
    notify: false,
  }))
  await backgroundTask(c, trackBentoEvent(c, record.management_email, {
    org_id: record.id,
    org_name: record.name,
  }, 'org:created'))

  return c.json(BRES)
})
