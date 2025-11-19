import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { Database } from '../utils/supabase.types.ts'
import { Hono } from 'hono/tiny'
import { BRES, middlewareAPISecret, simpleError, triggerValidator } from '../utils/hono.ts'
import { cloudlog } from '../utils/logging.ts'
import { createApiKey } from '../utils/supabase.ts'
import { syncUserPreferenceTags } from '../utils/user_preferences.ts'

export const app = new Hono<MiddlewareKeyVariables>()

app.post('/', middlewareAPISecret, triggerValidator('users', 'UPDATE'), async (c) => {
  const record = c.get('webhookBody') as Database['public']['Tables']['users']['Row']
  const oldRecord = c.get('oldRecord') as Database['public']['Tables']['users']['Row'] | undefined
  cloudlog({ requestId: c.get('requestId'), message: 'record', record })
  if (!record.email) {
    cloudlog({ requestId: c.get('requestId'), message: 'No email' })
    return c.json(BRES)
  }
  if (!record.id) {
    cloudlog({ requestId: c.get('requestId'), message: 'No id' })
    return simpleError('no_id', 'No id', { record })
  }
  await createApiKey(c, record.id)
  await syncUserPreferenceTags(c, record.email, record, oldRecord?.email)
  return c.json(BRES)
})
