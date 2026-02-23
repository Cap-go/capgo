import { z } from 'zod/mini'
import { createHono, middlewareAuth, parseBody, quickError, simpleError, useCors } from '../../utils/hono.ts'
import { cloudlog } from '../../utils/logging.ts'
import { emptySupabase } from '../../utils/supabase.ts'
import { version } from '../../utils/version.ts'

const bodySchema = z.object({
  email: z.string().check(z.email()),
  auth_type: z.enum(['password', 'sso']),
})

export const app = createHono('', version)

app.use('/', useCors)

app.post('/', middlewareAuth, async (c) => {
  const rawBody = await parseBody<{ email?: string, auth_type?: string }>(c)

  const validation = bodySchema.safeParse({ email: rawBody.email, auth_type: rawBody.auth_type })
  if (!validation.success) {
    throw simpleError('invalid_body', 'Invalid request body', { errors: z.prettifyError(validation.error) })
  }

  const { email, auth_type } = validation.data
  const requestId = c.get('requestId')

  // SSO authentication is always allowed
  if (auth_type === 'sso') {
    cloudlog({ requestId, context: 'check_enforcement - SSO auth always allowed', email })
    return c.json({ allowed: true })
  }

  // Extract domain from email
  const domain = email.split('@')[1]
  if (!domain) {
    return quickError(400, 'invalid_email', 'Email must contain a domain')
  }

  const supabase = emptySupabase(c)
  const auth = c.get('auth')
  const userId = auth?.userId

  if (!userId) {
    cloudlog({ requestId, context: 'check_enforcement - no user ID in auth', email })
    return quickError(401, 'no_user_id', 'User ID not found in auth context')
  }

  try {
    // Query for active SSO provider with enforcement enabled
    const { data: providerData, error: providerError } = await (supabase.rpc as any)('check_domain_sso', { p_domain: domain })
    if (providerError) {
      cloudlog({ requestId, context: 'check_enforcement - provider query error', error: providerError.message, domain })
      return quickError(500, 'query_error', 'Failed to check SSO enforcement')
    }

    // No SSO provider for this domain = no enforcement
    if (!providerData || (Array.isArray(providerData) && providerData.length === 0)) {
      cloudlog({ requestId, context: 'check_enforcement - no SSO provider found', domain })
      return c.json({ allowed: true })
    }

    const provider = Array.isArray(providerData) ? providerData[0] : providerData
    const orgId = provider.org_id

    // Check if SSO enforcement is enabled for this provider
    const { data: enforcementData, error: enforcementError } = await (supabase.from as any)('sso_providers')
      .select('enforce_sso')
      .eq('id', provider.id)
      .eq('status', 'active')
      .single()

    if (enforcementError) {
      cloudlog({ requestId, context: 'check_enforcement - enforcement query error', error: enforcementError.message, domain })
      return quickError(500, 'query_error', 'Failed to check SSO enforcement')
    }

    // If enforcement is not enabled, allow password auth
    if (!enforcementData?.enforce_sso) {
      cloudlog({ requestId, context: 'check_enforcement - SSO not enforced', domain })
      return c.json({ allowed: true })
    }

    // SSO is enforced - check if user is org_super_admin (break-glass bypass)
    const { data: roleData, error: roleError } = await (supabase.from as any)('org_users')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .single()

    if (roleError && roleError.code !== 'PGRST116') {
      // PGRST116 = no rows found (user not in org), which is expected
      cloudlog({ requestId, context: 'check_enforcement - role query error', error: roleError.message, orgId, userId })
      return quickError(500, 'query_error', 'Failed to check user role')
    }

    // Check if user has org_super_admin role
    const isSuperAdmin = roleData?.role === 'org_super_admin'

    if (isSuperAdmin) {
      cloudlog({ requestId, context: 'check_enforcement - super admin bypass', email, orgId })
      return c.json({ allowed: true })
    }

    // SSO is enforced and user is not super admin
    cloudlog({ requestId, context: 'check_enforcement - SSO enforced, password blocked', email, orgId })
    return c.json({ allowed: false, reason: 'sso_enforced' })
  }
  catch (err) {
    cloudlog({ requestId, context: 'check_enforcement - unexpected error', error: String(err), email })
    return quickError(500, 'internal_error', 'Internal server error')
  }
})
