import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { Database } from '../utils/supabase.types.ts'
import { Hono } from 'hono/tiny'
import { trackBentoEvent } from '../utils/bento.ts'
import { BRES, middlewareAPISecret, simpleError, triggerValidator } from '../utils/hono.ts'
import { cloudlog } from '../utils/logging.ts'
import { logsnag } from '../utils/logsnag.ts'
import { sanitizeOptionalText, sanitizeText } from '../utils/sanitize.ts'
import { createStripeCustomer, finalizePendingStripeCustomer, supabaseAdmin } from '../utils/supabase.ts'
import { backgroundTask } from '../utils/utils.ts'

export const app = new Hono<MiddlewareKeyVariables>()

app.post('/', middlewareAPISecret, triggerValidator('orgs', 'INSERT'), async (c) => {
  const record = c.get('webhookBody') as Database['public']['Tables']['orgs']['Row']
  cloudlog({ requestId: c.get('requestId'), message: 'record', record })

  if (!record.id) {
    cloudlog({ requestId: c.get('requestId'), message: 'No id' })
    throw simpleError('no_id', 'No id', { record })
  }

  const sanitizedName = sanitizeText(record.name)
  const sanitizedManagementEmail = sanitizeOptionalText(record.management_email)
  const sanitizedLogo = sanitizeOptionalText(record.logo)
  const updateFields: Partial<Database['public']['Tables']['orgs']['Update']> = {}
  if (sanitizedName !== record.name)
    updateFields.name = sanitizedName
  if (sanitizedManagementEmail !== record.management_email)
    updateFields.management_email = sanitizedManagementEmail
  if (sanitizedLogo !== record.logo)
    updateFields.logo = sanitizedLogo

  if (Object.keys(updateFields).length > 0) {
    const { error: updateError } = await supabaseAdmin(c)
      .from('orgs')
      .update(updateFields)
      .eq('id', record.id)
    if (updateError) {
      cloudlog({ requestId: c.get('requestId'), message: 'Failed to sanitize org fields', updateError })
    }
  }

  const sanitizedRecord = {
    ...record,
    name: sanitizedName,
    management_email: sanitizedManagementEmail ?? record.management_email ?? '',
    logo: sanitizedLogo ?? record.logo,
  }

  if (!record.customer_id) {
    await createStripeCustomer(c, sanitizedRecord)
  }
  else if (record.customer_id.startsWith('pending_')) {
    await finalizePendingStripeCustomer(c, sanitizedRecord)
  }

  const LogSnag = logsnag(c)
  await backgroundTask(c, LogSnag.track({
    channel: 'org-created',
    event: 'Org Created',
    icon: '🎉',
    user_id: record.id,
    notify: false,
  }))
  await backgroundTask(c, trackBentoEvent(c, sanitizedRecord.management_email, {
    org_id: record.id,
    org_name: sanitizedRecord.name,
  }, 'org:created'))

  return c.json(BRES)
})
