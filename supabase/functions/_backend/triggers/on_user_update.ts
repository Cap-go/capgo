import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { Database } from '../utils/supabase.types.ts'
import { Hono } from 'hono/tiny'
import { BRES, middlewareAPISecret, simpleError, triggerValidator } from '../utils/hono.ts'
import { cloudlog } from '../utils/logging.ts'
import { sanitizeOptionalText, sanitizeText } from '../utils/sanitize.ts'
import { createApiKey, supabaseAdmin } from '../utils/supabase.ts'
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
    throw simpleError('no_id', 'No id', { record })
  }
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
    return c.json(BRES)
  }

  await createApiKey(c, record.id)
  await syncUserPreferenceTags(c, sanitizedEmail, record, oldRecord?.email)
  return c.json(BRES)
})
