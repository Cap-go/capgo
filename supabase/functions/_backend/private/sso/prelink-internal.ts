import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../../utils/hono.ts'
import { createHono, middlewareAPISecret, parseBody, quickError, simpleError, useCors } from '../../utils/hono.ts'
import { cloudlog, cloudlogErr } from '../../utils/logging.ts'
import { supabaseAdmin } from '../../utils/supabase.ts'
import { getEnv } from '../../utils/utils.ts'
import { version } from '../../utils/version.ts'

interface PrelinkUsersRequest {
  provider_id: string
  org_id: string
  domain: string
}

const PUBLIC_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.fr',
  'yahoo.co.uk',
  'outlook.com',
  'hotmail.com',
  'hotmail.fr',
  'live.com',
  'msn.com',
  'aol.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'protonmail.com',
  'proton.me',
  'mail.com',
  'zoho.com',
  'yandex.com',
  'gmx.com',
  'gmx.de',
  'fastmail.com',
  'tutanota.com',
  'hey.com',
])

/**
 * Masks an email address for logging purposes, showing only the first character
 * of the local part and the domain. Example: "j***@example.com"
 */
function maskEmail(email: string | undefined | null): string | undefined {
  if (!email || !email.includes('@'))
    return undefined
  const [localPart, domainPart] = email.split('@')
  if (!localPart || !domainPart)
    return undefined
  const maskedLocal = `${localPart.charAt(0)}***`
  return `${maskedLocal}@${domainPart}`
}

/**
 * Remove a specific identity from a user via the GoTrue admin REST API.
 * The Supabase JS SDK GoTrueAdminApi does not expose identity deletion,
 * so we call the endpoint directly with the service role key.
 */
async function adminDeleteIdentity(c: Context<MiddlewareKeyVariables>, userId: string, identityId: string): Promise<{ error: string | null }> {
  const supabaseUrl = getEnv(c, 'SUPABASE_URL')
  const serviceRoleKey = getEnv(c, 'SUPABASE_SERVICE_ROLE_KEY')
  const url = `${supabaseUrl}/auth/v1/admin/users/${userId}/identities/${identityId}`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)

  try {
    const res = await fetch(url, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
      signal: controller.signal,
    })

    if (!res.ok) {
      const body = await res.text().catch(() => 'unknown')
      return { error: `HTTP ${res.status}: ${body}` }
    }

    return { error: null }
  }
  catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { error: 'Request timed out after 5s' }
    }
    return { error: err instanceof Error ? err.message : String(err) }
  }
  finally {
    clearTimeout(timeout)
  }
}

export const app = createHono('', version)

app.use('*', useCors)
app.use('*', middlewareAPISecret)

app.post('/', async (c: Context<MiddlewareKeyVariables>) => {
  const rawBody = await parseBody<PrelinkUsersRequest>(c)

  if (!rawBody.provider_id || !rawBody.org_id || !rawBody.domain) {
    throw simpleError('invalid_body', 'Missing required fields: provider_id, org_id, domain')
  }

  const { provider_id, org_id, domain } = rawBody
  const requestId = c.get('requestId')

  const normalizedDomain = domain.toLowerCase().trim()

  if (PUBLIC_EMAIL_DOMAINS.has(normalizedDomain)) {
    cloudlogErr({ requestId, message: 'BLOCKED: prelink attempted on public email domain', domain: normalizedDomain, providerId: provider_id })
    return quickError(400, 'public_domain_blocked', 'Cannot prelink users on public email domains')
  }

  const admin = supabaseAdmin(c)

  // Verify the provider actually exists and is active before destructive operation
  const { data: providerCheck, error: providerCheckError } = await (admin as any)
    .from('sso_providers')
    .select('id, org_id, domain, status')
    .eq('id', provider_id)
    .single()

  if (providerCheckError || !providerCheck) {
    cloudlogErr({ requestId, message: 'Provider not found for prelink', providerId: provider_id, error: providerCheckError })
    return quickError(404, 'provider_not_found', 'SSO provider not found')
  }

  if (providerCheck.org_id !== org_id) {
    cloudlogErr({ requestId, message: 'Org mismatch: provider does not belong to requested org', providerId: provider_id, requestOrgId: org_id, providerOrgId: providerCheck.org_id })
    return quickError(403, 'org_mismatch', 'SSO provider does not belong to the specified organization')
  }

  if (providerCheck.status !== 'active') {
    cloudlog({ requestId, message: 'Provider not active, cannot prelink', providerId: provider_id, status: providerCheck.status })
    return quickError(400, 'provider_not_active', 'SSO provider must be active before prelinking users')
  }

  if (providerCheck.domain?.toLowerCase().trim() !== normalizedDomain) {
    cloudlogErr({ requestId, message: 'Domain mismatch between request and provider', requestDomain: normalizedDomain, providerDomain: providerCheck.domain })
    return quickError(400, 'domain_mismatch', 'Requested domain does not match provider domain')
  }

  let errorCount = 0
  let processed = 0
  let linked = 0

  // Paginate through all users to find matching emails
  let page = 1
  const perPage = 1000
  let hasMore = true

  while (hasMore) {
    const { data: listData, error: listError } = await admin.auth.admin.listUsers({
      page,
      perPage,
    })

    if (listError) {
      cloudlogErr({ requestId, message: 'Failed to list users', error: listError })
      return quickError(500, 'user_list_failed', 'Failed to list users')
    }

    const users = listData?.users ?? []
    if (users.length < perPage) {
      hasMore = false
    }

    for (const user of users) {
      const userEmail = user.email?.toLowerCase() ?? ''
      const normalizedDomain = domain.toLowerCase()
      if (!userEmail.endsWith(`@${normalizedDomain}`)) {
        continue
      }

      processed++

      try {
        // Get full user with identities
        const { data: fullUser, error: userError } = await admin.auth.admin.getUserById(user.id)

        if (userError || !fullUser?.user) {
          cloudlogErr({ requestId, message: 'Failed to get user for prelink', userId: user.id, error: userError?.message ?? 'unknown error' })
          errorCount++
          continue
        }

        // Find the email (password) identity
        const emailIdentity = fullUser.user.identities?.find(
          (identity: any) => identity.provider === 'email',
        )

        if (!emailIdentity) {
          cloudlog({
            requestId,
            message: 'User has no email identity, skipping',
            userId: user.id,
            emailMasked: maskEmail(user.email),
          })
          continue
        }

        // Delete the password identity so the user must use SSO
        const { error: deleteError } = await adminDeleteIdentity(
          c,
          user.id,
          emailIdentity.id,
        )

        if (deleteError) {
          cloudlogErr({ requestId, message: 'Failed to unlink password identity', userId: user.id, error: deleteError })
          errorCount++
          continue
        }

        linked++
        cloudlog({
          requestId,
          message: 'Unlinked password identity for SSO migration',
          userId: user.id,
          emailMasked: maskEmail(user.email),
          domain,
          providerId: provider_id,
        })
      }
      catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        cloudlogErr({ requestId, message: 'Error processing user during prelink', userId: user.id, error: errMsg })
        errorCount++
      }
    }

    page++
  }

  cloudlog({
    requestId,
    message: 'SSO pre-linking complete',
    providerId: provider_id,
    domain,
    processed,
    linked,
    errorCount,
  })

  return c.json({
    processed,
    linked,
    error_count: errorCount,
  })
})
