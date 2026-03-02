import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../../utils/hono.ts'
import { z } from 'zod/mini'
import { createHono, middlewareAuth, parseBody, quickError, simpleError, useCors } from '../../utils/hono.ts'
import { cloudlog, cloudlogErr } from '../../utils/logging.ts'
import { supabaseAdmin } from '../../utils/supabase.ts'
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
  const userId = auth.userId
  const requestId = c.get('requestId')

  if (!userId) {
    return quickError(401, 'not_authorized', 'User ID not found in auth context')
  }

  const admin = supabaseAdmin(c)

  // Verify the user actually authenticated via SSO (not email/password)
  const { data: userAuth, error: userAuthError } = await admin.auth.admin.getUserById(userId)

  if (userAuthError || !userAuth?.user) {
    cloudlogErr({ requestId, message: 'Failed to retrieve user auth data for SSO verification', userId, error: userAuthError })
    return quickError(500, 'user_auth_check_failed', 'Failed to verify authentication method')
  }

  const userProvider = userAuth.user.app_metadata?.provider
  if (!userProvider || userProvider === 'email') {
    cloudlog({ requestId, message: 'User did not authenticate via SSO, rejecting provisioning', userId, provider: userProvider })
    return quickError(403, 'sso_auth_required', 'User must authenticate via SSO to be provisioned')
  }

  // Verify the user has an SSO identity matching the requested provider
  const userIdentities = userAuth.user.identities ?? []
  const hasSsoIdentity = userIdentities.some(
    (identity: any) => identity.provider === 'sso' || (identity.provider !== 'email' && identity.provider !== 'phone'),
  )

  if (!hasSsoIdentity) {
    cloudlog({ requestId, message: 'User has no SSO identity, rejecting provisioning', userId })
    return quickError(403, 'sso_identity_required', 'User must have an SSO identity to be provisioned')
  }

  // Get provider details to find the org_id
  const { data: provider, error: providerError } = await (admin as any)
    .from('sso_providers')
    .select('id, org_id, domain, status, provider_id')
    .eq('id', provider_id)
    .single()

  if (providerError || !provider) {
    cloudlogErr({ requestId, message: 'SSO provider not found for provisioning', providerId: provider_id, error: providerError })
    return quickError(404, 'provider_not_found', 'SSO provider not found')
  }

  // Verify provider is active (must be explicitly activated, not just verified)
  if (provider.status !== 'active') {
    cloudlog({ requestId, message: 'SSO provider not active, cannot provision', providerId: provider_id, status: provider.status })
    return quickError(400, 'provider_not_active', 'SSO provider must be active to provision users')
  }

  // Check if user already belongs to this org
  const { data: existingMembership, error: membershipCheckError } = await (admin as any)
    .from('org_users')
    .select('id')
    .eq('user_id', userId)
    .eq('org_id', provider.org_id)
    .maybeSingle()

  if (membershipCheckError) {
    cloudlogErr({ requestId, message: 'Failed to check existing org membership', userId, orgId: provider.org_id, error: membershipCheckError })
    return quickError(500, 'membership_check_failed', 'Failed to check organization membership')
  }

  if (existingMembership) {
    // User already in org, return success
    cloudlog({ requestId, message: 'User already belongs to org', userId, orgId: provider.org_id })
    return c.json({ success: true, already_member: true, org_id: provider.org_id })
  }

  // Get user's email to verify domain match
  const { data: userRecord, error: userError } = await (admin as any)
    .from('users')
    .select('email')
    .eq('id', userId)
    .single()

  if (userError || !userRecord?.email) {
    cloudlogErr({ requestId, message: 'Failed to get user email for domain verification', userId, error: userError })
    return quickError(500, 'user_lookup_failed', 'Failed to verify user email')
  }

  // Verify email domain matches provider domain (case-insensitive)
  const userDomainRaw = userRecord.email.split('@')[1]
  const userDomain = userDomainRaw?.toLowerCase().trim()
  const providerDomain = provider.domain?.toLowerCase().trim()
  if (userDomain !== providerDomain) {
    cloudlog({ requestId, message: 'User email domain does not match provider domain', userId, userDomain, providerDomain })
    return quickError(403, 'domain_mismatch', 'User email domain does not match SSO provider domain')
  }

  // Add user to org with default read role (SSO users get read access by default)
  const { error: insertError } = await (admin as any)
    .from('org_users')
    .insert({
      user_id: userId,
      org_id: provider.org_id,
      user_right: 'read',
    })

  if (insertError) {
    cloudlogErr({ requestId, message: 'Failed to insert user into org_users', userId, orgId: provider.org_id, error: insertError })
    return quickError(500, 'provision_failed', 'Failed to provision user to organization')
  }

  cloudlog({ requestId, message: 'SSO user provisioned successfully', userId, orgId: provider.org_id, providerId: provider_id })
  return c.json({ success: true, org_id: provider.org_id, provider_id })
})
