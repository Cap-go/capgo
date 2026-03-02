import { z } from 'zod/mini'
import { createHono, parseBody, quickError, simpleError, useCors } from '../../utils/hono.ts'
import { cloudlog } from '../../utils/logging.ts'
import { emptySupabase } from '../../utils/supabase.ts'
import { version } from '../../utils/version.ts'

const bodySchema = z.object({
  email: z.string().check(z.email()),
})

export const app = createHono('', version)

app.use('/', useCors)

app.post('/', async (c) => {
  const rawBody = await parseBody<{ email?: string }>(c)

  const validation = bodySchema.safeParse({ email: rawBody.email })
  if (!validation.success) {
    throw simpleError('invalid_body', 'Invalid request body', { errors: z.prettifyError(validation.error) })
  }

  const { email } = validation.data

  // Extract domain from email
  const domain = email.split('@')[1]
  if (!domain) {
    return quickError(400, 'invalid_email', 'Email must contain a domain')
  }

  const supabase = emptySupabase(c)
  const requestId = c.get('requestId')

  try {
    const { data, error } = await (supabase.rpc as any)('check_domain_sso', { p_domain: domain })
    if (error) {
      cloudlog({ requestId, context: 'check_domain - query error', error: error.message, domain })
      return quickError(500, 'query_error', 'Failed to check domain')
    }

    if (!data || (Array.isArray(data) && data.length === 0)) {
      cloudlog({ requestId, context: 'check_domain - no SSO provider found', domain })
      return c.json({ has_sso: false })
    }

    cloudlog({ requestId, context: 'check_domain - SSO provider found', domain })
    return c.json({
      has_sso: true,
    })
  }
  catch (err) {
    cloudlog({ requestId, context: 'check_domain - unexpected error', error: String(err), domain })
    return quickError(500, 'internal_error', 'Internal server error')
  }
})
