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

interface SsoProviderRecord {
  id: string
  org_id: string
  provider_id: string | null
  enforce_sso?: boolean | null
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
      limit 1
    `,
    [email, excludedUserId, trustedProviders],
  )

  return result.rows[0]?.id ?? null
}

function getTrustedSsoProviders(userProvider: string, userIdentities: any[]): string[] {
  const trustedProviders = new Set<string>()
  const isTrustedSsoProvider = (provider: string) => provider === 'sso' || provider.startsWith('sso:')

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

function extractProviderId(provider: unknown): string | null {
  if (typeof provider !== 'string' || !provider.startsWith('sso:')) {
    return null
  }

  const providerId = provider.slice('sso:'.length).trim()
  return providerId.length > 0 ? providerId : null
}

function getAuthenticatedSsoProviders(userProvider: string | undefined, userProviders: string[], userIdentities: any[]): string[] {
  const currentProviderId = extractProviderId(userProvider)
  if (currentProviderId) {
    return [`sso:${currentProviderId}`]
  }

  const providers = new Set<string>()
  const addProvider = (provider: unknown) => {
    const providerId = extractProviderId(provider)
    if (providerId) {
      providers.add(`sso:${providerId}`)
    }
  }

  for (const provider of userProviders) {
    addProvider(provider)
  }
  for (const identity of userIdentities) {
    addProvider(identity?.provider)
  }

  return [...providers]
}

function getAuthorizedSsoProviders(provider: SsoProviderRecord, authenticatedProviders: string[]): string[] {
  const authorizedProviderIds = new Set(
    [provider.provider_id]
      .filter((providerId): providerId is string => typeof providerId === 'string' && providerId.length > 0),
  )

  return authenticatedProviders.filter((authenticatedProvider) => {
    const providerId = extractProviderId(authenticatedProvider)
    return !!providerId && authorizedProviderIds.has(providerId)
  })
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

async function ensurePublicUserRowExistsInTransaction(
  pgClient: ReturnType<typeof getPgClient>,
  requestId: string,
  user: PublicUserSeed,
): Promise<void> {
  try {
    await pgClient.query(
      `
        insert into public.users (id, email, first_name, last_name, enable_notifications, opt_for_newsletters)
        values ($1, $2, $3, $4, true, true)
        on conflict (id) do update
        set email = excluded.email
        where public.users.email is distinct from excluded.email
      `,
      [user.id, user.email, user.first_name, user.last_name],
    )
  }
  catch (error) {
    cloudlogErr({ requestId, message: 'Failed to sync public.users row during SSO merge transaction', userId: user.id, email: user.email, error })
    throw new Error('public_user_sync_failed')
  }
}

async function ensureOrgMembershipInTransaction(
  pgClient: ReturnType<typeof getPgClient>,
  requestId: string,
  userId: string,
  orgId: string,
  fallbackRole: Exclude<OrgMembershipRight, `invite_${string}`> = 'read',
): Promise<void> {
  const promoteExistingInvite = async (membershipId: string, currentRight: OrgMembershipRight | null) => {
    if (!isInviteRole(currentRight)) {
      return
    }

    const promotedRole = promoteInviteRole(currentRight)
    await pgClient.query(
      `
        update public.org_users
        set user_right = $1
        where id = $2
      `,
      [promotedRole, membershipId],
    )
  }

  try {
    const existingMembership = await pgClient.query<{ id: string, user_right: OrgMembershipRight | null }>(
      `
        select id, user_right
        from public.org_users
        where user_id = $1
          and org_id = $2
        for update
      `,
      [userId, orgId],
    )

    const existing = existingMembership.rows[0]
    if (existing) {
      await promoteExistingInvite(existing.id, existing.user_right)
      return
    }

    const insertedMembership = await pgClient.query(
      `
        insert into public.org_users (user_id, org_id, user_right)
        values ($1, $2, $3)
        on conflict do nothing
      `,
      [userId, orgId, fallbackRole],
    )

    if ((insertedMembership.rowCount ?? 0) > 0) {
      return
    }

    const racedMembership = await pgClient.query<{ id: string, user_right: OrgMembershipRight | null }>(
      `
        select id, user_right
        from public.org_users
        where user_id = $1
          and org_id = $2
        for update
      `,
      [userId, orgId],
    )

    const raced = racedMembership.rows[0]
    if (raced) {
      await promoteExistingInvite(raced.id, raced.user_right)
      return
    }

    throw new Error('membership_insert_failed')
  }
  catch (error) {
    cloudlogErr({ requestId, message: 'Failed to ensure org membership during SSO merge transaction', userId, orgId, fallbackRole, error })
    throw new Error('provision_failed')
  }
}

async function mergeSsoIdentityWithExistingAccount(
  pgClient: ReturnType<typeof getPgClient>,
  requestId: string,
  params: {
    originalUserId: string
    duplicateUserId: string
    publicUser: PublicUserSeed
    orgId: string
    authorizedSsoProviders: string[]
    enforceSso: boolean
  },
): Promise<void> {
  await pgClient.query('begin')
  try {
    let transferredIdentityCount = 0
    try {
      transferredIdentityCount = await transferSsoIdentities(pgClient, params.originalUserId, params.duplicateUserId, params.authorizedSsoProviders)
    }
    catch (identityTransferError) {
      cloudlogErr({ requestId, message: 'Failed to transfer SSO identity during merge', userId: params.duplicateUserId, originalUserId: params.originalUserId, error: identityTransferError })
      throw new Error('identity_transfer_failed')
    }

    if (transferredIdentityCount === 0) {
      cloudlogErr({ requestId, message: 'No SSO identities were transferred during merge', userId: params.duplicateUserId, originalUserId: params.originalUserId })
      throw new Error('identity_transfer_failed')
    }

    await ensurePublicUserRowExistsInTransaction(pgClient, requestId, params.publicUser)
    await ensureOrgMembershipInTransaction(pgClient, requestId, params.originalUserId, params.orgId)

    if (params.enforceSso) {
      try {
        await setAuthUserSsoOnly(pgClient, params.originalUserId)
      }
      catch (ssoFlagError) {
        cloudlogErr({ requestId, message: 'Failed to set is_sso_user on original user during merge', originalUserId: params.originalUserId, error: ssoFlagError })
        throw new Error('sso_flag_update_failed')
      }
    }

    await pgClient.query('commit')
  }
  catch (error) {
    try {
      await pgClient.query('rollback')
    }
    catch (rollbackError) {
      cloudlogErr({ requestId, message: 'Failed to roll back SSO merge transaction', userId: params.duplicateUserId, originalUserId: params.originalUserId, error: rollbackError })
    }
    throw error
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
    const authenticatedSsoProviders = getAuthenticatedSsoProviders(userProvider, userProviders, userIdentities)

    const userEmail = userAuth.user.email
    if (!userEmail) {
      return quickError(400, 'no_email', 'User has no email address')
    }
    const publicUserSeed = buildPublicUserSeed(userId, userEmail, userAuth.user.user_metadata)

    const userDomain = userEmail.split('@')[1]?.toLowerCase().trim()
    if (!userDomain) {
      return quickError(400, 'invalid_email', 'User email has no domain')
    }

    // Detect pre-existing auth identity with the same trusted email (different UUID).
    // This happens when SSO is enabled for a domain where users already had email/password accounts.
    // Supabase Auth creates a new auth.users record instead of linking — we fix this by merging.
    //
    // Security note: never resolve the merge candidate from public.users.email. That profile
    // column is user-editable; only auth.users.email and the current verified SSO session are
    // trusted identity sources for account linking.
    let resolvedExistingUserId: string | null = null
    try {
      resolvedExistingUserId = await findCanonicalAuthUserIdByEmail(getSharedPgClient(), userEmail, userId, trustedSsoProviders)
      if (resolvedExistingUserId) {
        cloudlog({ requestId, message: 'Canonical pre-existing auth account found — will merge SSO identity after provider authorization', userId, originalUserId: resolvedExistingUserId, email: userEmail })
      }
    }
    catch (existingAuthUserError) {
      cloudlogErr({ requestId, message: 'Failed to check auth.users for pre-existing account by email', userId, email: userEmail, error: existingAuthUserError })
      return quickError(500, 'user_lookup_failed', 'Failed to resolve existing account for SSO merge')
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
        .select('id, org_id, provider_id, enforce_sso')
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

      const authorizedSsoProviders = getAuthorizedSsoProviders(mergeProvider, authenticatedSsoProviders)
      if (authorizedSsoProviders.length === 0) {
        cloudlog({ requestId, message: 'Authenticating SSO provider does not match email domain provider — aborting merge', userId, originalUserId, domain: userDomain, providerId: mergeProvider.id, externalProviderId: mergeProvider.provider_id, authenticatedProviders: authenticatedSsoProviders })
        return quickError(403, 'provider_mismatch', 'SSO provider does not match the email domain provider')
      }

      // Step 2: Transfer the SSO identity and provision the merged account atomically.
      try {
        await mergeSsoIdentityWithExistingAccount(getSharedPgClient(), requestId, {
          originalUserId,
          duplicateUserId: userId,
          publicUser: {
            ...publicUserSeed,
            id: originalUserId,
          },
          orgId: mergeProvider.org_id,
          authorizedSsoProviders,
          enforceSso: mergeProvider?.enforce_sso === true,
        })
      }
      catch (mergeError) {
        if (mergeError instanceof Error) {
          if (mergeError.message === 'identity_transfer_failed') {
            return quickError(500, 'identity_transfer_failed', 'Failed to merge SSO identity with existing account')
          }
          if (mergeError.message === 'public_user_sync_failed') {
            return quickError(500, 'public_user_sync_failed', 'Failed to create user profile for merged SSO account')
          }
          if (mergeError.message === 'provision_failed') {
            return quickError(500, 'provision_failed', 'Failed to provision user to organization')
          }
          if (mergeError.message === 'sso_flag_update_failed') {
            return quickError(500, 'sso_flag_update_failed', 'Failed to enforce SSO on merged account')
          }
        }

        cloudlogErr({ requestId, message: 'Failed to complete SSO merge transaction', userId, originalUserId, error: mergeError })
        return quickError(500, 'merge_failed', 'Failed to merge SSO account')
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
        app_metadata: { provider: authorizedSsoProviders[0] },
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
      .select('id, org_id, domain, status, provider_id')
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

    const authorizedSsoProviders = getAuthorizedSsoProviders(provider, authenticatedSsoProviders)
    if (authorizedSsoProviders.length === 0) {
      cloudlog({ requestId, message: 'Authenticating SSO provider does not match email domain provider — rejecting provisioning', userId, domain: userDomain, providerId: provider.id, externalProviderId: provider.provider_id, authenticatedProviders: authenticatedSsoProviders })
      return quickError(403, 'provider_mismatch', 'SSO provider does not match the email domain provider')
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
