import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../../utils/hono.ts'
import { createHono, middlewareAuth, quickError, useCors } from '../../utils/hono.ts'
import { cloudlog, cloudlogErr } from '../../utils/logging.ts'
import { getPgClient } from '../../utils/pg.ts'
import { supabaseAdmin } from '../../utils/supabase.ts'
import { version } from '../../utils/version.ts'

interface PublicUserSeed {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
}

type OrgMembershipRight
  = 'read'
    | 'upload'
    | 'write'
    | 'admin'
    | 'super_admin'
    | 'invite_read'
    | 'invite_upload'
    | 'invite_write'
    | 'invite_admin'
    | 'invite_super_admin'

interface EnsureOrgMembershipResult {
  alreadyMember: boolean
}

export const app = createHono('', version)

app.use('*', useCors)
app.use('*', middlewareAuth)

async function findCanonicalAuthUserIdByEmail(pgClient: ReturnType<typeof getPgClient>, email: string, excludedUserId: string, trustedProviders: string[]): Promise<string | null> {
  const result = await pgClient.query<{ id: string }>(
    `
      select au.id
      from auth.users au
      left join public.users pu
        on pu.id = au.id
      where lower(au.email) = lower($1)
        and au.id <> $2
      order by
        case when pu.id is not null then 0 else 1 end,
        case when exists (
          select 1
          from auth.identities ai
          where ai.user_id = au.id
            and ai.provider = any($3::text[])
        ) then 0 else 1 end,
        au.created_at asc,
        au.id asc
      limit 2
    `,
    [email, excludedUserId, trustedProviders],
  )

  if (result.rows.length > 1) {
    throw new Error('ambiguous_existing_auth_users')
  }

  return result.rows[0]?.id ?? null
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

async function transferSsoIdentities(pgClient: ReturnType<typeof getPgClient>, originalUserId: string, duplicateUserId: string, trustedProviders: string[]): Promise<number> {
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

async function setAuthUserSsoOnly(pgClient: ReturnType<typeof getPgClient>, userId: string): Promise<void> {
  await pgClient.query(
    `
      update auth.users
      set is_sso_user = true
      where id = $1
    `,
    [userId],
  )
}

function buildPublicUserSeed(userId: string, email: string, userMetadata: Record<string, unknown> | undefined): PublicUserSeed {
  return {
    id: userId,
    email,
    first_name: typeof userMetadata?.first_name === 'string' ? userMetadata.first_name : null,
    last_name: typeof userMetadata?.last_name === 'string' ? userMetadata.last_name : null,
  }
}

function isInviteRole(role: string | null | undefined): role is Extract<OrgMembershipRight, `invite_${string}`> {
  return !!role && role.startsWith('invite_')
}

function promoteInviteRole(role: Extract<OrgMembershipRight, `invite_${string}`>): Exclude<OrgMembershipRight, `invite_${string}`> {
  switch (role) {
    case 'invite_read':
      return 'read'
    case 'invite_upload':
      return 'upload'
    case 'invite_write':
      return 'write'
    case 'invite_admin':
      return 'admin'
    case 'invite_super_admin':
      return 'super_admin'
  }
}

async function ensureOrgMembership(
  admin: ReturnType<typeof supabaseAdmin>,
  requestId: string,
  userId: string,
  orgId: string,
  fallbackRole: Exclude<OrgMembershipRight, `invite_${string}`> = 'read',
  allowRetry = true,
): Promise<EnsureOrgMembershipResult> {
  const { data: existingMembership, error: membershipCheckError } = await (admin as any)
    .from('org_users')
    .select('id, user_right')
    .eq('user_id', userId)
    .eq('org_id', orgId)
    .maybeSingle()

  if (membershipCheckError) {
    cloudlogErr({ requestId, message: 'Failed to check existing org membership', userId, orgId, error: membershipCheckError })
    throw new Error('membership_check_failed')
  }

  const currentRight = typeof existingMembership?.user_right === 'string'
    ? existingMembership.user_right as OrgMembershipRight
    : null

  if (existingMembership) {
    if (!isInviteRole(currentRight)) {
      return { alreadyMember: true }
    }

    const promotedRole = promoteInviteRole(currentRight)
    const { error: promotionError } = await (admin as any)
      .from('org_users')
      .update({ user_right: promotedRole })
      .eq('id', existingMembership.id)

    if (promotionError) {
      cloudlogErr({ requestId, message: 'Failed to promote invited org membership during SSO provisioning', userId, orgId, fromRole: currentRight, toRole: promotedRole, error: promotionError })
      throw new Error('membership_promotion_failed')
    }

    return { alreadyMember: false }
  }

  const { error: insertError } = await (admin as any)
    .from('org_users')
    .insert({
      user_id: userId,
      org_id: orgId,
      user_right: fallbackRole,
    })

  if (!insertError) {
    return { alreadyMember: false }
  }

  const isDuplicate = insertError.code === '23505' || insertError.message?.toLowerCase().includes('duplicate')
  if (isDuplicate && allowRetry) {
    return ensureOrgMembership(admin, requestId, userId, orgId, fallbackRole, false)
  }

  cloudlogErr({ requestId, message: 'Failed to insert user into org_users during SSO provisioning', userId, orgId, fallbackRole, error: insertError })
  throw new Error('membership_insert_failed')
}

async function ensurePublicUserRowExists(
  admin: ReturnType<typeof supabaseAdmin>,
  requestId: string,
  user: PublicUserSeed,
): Promise<void> {
  const { data: existingUser, error: existingUserError } = await (admin as any)
    .from('users')
    .select('id, email')
    .eq('id', user.id)
    .maybeSingle()

  if (existingUserError) {
    cloudlogErr({ requestId, message: 'Failed to check public.users row during SSO provisioning', userId: user.id, error: existingUserError })
    throw new Error('public_user_lookup_failed')
  }

  if (!existingUser) {
    const { error: insertError } = await (admin as any)
      .from('users')
      .insert({
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        enable_notifications: true,
        opt_for_newsletters: true,
      })

    if (insertError) {
      const isDuplicate = insertError.code === '23505' || insertError.message?.toLowerCase().includes('duplicate')
      if (!isDuplicate) {
        cloudlogErr({ requestId, message: 'Failed to create public.users row during SSO provisioning', userId: user.id, email: user.email, error: insertError })
        throw new Error('public_user_insert_failed')
      }
    }
  }

  if (existingUser?.email !== user.email) {
    const { error: updateError } = await (admin as any)
      .from('users')
      .update({ email: user.email })
      .eq('id', user.id)

    if (updateError) {
      cloudlogErr({ requestId, message: 'Failed to sync public.users email during SSO provisioning', userId: user.id, email: user.email, error: updateError })
      throw new Error('public_user_update_failed')
    }
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
  let pgClient: ReturnType<typeof getPgClient> | undefined
  const getSharedPgClient = () => {
    pgClient ??= getPgClient(c)
    return pgClient
  }

  try {
    // Verify the user actually authenticated via SSO (not email/password)
    const { data: userAuth, error: userAuthError } = await admin.auth.admin.getUserById(userId)

    if (userAuthError || !userAuth?.user) {
      cloudlogErr({ requestId, message: 'Failed to retrieve user auth data for SSO verification', userId, error: userAuthError })
      return quickError(500, 'user_auth_check_failed', 'Failed to verify authentication method')
    }

    const userProvider = userAuth.user.app_metadata?.provider
    const userProviders: string[] = userAuth.user.app_metadata?.providers ?? []
    const isSsoProvider = (p: string) => p === 'sso' || p.startsWith('sso:')
    if (!isSsoProvider(userProvider ?? '') && !userProviders.some(isSsoProvider)) {
      cloudlog({ requestId, message: 'User did not authenticate via SSO, rejecting provisioning', userId, provider: userProvider, providers: userProviders })
      return quickError(403, 'sso_auth_required', 'User must authenticate via SSO to be provisioned')
    }

    const userIdentities = userAuth.user.identities ?? []
    const trustedSsoProviders = getTrustedSsoProviders(userProvider ?? '', userIdentities)
    if (trustedSsoProviders.length === 0) {
      cloudlog({ requestId, message: 'User has no SSO identity, rejecting provisioning', userId })
      return quickError(403, 'sso_identity_required', 'User must have an SSO identity to be provisioned')
    }

    const userEmail = userAuth.user.email
    if (!userEmail) {
      return quickError(400, 'no_email', 'User has no email address')
    }
    const publicUserSeed = buildPublicUserSeed(userId, userEmail, userAuth.user.user_metadata)

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
        const existingAuthUserId = await findCanonicalAuthUserIdByEmail(getSharedPgClient(), userEmail, userId, trustedSsoProviders)
        if (existingAuthUserId) {
          cloudlog({ requestId, message: 'Canonical pre-existing auth account found (no public.users row yet) — will merge SSO identity', userId, originalUserId: existingAuthUserId, email: userEmail })
          resolvedExistingUserId = existingAuthUserId
        }
      }
      catch (existingAuthUserError) {
        cloudlogErr({ requestId, message: 'Failed to check auth.users for pre-existing account by email', userId, email: userEmail, error: existingAuthUserError })
        return quickError(500, 'user_lookup_failed', 'Failed to resolve existing account for SSO merge')
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
        .maybeSingle()

      if (mergeProviderError) {
        cloudlogErr({ requestId, message: 'Failed to resolve SSO provider during merge', originalUserId, domain: userDomain, error: mergeProviderError })
        return quickError(500, 'provider_lookup_failed', 'Failed to resolve SSO provider for your email domain')
      }

      if (!mergeProvider) {
        cloudlogErr({ requestId, message: 'No active SSO provider found during merge', originalUserId, domain: userDomain })
        return quickError(404, 'provider_not_found', 'No active SSO provider found for your email domain')
      }

      try {
        await ensurePublicUserRowExists(admin, requestId, {
          ...publicUserSeed,
          id: originalUserId,
        })
      }
      catch {
        return quickError(500, 'public_user_sync_failed', 'Failed to create user profile for merged SSO account')
      }

      try {
        await ensureOrgMembership(admin, requestId, originalUserId, mergeProvider.org_id)
      }
      catch {
        return quickError(500, 'provision_failed', 'Failed to provision user to organization')
      }

      // Step 2: Transfer SSO identity from duplicate user (userId) → original user (originalUserId)
      try {
        const transferredIdentityCount = await transferSsoIdentities(getSharedPgClient(), originalUserId, userId, trustedSsoProviders)
        if (transferredIdentityCount === 0) {
          cloudlogErr({ requestId, message: 'No SSO identities were transferred during merge', userId, originalUserId })
          return quickError(500, 'identity_transfer_failed', 'Failed to merge SSO identity with existing account')
        }
      }
      catch (identityTransferError) {
        cloudlogErr({ requestId, message: 'Failed to transfer SSO identity during merge', userId, originalUserId, error: identityTransferError })
        return quickError(500, 'identity_transfer_failed', 'Failed to merge SSO identity with existing account')
      }

      // Step 2b: Mark the merged account as SSO-only immediately when enforce_sso is active.
      // Provider updates sync auth.users.is_sso_user by domain when enforcement changes later,
      // so this write reflects the current provider state instead of becoming permanently sticky.
      if (mergeProvider?.enforce_sso === true) {
        try {
          await setAuthUserSsoOnly(getSharedPgClient(), originalUserId)
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

      // Update app_metadata.provider on the original user to reflect the SSO provider.
      // Our raw identity transfer bypasses Supabase Auth's normal flow, which would otherwise
      // update this field. Without this, the next SSO login returns provider='email' and
      // the provider check above rejects the user with sso_auth_required.
      const { error: updateProviderError } = await admin.auth.admin.updateUserById(originalUserId, {
        app_metadata: { provider: userProvider },
      })
      if (updateProviderError) {
        cloudlogErr({ requestId, message: 'Failed to update app_metadata.provider on original user after merge', originalUserId, error: updateProviderError })
        // Non-fatal: identity transfer succeeded; log but continue
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
      .maybeSingle()

    if (providerError) {
      cloudlogErr({ requestId, message: 'Failed to resolve SSO provider for domain', userId, domain: userDomain, error: providerError })
      return quickError(500, 'provider_lookup_failed', 'Failed to resolve SSO provider for your email domain')
    }

    if (!provider) {
      cloudlog({ requestId, message: 'No active SSO provider found for domain', userId, domain: userDomain })
      return quickError(404, 'provider_not_found', 'No active SSO provider found for your email domain')
    }

    try {
      await ensurePublicUserRowExists(admin, requestId, publicUserSeed)
    }
    catch {
      return quickError(500, 'public_user_sync_failed', 'Failed to create user profile for SSO account')
    }

    let membershipResult: EnsureOrgMembershipResult
    try {
      membershipResult = await ensureOrgMembership(admin, requestId, userId, provider.org_id)
    }
    catch {
      return quickError(500, 'provision_failed', 'Failed to provision user to organization')
    }

    if (membershipResult.alreadyMember) {
      cloudlog({ requestId, message: 'User already belongs to org', userId, orgId: provider.org_id })
      return c.json({ success: true, already_member: true })
    }

    cloudlog({ requestId, message: 'SSO user provisioned successfully', userId, orgId: provider.org_id, providerId: provider.id })
    return c.json({ success: true })
  }
  finally {
    if (pgClient) {
      await pgClient.end()
    }
  }
})
