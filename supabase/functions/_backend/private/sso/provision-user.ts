import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../../utils/hono.ts'
import { createHono, middlewareAuth, quickError, useCors } from '../../utils/hono.ts'
import { cloudlog, cloudlogErr } from '../../utils/logging.ts'
import { closeClient, getPgClient } from '../../utils/pg.ts'
import { supabaseAdmin } from '../../utils/supabase.ts'
import { version } from '../../utils/version.ts'

export const app = createHono('', version)

app.use('*', useCors)
app.use('*', middlewareAuth)

async function findAuthUserIdByEmail(c: Context<MiddlewareKeyVariables>, email: string, excludedUserId: string): Promise<string | null> {
  let pgClient
  try {
    pgClient = getPgClient(c)
    const result = await pgClient.query<{ id: string }>(
      `
        select id
        from auth.users
        where lower(email) = lower($1)
          and id <> $2
        limit 1
      `,
      [email, excludedUserId],
    )

    return result.rows[0]?.id ?? null
  }
  finally {
    if (pgClient)
      await closeClient(c, pgClient)
  }
}

function getTrustedSsoProviders(userProvider: string, userIdentities: any[]): string[] {
  const trustedProviders = new Set<string>()
  const isTrustedSsoProvider = (provider: string) => provider === 'sso' || provider.startsWith('sso:') || provider === userProvider

  if (isTrustedSsoProvider(userProvider)) {
    trustedProviders.add(userProvider)
  }

  for (const identity of userIdentities) {
    const provider = identity?.provider
    if (provider && isTrustedSsoProvider(provider)) {
      trustedProviders.add(provider)
    }
  }

  return [...trustedProviders]
}

async function transferSsoIdentities(c: Context<MiddlewareKeyVariables>, originalUserId: string, duplicateUserId: string, trustedProviders: string[]): Promise<number> {
  let pgClient
  try {
    pgClient = getPgClient(c)
    const result = await pgClient.query(
      `
        update auth.identities
        set user_id = $1,
            updated_at = now()
        where user_id = $2
          and provider = any($3::text[])
      `,
      [originalUserId, duplicateUserId, trustedProviders],
    )

    return result.rowCount ?? 0
  }
  finally {
    if (pgClient)
      await closeClient(c, pgClient)
  }
}

async function setAuthUserSsoOnly(c: Context<MiddlewareKeyVariables>, userId: string): Promise<void> {
  let pgClient
  try {
    pgClient = getPgClient(c)
    await pgClient.query(
      `
        update auth.users
        set is_sso_user = true
        where id = $1
      `,
      [userId],
    )
  }
  finally {
    if (pgClient)
      await closeClient(c, pgClient)
  }
}

app.post('/', async (c: Context<MiddlewareKeyVariables>) => {
  const auth = c.get('auth')
  if (!auth) {
    return quickError(401, 'not_authorized', 'Not authorized')
  }

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

  const userIdentities = userAuth.user.identities ?? []
  const trustedSsoProviders = getTrustedSsoProviders(userProvider, userIdentities)
  const hasSsoIdentity = userIdentities.some(
    (identity: any) => identity.provider === 'sso' || (identity.provider !== 'email' && identity.provider !== 'phone'),
  )

  if (!hasSsoIdentity) {
    cloudlog({ requestId, message: 'User has no SSO identity, rejecting provisioning', userId })
    return quickError(403, 'sso_identity_required', 'User must have an SSO identity to be provisioned')
  }

  const userEmail = userAuth.user.email
  if (!userEmail) {
    return quickError(400, 'no_email', 'User has no email address')
  }

  const userDomain = userEmail.split('@')[1]?.toLowerCase().trim()
  if (!userDomain) {
    return quickError(400, 'invalid_email', 'User email has no domain')
  }

  // Detect pre-existing user with the same email (different UUID).
  // This happens when SSO is enabled for a domain where users already had email/password accounts.
  // Supabase Auth creates a new auth.users record instead of linking — we fix this by merging.
  //
  // Security note: merging on email match is safe here because we only reach this point after
  // Supabase has verified the SAML assertion's cryptographic signature from the trusted IdP
  // (configured by an org admin). The email claim therefore carries the same trust as the IdP's
  // signing certificate — not standard email verification. This merge must NOT be replicated in
  // contexts where the email claim is unverified (e.g., OAuth without verified_email, magic links).
  const { data: existingUser, error: existingUserError } = await (admin as any)
    .from('users')
    .select('id')
    .eq('email', userEmail)
    .neq('id', userId)
    .maybeSingle()

  if (existingUserError) {
    cloudlogErr({ requestId, message: 'Failed to check for pre-existing user by email', userId, email: userEmail, error: existingUserError })
    return quickError(500, 'user_lookup_failed', 'Failed to check for existing user')
  }

  // Fallback: check auth.users directly in case the existing account has no public.users row yet.
  // This covers cases where the original user authenticated via SSO (with a now-deleted provider)
  // and their public.users was never created, or was cleaned up.
  let resolvedExistingUserId: string | null = existingUser?.id ?? null
  if (!resolvedExistingUserId) {
    try {
      const existingAuthUserId = await findAuthUserIdByEmail(c, userEmail, userId)
      if (existingAuthUserId) {
        cloudlog({ requestId, message: 'Pre-existing auth account found (no public.users row yet) — will merge SSO identity', userId, originalUserId: existingAuthUserId, email: userEmail })
        resolvedExistingUserId = existingAuthUserId
      }
    }
    catch (existingAuthUserError) {
      cloudlogErr({ requestId, message: 'Failed to check auth.users for pre-existing account by email', userId, email: userEmail, error: existingAuthUserError })
      // Non-fatal — fall through to normal provisioning
    }
  }

  if (resolvedExistingUserId) {
    const originalUserId = resolvedExistingUserId
    cloudlog({ requestId, message: 'Pre-existing user found with same email — merging SSO identity', userId, originalUserId, email: userEmail })

    if (trustedSsoProviders.length === 0) {
      cloudlog({ requestId, message: 'User has no trusted SSO provider to transfer during merge', userId, originalUserId, provider: userProvider })
      return quickError(403, 'sso_identity_required', 'User must have a trusted SSO identity to be provisioned')
    }

    // Step 1: Resolve the SSO provider org so we can ensure the original user is a member
    const { data: mergeProvider, error: mergeProviderError } = await (admin as any)
      .from('sso_providers')
      .select('id, org_id, enforce_sso')
      .eq('domain', userDomain)
      .eq('status', 'active')
      .single()

    if (mergeProviderError) {
      cloudlogErr({ requestId, message: 'Failed to resolve SSO provider during merge — skipping org membership insert', originalUserId, domain: userDomain, error: mergeProviderError })
    }

    if (!mergeProviderError && mergeProvider) {
      const { data: existingMembership } = await (admin as any)
        .from('org_users')
        .select('id')
        .eq('user_id', originalUserId)
        .eq('org_id', mergeProvider.org_id)
        .maybeSingle()

      if (!existingMembership) {
        const { error: mergeInsertError } = await (admin as any)
          .from('org_users')
          .insert({ user_id: originalUserId, org_id: mergeProvider.org_id, user_right: 'read' })

        if (mergeInsertError) {
          const isDuplicate = mergeInsertError.code === '23505' || mergeInsertError.message?.toLowerCase().includes('duplicate')
          if (!isDuplicate) {
            cloudlogErr({ requestId, message: 'Failed to insert original user into org_users during merge', originalUserId, orgId: mergeProvider.org_id, error: mergeInsertError })
          }
        }
      }
    }

    // Step 2: Transfer SSO identity from duplicate user (userId) → original user (originalUserId)
    try {
      const transferredIdentityCount = await transferSsoIdentities(c, originalUserId, userId, trustedSsoProviders)
      if (transferredIdentityCount === 0) {
        cloudlogErr({ requestId, message: 'No SSO identities were transferred during merge', userId, originalUserId })
        return quickError(500, 'identity_transfer_failed', 'Failed to merge SSO identity with existing account')
      }
    }
    catch (identityTransferError) {
      cloudlogErr({ requestId, message: 'Failed to transfer SSO identity during merge', userId, originalUserId, error: identityTransferError })
      return quickError(500, 'identity_transfer_failed', 'Failed to merge SSO identity with existing account')
    }

    // Step 2b: Mark the original user as SSO-only when enforce_sso is active.
    // is_sso_user=true disables email/password login in Supabase — only set it when the
    // provider enforces SSO. Without enforce_sso the user can still log in with either method.
    if (mergeProvider?.enforce_sso === true) {
      try {
        await setAuthUserSsoOnly(c, originalUserId)
      }
      catch (ssoFlagError) {
        cloudlogErr({ requestId, message: 'Failed to set is_sso_user on original user during merge', originalUserId, error: ssoFlagError })
        return quickError(500, 'sso_flag_update_failed', 'Failed to enforce SSO on merged account')
      }
    }

    // Step 3: Delete the duplicate auth user (cascades to public.users, orgs, org_users)
    const { error: deleteError } = await admin.auth.admin.deleteUser(userId)
    if (deleteError) {
      cloudlogErr({ requestId, message: 'Failed to delete duplicate SSO user after identity transfer', userId, originalUserId, error: deleteError })
      // Identity already transferred — log but still return merged so frontend redirects to login
    }

    cloudlog({ requestId, message: 'SSO account merged successfully — user must re-login', userId, originalUserId })
    return c.json({ success: true, merged: true })
  }

  // Resolve the provider from the user's email domain server-side
  const { data: provider, error: providerError } = await (admin as any)
    .from('sso_providers')
    .select('id, org_id, domain, status')
    .eq('domain', userDomain)
    .eq('status', 'active')
    .single()

  if (providerError || !provider) {
    cloudlog({ requestId, message: 'No active SSO provider found for domain', userId, domain: userDomain })
    return quickError(404, 'provider_not_found', 'No active SSO provider found for your email domain')
  }

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
    cloudlog({ requestId, message: 'User already belongs to org', userId, orgId: provider.org_id })
    return c.json({ success: true, already_member: true })
  }

  const { error: insertError } = await (admin as any)
    .from('org_users')
    .insert({
      user_id: userId,
      org_id: provider.org_id,
      user_right: 'read',
    })

  if (insertError) {
    // SQLSTATE 23505 = unique_violation — user was inserted between our check and insert (race condition)
    const isDuplicate = insertError.code === '23505' || insertError.message?.toLowerCase().includes('duplicate')
    if (isDuplicate) {
      cloudlog({ requestId, message: 'User already member (concurrent insert)', userId, orgId: provider.org_id })
      return c.json({ success: true, already_member: true })
    }
    cloudlogErr({ requestId, message: 'Failed to insert user into org_users', userId, orgId: provider.org_id, error: insertError })
    return quickError(500, 'provision_failed', 'Failed to provision user to organization')
  }

  cloudlog({ requestId, message: 'SSO user provisioned successfully', userId, orgId: provider.org_id, providerId: provider.id })
  return c.json({ success: true })
})
