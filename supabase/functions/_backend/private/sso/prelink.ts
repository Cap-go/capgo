import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../../utils/hono.ts'
import { z } from 'zod/mini'
import { createHono, middlewareAuth, parseBody, quickError, simpleError, useCors } from '../../utils/hono.ts'
import { cloudlog, cloudlogErr } from '../../utils/logging.ts'
import { checkPermission } from '../../utils/rbac.ts'
import { supabaseAdmin } from '../../utils/supabase.ts'
import { getEnv } from '../../utils/utils.ts'
import { version } from '../../utils/version.ts'

const bodySchema = z.object({
  provider_id: z.string().check(z.uuid()),
})

/**
 * Remove a specific identity from a user via the GoTrue admin REST API.
 * The Supabase JS SDK GoTrueAdminApi does not expose identity deletion,
 * so we call the endpoint directly with the service role key.
 */
async function adminDeleteIdentity(c: Context<MiddlewareKeyVariables>, userId: string, identityId: string): Promise<{ error: string | null }> {
  const supabaseUrl = getEnv(c, 'SUPABASE_URL')
  const serviceRoleKey = getEnv(c, 'SUPABASE_SERVICE_ROLE_KEY')
  const url = `${supabaseUrl}/auth/v1/admin/users/${userId}/identities/${identityId}`

  try {
    const res = await fetch(url, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
    })

    if (!res.ok) {
      const body = await res.text().catch(() => 'unknown')
      return { error: `HTTP ${res.status}: ${body}` }
    }

    return { error: null }
  }
  catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

export const app = createHono('', version)

app.use('*', useCors)
app.use('*', middlewareAuth)

app.post('/', async (c: Context<MiddlewareKeyVariables>) => {
  const auth = c.get('auth')
  if (!auth) {
    quickError(401, 'not_authorized', 'Not authorized')
  }

  const rawBody = await parseBody<{ provider_id?: string }>(c)
  const validation = bodySchema.safeParse(rawBody)
  if (!validation.success) {
    throw simpleError('invalid_body', 'Invalid request body', { errors: z.prettifyError(validation.error) })
  }

  const { provider_id } = validation.data

  // Get provider details from sso_providers table
  const admin = supabaseAdmin(c)
  const { data: provider, error: providerError } = await (admin as any)
    .from('sso_providers')
    .select('id, org_id, domain, provider_id, status')
    .eq('id', provider_id)
    .single()

  if (providerError || !provider) {
    quickError(404, 'provider_not_found', 'SSO provider not found')
  }

  // Validate permission for this org
  const allowed = await checkPermission(c, 'org.update_settings' as any, { orgId: provider.org_id })
  if (!allowed) {
    quickError(403, 'not_authorized', 'Not authorized to manage SSO for this organization')
  }

  // Find all auth.users with email matching the provider domain
  const domain = provider.domain as string
  const errors: string[] = []
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
      cloudlogErr({ requestId: c.get('requestId'), message: 'Failed to list users', error: listError })
      quickError(500, 'user_list_failed', 'Failed to list users')
    }

    const users = listData?.users ?? []
    if (users.length < perPage) {
      hasMore = false
    }

    for (const user of users) {
      if (!user.email?.endsWith(`@${domain}`)) {
        continue
      }

      processed++

      try {
        // Get full user with identities
        const { data: fullUser, error: userError } = await admin.auth.admin.getUserById(user.id)

        if (userError || !fullUser?.user) {
          errors.push(`Failed to get user ${user.id}: ${userError?.message ?? 'unknown error'}`)
          continue
        }

        // Find the email (password) identity
        const emailIdentity = fullUser.user.identities?.find(
          (identity: any) => identity.provider === 'email',
        )

        if (!emailIdentity) {
          // User has no password identity, skip
          cloudlog({
            requestId: c.get('requestId'),
            message: 'User has no email identity, skipping',
            userId: user.id,
            email: user.email,
          })
          continue
        }

        // Delete the password identity so the user must use SSO
        // IMPORTANT: This does NOT delete the user or change their UUID
        const { error: deleteError } = await adminDeleteIdentity(
          c,
          user.id,
          emailIdentity.id,
        )

        if (deleteError) {
          errors.push(`Failed to unlink password identity for ${user.email}: ${deleteError}`)
          continue
        }

        linked++
        cloudlog({
          requestId: c.get('requestId'),
          message: 'Unlinked password identity for SSO migration',
          userId: user.id,
          email: user.email,
          domain,
          providerId: provider_id,
        })
      }
      catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        errors.push(`Error processing user ${user.email ?? user.id}: ${errMsg}`)
      }
    }

    page++
  }

  cloudlog({
    requestId: c.get('requestId'),
    message: 'SSO pre-linking complete',
    providerId: provider_id,
    domain,
    processed,
    linked,
    errorCount: errors.length,
  })

  return c.json({
    processed,
    linked,
    errors,
  })
})
