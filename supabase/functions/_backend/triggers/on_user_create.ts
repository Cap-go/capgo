import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { Database } from '../utils/supabase.types.ts'
import { Hono } from 'hono/tiny'
import { BRES, middlewareAPISecret, triggerValidator } from '../utils/hono.ts'
import { cloudlog } from '../utils/logging.ts'
import { logsnag } from '../utils/logsnag.ts'
import { sanitizeOptionalText, sanitizeText } from '../utils/sanitize.ts'
import { createApiKey, supabaseAdmin } from '../utils/supabase.ts'
import { syncUserPreferenceTags } from '../utils/user_preferences.ts'

export const app = new Hono<MiddlewareKeyVariables>()

app.post('/', middlewareAPISecret, triggerValidator('users', 'INSERT'), async (c) => {
  const record = c.get('webhookBody') as Database['public']['Tables']['users']['Row']
  cloudlog({ requestId: c.get('requestId'), message: 'record', record })
  const sanitizedEmail = sanitizeText(record.email)
  const sanitizedFirstName = sanitizeOptionalText(record.first_name)
  const sanitizedLastName = sanitizeOptionalText(record.last_name)
  const sanitizedCountry = sanitizeOptionalText(record.country)
  const updateFields: Partial<Database['public']['Tables']['users']['Update']> = {}
  if (sanitizedEmail !== record.email)
    updateFields.email = sanitizedEmail
  if (sanitizedFirstName !== record.first_name)
    updateFields.first_name = sanitizedFirstName
  if (sanitizedLastName !== record.last_name)
    updateFields.last_name = sanitizedLastName
  if (sanitizedCountry !== record.country)
    updateFields.country = sanitizedCountry

  if (Object.keys(updateFields).length > 0) {
    const { error: updateError } = await supabaseAdmin(c)
      .from('users')
      .update(updateFields)
      .eq('id', record.id)
    if (updateError) {
      cloudlog({ requestId: c.get('requestId'), message: 'Failed to sanitize user fields', updateError })
    }
    // Let the update trigger handle downstream work with sanitized fields.
    return c.json(BRES)
  }

  await createApiKey(c, record.id)
  cloudlog({ requestId: c.get('requestId'), message: 'createCustomer stripe' })
  await syncUserPreferenceTags(c, sanitizedEmail, record)
  const LogSnag = logsnag(c)
  await LogSnag.track({
    channel: 'user-register',
    event: 'User Joined',
    icon: '🎉',
    user_id: record.id,
    notify: false,
  }).catch()
  return c.json(BRES)
})
