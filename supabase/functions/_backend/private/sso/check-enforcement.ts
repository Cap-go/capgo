import { createHono, getClaimsFromJWT, middlewareAuth, parseBody, quickError, useCors } from '../../utils/hono.ts'
import { cloudlog } from '../../utils/logging.ts'
import { supabaseWithAuth } from '../../utils/supabase.ts'
import { version } from '../../utils/version.ts'

export const app = createHono('', version)

app.use('/', useCors)

app.post('/', middlewareAuth, async (c) => {
  // Accept body for backward compatibility but ignore it for enforcement decisions
  await parseBody<{ email?: string, auth_type?: string }>(c)

  const requestId = c.get('requestId')
  const auth = c.get('auth')
  const userId = auth?.userId

  if (!userId) {
    cloudlog({ requestId, context: 'check_enforcement - no user ID in auth' })
    return quickError(401, 'no_user_id', 'User ID not found in auth context')
  }

  // Derive email and auth provider from JWT claims — never trust the body
  const authorization = c.get('authorization')
  const claims = authorization ? await getClaimsFromJWT(c, authorization) : null
  const email = claims?.email

  if (!email) {
    cloudlog({ requestId, context: 'check_enforcement - no email in JWT claims', userId })
    return quickError(400, 'no_email', 'Email not found in authentication token')
  }

  // Determine auth type from JWT app_metadata — check both provider (singular, last login)
  // and providers[] (array, cumulative). After an account merge Supabase resets provider='email'
  // while providers[] retains the sso:X entry, so providers[] is the reliable source of truth.
  const provider = claims?.app_metadata?.provider
  const providers = Array.isArray(claims?.app_metadata?.providers)
    ? claims.app_metadata.providers.filter((item): item is string => typeof item === 'string')
    : []
  const isSsoProvider = (value: unknown): value is string => typeof value === 'string' && (value === 'sso' || value.startsWith('sso:'))
  const isSsoAuth = isSsoProvider(provider ?? '') || providers.some(isSsoProvider)

  // SSO authentication is always allowed
  if (isSsoAuth) {
    cloudlog({ requestId, context: 'check_enforcement - SSO auth always allowed', email, provider, providers })
    return c.json({ allowed: true })
  }

  const domain = email.split('@')[1]?.toLowerCase().trim()
  if (!domain) {
    return quickError(400, 'invalid_email', 'Email must contain a domain')
  }

  const supabase = supabaseWithAuth(c, auth)

  try {
    const { data: providerData, error: providerError } = await (supabase.rpc as any)('check_domain_sso', { p_domain: domain })
    if (providerError) {
      cloudlog({ requestId, context: 'check_enforcement - provider query error', error: providerError.message, domain })
      return quickError(500, 'query_error', 'Failed to check SSO enforcement')
    }

    if (!providerData || (Array.isArray(providerData) && providerData.length === 0)) {
      cloudlog({ requestId, context: 'check_enforcement - no SSO provider found', domain })
      return c.json({ allowed: true })
    }

    const { data: enforcementData, error: enforcementError } = await (supabase.rpc as any)('get_sso_enforcement_by_domain', {
      p_domain: domain,
    })

    if (enforcementError) {
      cloudlog({ requestId, context: 'check_enforcement - enforcement query error', error: enforcementError.message, domain })
      return quickError(500, 'query_error', 'Failed to check SSO enforcement')
    }

    if (!enforcementData || (Array.isArray(enforcementData) && enforcementData.length === 0)) {
      cloudlog({ requestId, context: 'check_enforcement - no SSO enforcement data found', domain })
      return c.json({ allowed: true })
    }

    const enforcementRow = Array.isArray(enforcementData) ? enforcementData[0] : enforcementData
    const orgId = enforcementRow.org_id

    // If enforcement is not enabled, allow password auth
    if (!enforcementRow.enforce_sso) {
      cloudlog({ requestId, context: 'check_enforcement - SSO not enforced', domain })
      return c.json({ allowed: true })
    }

    // SSO is enforced - check if user is super_admin (break-glass bypass)
    const { data: roleData, error: roleError } = await (supabase.from as any)('org_users')
      .select('user_right')
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .single()

    if (roleError && roleError.code !== 'PGRST116') {
      // PGRST116 = no rows found (user not in org), which is expected
      cloudlog({ requestId, context: 'check_enforcement - role query error', error: roleError.message, orgId, userId })
      return quickError(500, 'query_error', 'Failed to check user role')
    }

    // Check if user has super_admin right (break-glass: super admins bypass SSO enforcement)
    const isSuperAdmin = roleData?.user_right === 'super_admin'

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
