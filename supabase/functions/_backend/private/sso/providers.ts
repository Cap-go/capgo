import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../../utils/hono.ts'
import { z } from 'zod/mini'
import { BRES, createHono, middlewareAuth, parseBody, quickError, simpleError, useCors } from '../../utils/hono.ts'
import { requireEnterprisePlan } from '../../utils/plan-gating.ts'
import { checkPermission } from '../../utils/rbac.ts'
import { createSSOProvider, deleteSSOProvider } from '../../utils/supabase-management.ts'
import { supabaseWithAuth } from '../../utils/supabase.ts'
import { version } from '../../utils/version.ts'

const createBodySchema = z.object({
  org_id: z.string().check(z.uuid()),
  domain: z.string().check(z.minLength(1)),
  metadata_url: z.string().check(z.url()),
  attribute_mapping: z.optional(z.unknown()),
})

const updateBodySchema = z.object({
  metadata_url: z.optional(z.string().check(z.url())),
  attribute_mapping: z.optional(z.unknown()),
  enforce_sso: z.optional(z.boolean()),
  status: z.optional(z.enum(['verified', 'active', 'disabled'])),
})

const uuidSchema = z.string().check(z.uuid())

function sanitizeProvider(provider: Record<string, unknown>) {
  const { dns_verification_token: _dnsVerificationToken, ...safeProvider } = provider
  return safeProvider
}

function generateDnsVerificationToken(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

function parseAttributeMapping(value: unknown): Record<string, string> | undefined {
  if (value === undefined) {
    return undefined
  }

  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw simpleError('invalid_body', 'attribute_mapping must be an object')
  }

  const result: Record<string, string> = {}
  for (const [key, mappedValue] of Object.entries(value)) {
    if (typeof mappedValue !== 'string') {
      throw simpleError('invalid_body', 'attribute_mapping values must be strings')
    }
    result[key] = mappedValue
  }

  return result
}

async function requireManageSsoPermission(c: Context<MiddlewareKeyVariables>, orgId: string) {
  const allowed = await checkPermission(c, 'org.update_settings' as any, { orgId })
  if (!allowed) {
    quickError(403, 'not_authorized', 'Not authorized')
  }
}

export const app = createHono('', version)

app.use('*', useCors)
app.use('*', middlewareAuth)

app.post('/', async (c) => {
  const auth = c.get('auth')
  if (!auth) {
    quickError(401, 'not_authorized', 'Not authorized')
  }

  const rawBody = await parseBody<{
    org_id?: string
    domain?: string
    metadata_url?: string
    attribute_mapping?: unknown
  }>(c)

  const validation = createBodySchema.safeParse(rawBody)
  if (!validation.success) {
    throw simpleError('invalid_body', 'Invalid request body', { errors: z.prettifyError(validation.error) })
  }

  const body = validation.data
  const attributeMapping = parseAttributeMapping(body.attribute_mapping)

  await requireManageSsoPermission(c, body.org_id)
  await requireEnterprisePlan(c, body.org_id)

  const managementProvider = await createSSOProvider(c, body.domain, body.metadata_url, attributeMapping)

  try {
    const supabase = supabaseWithAuth(c, auth) as any
    const dnsVerificationToken = generateDnsVerificationToken()

    const { data, error } = await supabase
      .from('sso_providers')
      .insert({
        org_id: body.org_id,
        domain: body.domain,
        provider_id: managementProvider.id,
        status: 'pending_verification',
        dns_verification_token: dnsVerificationToken,
        metadata_url: body.metadata_url,
        attribute_mapping: attributeMapping ?? null,
      })
      .select('*')
      .single()

    if (error || !data) {
      // Rollback: delete the external provider to avoid orphan
      await deleteSSOProvider(c, managementProvider.id).catch((cleanupError) => {
        console.error('Failed to cleanup external SSO provider after DB insert failure:', cleanupError)
      })
      return quickError(500, 'provider_create_failed', 'Failed to create SSO provider', { error })
    }

    return c.json(data)
  }
  catch (err) {
    // Rollback on any exception
    await deleteSSOProvider(c, managementProvider.id).catch((cleanupError) => {
      console.error('Failed to cleanup external SSO provider after exception:', cleanupError)
    })
    throw err
  }
})

app.get('/:orgId', async (c) => {
  const auth = c.get('auth')
  if (!auth) {
    quickError(401, 'not_authorized', 'Not authorized')
  }

  const orgId = c.req.param('orgId')
  const orgIdValidation = uuidSchema.safeParse(orgId)
  if (!orgIdValidation.success) {
    throw simpleError('invalid_org_id', 'Invalid org_id')
  }

  await requireManageSsoPermission(c, orgId)

  const supabase = supabaseWithAuth(c, auth) as any
  const { data, error } = await supabase
    .from('sso_providers')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })

  if (error) {
    quickError(500, 'providers_list_failed', 'Failed to list SSO providers', { error })
  }

  return c.json((data ?? []).map((provider: Record<string, unknown>) => sanitizeProvider(provider)))
})

app.patch('/:id', async (c) => {
  const auth = c.get('auth')
  if (!auth) {
    quickError(401, 'not_authorized', 'Not authorized')
  }

  const id = c.req.param('id')
  const idValidation = uuidSchema.safeParse(id)
  if (!idValidation.success) {
    throw simpleError('invalid_provider_id', 'Invalid provider id')
  }

  const rawBody = await parseBody<{
    metadata_url?: string
    attribute_mapping?: unknown
    enforce_sso?: boolean
  }>(c)

  const validation = updateBodySchema.safeParse(rawBody)
  if (!validation.success) {
    throw simpleError('invalid_body', 'Invalid request body', { errors: z.prettifyError(validation.error) })
  }

  const body = validation.data
  const attributeMapping = parseAttributeMapping(body.attribute_mapping)

  const supabase = supabaseWithAuth(c, auth) as any
  const { data: provider, error: providerError } = await supabase
    .from('sso_providers')
    .select('id, org_id, status')
    .eq('id', id)
    .single()

  if (providerError || !provider) {
    quickError(404, 'provider_not_found', 'SSO provider not found')
  }

  await requireManageSsoPermission(c, provider.org_id)

  const updates: Record<string, unknown> = {}
  if (body.metadata_url !== undefined) {
    updates.metadata_url = body.metadata_url
  }
  if (body.attribute_mapping !== undefined) {
    updates.attribute_mapping = attributeMapping
  }
  if (body.enforce_sso !== undefined) {
    if (body.enforce_sso === true && provider.status !== 'active') {
      throw simpleError('invalid_enforce_sso', 'Cannot enable SSO enforcement on a provider that is not active')
    }
    updates.enforce_sso = body.enforce_sso
  }
  if (body.status !== undefined) {
    // Validate status transitions
    const currentStatus = provider.status
    const newStatus = body.status

    // Only allow certain transitions
    const validTransitions: Record<string, string[]> = {
      pending_verification: [], // Cannot change status until verified
      verified: ['active'], // Can activate
      active: ['disabled'], // Can disable
      disabled: ['active'], // Can re-enable
    }

    if (!validTransitions[currentStatus]?.includes(newStatus)) {
      throw simpleError('invalid_status_transition', `Cannot transition from ${currentStatus} to ${newStatus}`)
    }

    updates.status = body.status

    // Auto-reset enforce_sso when disabling provider
    if (newStatus === 'disabled') {
      updates.enforce_sso = false
    }
  }

  if (Object.keys(updates).length === 0) {
    throw simpleError('invalid_body', 'No updatable fields provided')
  }

  const { data: updatedProvider, error: updateError } = await supabase
    .from('sso_providers')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single()

  if (updateError || !updatedProvider) {
    quickError(500, 'provider_update_failed', 'Failed to update SSO provider', { error: updateError })
  }

  return c.json(sanitizeProvider(updatedProvider))
})

app.delete('/:id', async (c) => {
  const auth = c.get('auth')
  if (!auth) {
    quickError(401, 'not_authorized', 'Not authorized')
  }

  const id = c.req.param('id')
  const idValidation = uuidSchema.safeParse(id)
  if (!idValidation.success) {
    throw simpleError('invalid_provider_id', 'Invalid provider id')
  }

  const supabase = supabaseWithAuth(c, auth) as any
  const { data: provider, error: providerError } = await supabase
    .from('sso_providers')
    .select('id, org_id, provider_id')
    .eq('id', id)
    .single()

  if (providerError || !provider) {
    quickError(404, 'provider_not_found', 'SSO provider not found')
  }

  await requireManageSsoPermission(c, provider.org_id)

  // First delete the external provider (if exists) to avoid orphaning
  if (provider.provider_id) {
    try {
      await deleteSSOProvider(c, provider.provider_id)
    }
    catch (externalDeleteError) {
      const errorMsg = externalDeleteError instanceof Error ? externalDeleteError.message : String(externalDeleteError)
      return quickError(500, 'provider_delete_failed', 'Failed to delete external SSO provider', { error: errorMsg })
    }
  }

  // Then delete the database row
  const { error: deleteError } = await supabase
    .from('sso_providers')
    .delete()
    .eq('id', id)

  if (deleteError) {
    return quickError(500, 'provider_delete_failed', 'Failed to delete SSO provider', { error: deleteError })
  }

  return c.json(BRES)
})
