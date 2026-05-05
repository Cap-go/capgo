import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { Database } from '../utils/supabase.types.ts'
import { Hono } from 'hono/tiny'
import { BRES, middlewareAPISecret, simpleError, triggerValidator } from '../utils/hono.ts'
import { cloudlog } from '../utils/logging.ts'
import { groupIdentifyPosthog } from '../utils/posthog.ts'
import { createStripeCustomer, finalizePendingStripeCustomer } from '../utils/supabase.ts'
import { sendEventToTracking } from '../utils/tracking.ts'
import { backgroundTask } from '../utils/utils.ts'

export const app = new Hono<MiddlewareKeyVariables>()

app.post('/', middlewareAPISecret, triggerValidator('orgs', 'INSERT'), async (c) => {
  const record = c.get('webhookBody') as Database['public']['Tables']['orgs']['Row']
  cloudlog({ requestId: c.get('requestId'), message: 'record', record })

  if (!record.id) {
    cloudlog({ requestId: c.get('requestId'), message: 'No id' })
    throw simpleError('no_id', 'No id', { record })
  }

  if (!record.customer_id) {
    await createStripeCustomer(c, record)
  }
  else if (record.customer_id.startsWith('pending_')) {
    await finalizePendingStripeCustomer(c, record)
  }

  await backgroundTask(c, groupIdentifyPosthog(c, {
    groupType: 'organization',
    groupKey: record.id,
    properties: {
      name: record.name,
      management_email: record.management_email,
      customer_id: record.customer_id,
      created_by: record.created_by,
      created_at: record.created_at,
      website: record.website,
    },
  }))

  await sendEventToTracking(c, {
    bento: {
      cron: '* * * * *',
      data: {
        org_id: record.id,
        org_name: record.name,
      },
      event: 'org:created',
      preferenceKey: 'onboarding',
      uniqId: `org:created:${record.id}`,
    },
    channel: 'org-created',
    event: 'Org Created',
    icon: '🎉',
    sentToBento: true,
    user_id: record.id,
    groups: { organization: record.id },
    notify: false,
  })

  return c.json(BRES)
})
