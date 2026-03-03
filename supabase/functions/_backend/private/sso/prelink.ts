import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../../utils/hono.ts'
import { z } from 'zod/mini'
import { createHono, middlewareAuth, parseBody, quickError, simpleError, useCors } from '../../utils/hono.ts'
import { cloudlog, cloudlogErr } from '../../utils/logging.ts'
import { checkPermission } from '../../utils/rbac.ts'
import { supabaseClient } from '../../utils/supabase.ts'
import { getEnv } from '../../utils/utils.ts'
import { version } from '../../utils/version.ts'

const bodySchema = z.object({
  provider_id: z.string().check(z.uuid()),
})

export const app = createHono('', version)

app.use('*', useCors)
app.use('*', middlewareAuth)

app.post('/', async (c: Context<MiddlewareKeyVariables>) => {
  const auth = c.get('auth')
  if (!auth) {
    return quickError(401, 'not_authorized', 'Not authorized')
  }

  const rawBody = await parseBody<{ provider_id?: string }>(c)
  const validation = bodySchema.safeParse(rawBody)
  if (!validation.success) {
    throw simpleError('invalid_body', 'Invalid request body', { errors: z.prettifyError(validation.error) })
  }

  const { provider_id } = validation.data

  if (!auth.jwt) {
    return quickError(401, 'not_authorized', 'No JWT token found')
  }

  // Use authenticated client for DB read (RLS-enforced)
  const supabase = supabaseClient(c, auth.jwt)
  const { data: provider, error: providerError } = await (supabase as any)
    .from('sso_providers')
    .select('id, org_id, domain, provider_id, status')
    .eq('id', provider_id)
    .single()

  if (providerError || !provider) {
    return quickError(404, 'provider_not_found', 'SSO provider not found')
  }

  // Validate permission for this org
  const allowed = await checkPermission(c, 'org.update_settings' as any, { orgId: provider.org_id })
  if (!allowed) {
    return quickError(403, 'not_authorized', 'Not authorized to manage SSO for this organization')
  }

  // Call internal endpoint for admin operations
  const requestId = c.get('requestId')
  const apiSecret = getEnv(c, 'API_SECRET')
  const supabaseUrl = getEnv(c, 'SUPABASE_URL')

  try {
    const internalUrl = `${supabaseUrl}/functions/v1/private/sso/prelink-internal`
    const response = await fetch(internalUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiSecret}`,
      },
      body: JSON.stringify({
        provider_id,
        org_id: provider.org_id,
        domain: provider.domain,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
      cloudlogErr({
        requestId,
        message: 'SSO prelink internal endpoint failed',
        status: response.status,
        error: errorData,
      })
      return quickError(500, 'prelink_failed', 'Failed to prelink users')
    }

    const result = await response.json() as { processed: number, linked: number, errors: string[] }
    cloudlog({
      requestId,
      message: 'SSO pre-linking complete via internal endpoint',
      providerId: provider_id,
      domain: provider.domain,
      processed: result.processed,
      linked: result.linked,
      errorCount: result.errors?.length ?? 0,
    })

    return c.json(result)
  }
  catch (fetchError) {
    cloudlogErr({
      requestId,
      message: 'Failed to call SSO prelink internal endpoint',
      error: fetchError,
    })
    return quickError(500, 'prelink_failed', 'Failed to prelink users')
  }
})
