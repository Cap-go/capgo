import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { Database } from '../utils/supabase.types.ts'
import { Hono } from 'hono/tiny'
import { BRES, middlewareAPISecret, triggerValidator } from '../utils/hono.ts'
import { cloudlog } from '../utils/logging.ts'
import { logsnag } from '../utils/logsnag.ts'
import { createApiKey } from '../utils/supabase.ts'
import { syncUserPreferenceTags } from '../utils/user_preferences.ts'

export const app = new Hono<MiddlewareKeyVariables>()

app.post('/', middlewareAPISecret, triggerValidator('users', 'INSERT'), async (c) => {
  const record = c.get('webhookBody') as Database['public']['Tables']['users']['Row']
  cloudlog({ requestId: c.get('requestId'), message: 'record', record })
  await createApiKey(c, record.id)
  cloudlog({ requestId: c.get('requestId'), message: 'createCustomer stripe' })
  await syncUserPreferenceTags(c, record.email, record)
  // "User Joined" should represent a self-signup (technical user expected to onboard),
  // not an account created by accepting an org invite.
  if (!record.created_via_invite) {
    const LogSnag = logsnag(c)
    await LogSnag.track({
      channel: 'user-register',
      event: 'User Joined',
      icon: '🎉',
      user_id: record.id,
      notify: false,
    }).catch()
  }
  return c.json(BRES)
})
