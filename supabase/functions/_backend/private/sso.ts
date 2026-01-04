import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { z } from 'zod/mini'
import { parseBody, quickError, simpleError, useCors } from '../utils/hono.ts'
import { middlewareV2 } from '../utils/hono_middleware.ts'
import { getCurrentPlanNameOrg, supabaseAdmin as useSupabaseAdmin } from '../utils/supabase.ts'

// Schema definitions
const orgIdSchema = z.object({
  org_id: z.uuid(),
})

const addDomainSchema = z.object({
  org_id: z.uuid(),
  domain: z.string().min(3).max(253),
})

const domainIdSchema = z.object({
  domain_id: z.uuid(),
})

const updateDomainSettingsSchema = z.object({
  domain_id: z.uuid(),
  auto_join_enabled: z.optional(z.boolean()),
  auto_join_role: z.optional(z.enum(['read', 'upload', 'write', 'admin'])),
})

const ssoProviderSchema = z.object({
  org_id: z.uuid(),
  supabase_sso_provider_id: z.optional(z.nullable(z.uuid())),
  provider_type: z.optional(z.string()),
  display_name: z.optional(z.nullable(z.string())),
  metadata_url: z.optional(z.nullable(z.string())),
  enabled: z.optional(z.boolean()),
})

export const app = new Hono<MiddlewareKeyVariables>()

app.use('/*', useCors)

// Helper function to check Enterprise plan
async function checkEnterprisePlan(c: any, orgId: string): Promise<boolean> {
  const planName = await getCurrentPlanNameOrg(c, orgId)
  return planName === 'Enterprise'
}

// ============================================================================
// SSO PROVIDER ENDPOINTS
// ============================================================================

// GET /sso/config - Get SSO config for an org
app.get('/config', middlewareV2(['all', 'write', 'read']), async (c) => {
  const auth = c.get('auth')!
  const orgId = c.req.query('org_id')

  if (!orgId) {
    return simpleError('missing_org_id', 'org_id query parameter is required')
  }

  const supabaseAdmin = await useSupabaseAdmin(c)

  // Check user has at least admin rights
  const userRight = await supabaseAdmin.rpc('check_min_rights', {
    min_right: 'admin',
    org_id: orgId,
    user_id: auth.userId,
    channel_id: null as any,
    app_id: null as any,
  })

  if (userRight.error || !userRight.data) {
    return quickError(401, 'not_authorized', 'Not authorized to view SSO config')
  }

  // Get SSO config
  const { data, error } = await supabaseAdmin
    .from('org_sso_providers')
    .select('*')
    .eq('org_id', orgId)
    .maybeSingle()

  if (error) {
    return simpleError('get_sso_config_error', 'Failed to get SSO config', { error })
  }

  // Check if org is Enterprise
  const isEnterprise = await checkEnterprisePlan(c, orgId)

  return c.json({
    config: data,
    is_enterprise: isEnterprise,
  })
})

// POST /sso/config - Create or update SSO config
app.post('/config', middlewareV2(['all', 'write']), async (c) => {
  const auth = c.get('auth')!
  const body = await parseBody<any>(c)

  const parsedBody = ssoProviderSchema.safeParse(body)
  if (!parsedBody.success) {
    return simpleError('invalid_body', 'Invalid request body', { errors: parsedBody.error })
  }

  const { org_id, ...ssoConfig } = parsedBody.data
  const supabaseAdmin = await useSupabaseAdmin(c)

  // Check user has super_admin rights
  const userRight = await supabaseAdmin.rpc('check_min_rights', {
    min_right: 'super_admin',
    org_id,
    user_id: auth.userId,
    channel_id: null as any,
    app_id: null as any,
  })

  if (userRight.error || !userRight.data) {
    return quickError(401, 'not_authorized', 'Super admin rights required')
  }

  // Check Enterprise plan
  if (!await checkEnterprisePlan(c, org_id)) {
    return quickError(403, 'requires_enterprise', 'SSO requires Enterprise plan')
  }

  // Upsert SSO config
  const { data, error } = await supabaseAdmin.rpc('upsert_org_sso_provider', {
    p_org_id: org_id,
    p_supabase_sso_provider_id: ssoConfig.supabase_sso_provider_id,
    p_provider_type: ssoConfig.provider_type || 'saml',
    p_display_name: ssoConfig.display_name,
    p_metadata_url: ssoConfig.metadata_url,
    p_enabled: ssoConfig.enabled ?? false,
  })

  if (error) {
    return simpleError('upsert_sso_config_error', 'Failed to save SSO config', { error })
  }

  const result = data?.[0]
  if (result?.error_code) {
    return simpleError(result.error_code, `Failed: ${result.error_code}`)
  }

  return c.json({ id: result?.id, success: true })
})

// DELETE /sso/config - Delete SSO config
app.delete('/config', middlewareV2(['all', 'write']), async (c) => {
  const auth = c.get('auth')!
  const orgId = c.req.query('org_id')

  if (!orgId) {
    return simpleError('missing_org_id', 'org_id query parameter is required')
  }

  const supabaseAdmin = await useSupabaseAdmin(c)

  // Check user has super_admin rights
  const userRight = await supabaseAdmin.rpc('check_min_rights', {
    min_right: 'super_admin',
    org_id: orgId,
    user_id: auth.userId,
    channel_id: null as any,
    app_id: null as any,
  })

  if (userRight.error || !userRight.data) {
    return quickError(401, 'not_authorized', 'Super admin rights required')
  }

  // Delete SSO config
  const { data, error } = await supabaseAdmin.rpc('delete_org_sso_provider', {
    p_org_id: orgId,
  })

  if (error) {
    return simpleError('delete_sso_config_error', 'Failed to delete SSO config', { error })
  }

  if (data !== 'OK') {
    return simpleError(data, `Failed: ${data}`)
  }

  return c.json({ success: true })
})

// ============================================================================
// DOMAIN ENDPOINTS
// ============================================================================

// GET /sso/domains - Get domains for an org
app.get('/domains', middlewareV2(['all', 'write', 'read']), async (c) => {
  const auth = c.get('auth')!
  const orgId = c.req.query('org_id')

  if (!orgId) {
    return simpleError('missing_org_id', 'org_id query parameter is required')
  }

  const supabaseAdmin = await useSupabaseAdmin(c)

  // Check user has at least admin rights
  const userRight = await supabaseAdmin.rpc('check_min_rights', {
    min_right: 'admin',
    org_id: orgId,
    user_id: auth.userId,
    channel_id: null as any,
    app_id: null as any,
  })

  if (userRight.error || !userRight.data) {
    return quickError(401, 'not_authorized', 'Not authorized to view domains')
  }

  // Get domains
  const { data, error } = await supabaseAdmin
    .from('org_domains')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })

  if (error) {
    return simpleError('get_domains_error', 'Failed to get domains', { error })
  }

  // Check if org is Enterprise
  const isEnterprise = await checkEnterprisePlan(c, orgId)

  return c.json({
    domains: data || [],
    is_enterprise: isEnterprise,
  })
})

// POST /sso/domains - Add a domain
app.post('/domains', middlewareV2(['all', 'write']), async (c) => {
  const auth = c.get('auth')!
  const body = await parseBody<any>(c)

  const parsedBody = addDomainSchema.safeParse(body)
  if (!parsedBody.success) {
    return simpleError('invalid_body', 'Invalid request body', { errors: parsedBody.error })
  }

  const { org_id, domain } = parsedBody.data
  const supabaseAdmin = await useSupabaseAdmin(c)

  // Check user has super_admin rights
  const userRight = await supabaseAdmin.rpc('check_min_rights', {
    min_right: 'super_admin',
    org_id,
    user_id: auth.userId,
    channel_id: null as any,
    app_id: null as any,
  })

  if (userRight.error || !userRight.data) {
    return quickError(401, 'not_authorized', 'Super admin rights required')
  }

  // Add domain via RPC
  const { data, error } = await supabaseAdmin.rpc('add_org_domain', {
    p_org_id: org_id,
    p_domain: domain.toLowerCase().trim(),
  })

  if (error) {
    return simpleError('add_domain_error', 'Failed to add domain', { error })
  }

  const result = data?.[0]
  if (result?.error_code) {
    return simpleError(result.error_code, `Failed: ${result.error_code}`)
  }

  return c.json({
    id: result?.id,
    verification_token: result?.verification_token,
    dns_record: `_capgo-verification.${domain.toLowerCase().trim()}`,
    success: true,
  })
})

// DELETE /sso/domains - Remove a domain
app.delete('/domains', middlewareV2(['all', 'write']), async (c) => {
  const auth = c.get('auth')!
  const domainId = c.req.query('domain_id')

  if (!domainId) {
    return simpleError('missing_domain_id', 'domain_id query parameter is required')
  }

  const supabaseAdmin = await useSupabaseAdmin(c)

  // Get domain to check org
  const { data: domain, error: domainError } = await supabaseAdmin
    .from('org_domains')
    .select('org_id')
    .eq('id', domainId)
    .single()

  if (domainError || !domain) {
    return simpleError('domain_not_found', 'Domain not found')
  }

  // Check user has super_admin rights
  const userRight = await supabaseAdmin.rpc('check_min_rights', {
    min_right: 'super_admin',
    org_id: domain.org_id,
    user_id: auth.userId,
    channel_id: null as any,
    app_id: null as any,
  })

  if (userRight.error || !userRight.data) {
    return quickError(401, 'not_authorized', 'Super admin rights required')
  }

  // Delete domain
  const { data, error } = await supabaseAdmin.rpc('remove_org_domain', {
    p_domain_id: domainId,
  })

  if (error) {
    return simpleError('delete_domain_error', 'Failed to delete domain', { error })
  }

  if (data !== 'OK') {
    return simpleError(data, `Failed: ${data}`)
  }

  return c.json({ success: true })
})

// POST /sso/domains/verify - Verify a domain via DNS
app.post('/domains/verify', middlewareV2(['all', 'write']), async (c) => {
  const auth = c.get('auth')!
  const body = await parseBody<any>(c)

  const parsedBody = domainIdSchema.safeParse(body)
  if (!parsedBody.success) {
    return simpleError('invalid_body', 'Invalid request body', { errors: parsedBody.error })
  }

  const { domain_id } = parsedBody.data
  const supabaseAdmin = await useSupabaseAdmin(c)

  // Get domain info
  const { data: domainInfo, error: domainError } = await supabaseAdmin
    .from('org_domains')
    .select('*')
    .eq('id', domain_id)
    .single()

  if (domainError || !domainInfo) {
    return simpleError('domain_not_found', 'Domain not found')
  }

  // Check user has super_admin rights
  const userRight = await supabaseAdmin.rpc('check_min_rights', {
    min_right: 'super_admin',
    org_id: domainInfo.org_id,
    user_id: auth.userId,
    channel_id: null as any,
    app_id: null as any,
  })

  if (userRight.error || !userRight.data) {
    return quickError(401, 'not_authorized', 'Super admin rights required')
  }

  // Check Enterprise plan
  if (!await checkEnterprisePlan(c, domainInfo.org_id)) {
    return quickError(403, 'requires_enterprise', 'SSO requires Enterprise plan')
  }

  // Already verified?
  if (domainInfo.verified) {
    return c.json({ success: true, already_verified: true })
  }

  // Perform DNS lookup to verify the domain
  const dnsRecord = `_capgo-verification.${domainInfo.domain}`
  let verified = false

  try {
    // Use Deno's DNS resolver to check TXT records
    const records = await Deno.resolveDns(dnsRecord, 'TXT')

    // Check if any TXT record matches our verification token
    for (const record of records) {
      const txtValue = Array.isArray(record) ? record.join('') : record
      if (txtValue === domainInfo.verification_token) {
        verified = true
        break
      }
    }
  }
  catch (dnsError) {
    // DNS lookup failed - domain not configured
    // Note: We don't expose the verification token in error responses for security
    return c.json({
      success: false,
      verified: false,
      error: 'dns_lookup_failed',
      message: `Could not find DNS TXT record at ${dnsRecord}. Please add the verification record and try again.`,
      expected_record: dnsRecord,
    })
  }

  if (!verified) {
    // Note: We don't expose the expected token value in error responses for security
    return c.json({
      success: false,
      verified: false,
      error: 'verification_token_mismatch',
      message: 'DNS TXT record found but value does not match the expected verification token.',
      expected_record: dnsRecord,
    })
  }

  // Mark domain as verified (this triggers backfill)
  // Pass user_id for service-role client compatibility
  const { data, error } = await supabaseAdmin.rpc('verify_org_domain', {
    p_domain_id: domain_id,
    p_user_id: auth.userId,
  })

  if (error) {
    return simpleError('verify_domain_error', 'Failed to verify domain', { error })
  }

  if (data !== 'OK') {
    return simpleError(data, `Failed: ${data}`)
  }

  return c.json({
    success: true,
    verified: true,
    message: 'Domain verified successfully. Existing users with this domain have been added to your organization.',
  })
})

// PUT /sso/domains/settings - Update domain settings
app.put('/domains/settings', middlewareV2(['all', 'write']), async (c) => {
  const auth = c.get('auth')!
  const body = await parseBody<any>(c)

  const parsedBody = updateDomainSettingsSchema.safeParse(body)
  if (!parsedBody.success) {
    return simpleError('invalid_body', 'Invalid request body', { errors: parsedBody.error })
  }

  const { domain_id, auto_join_enabled, auto_join_role } = parsedBody.data
  const supabaseAdmin = await useSupabaseAdmin(c)

  // Get domain to check org
  const { data: domain, error: domainError } = await supabaseAdmin
    .from('org_domains')
    .select('org_id')
    .eq('id', domain_id)
    .single()

  if (domainError || !domain) {
    return simpleError('domain_not_found', 'Domain not found')
  }

  // Check user has super_admin rights
  const userRight = await supabaseAdmin.rpc('check_min_rights', {
    min_right: 'super_admin',
    org_id: domain.org_id,
    user_id: auth.userId,
    channel_id: null as any,
    app_id: null as any,
  })

  if (userRight.error || !userRight.data) {
    return quickError(401, 'not_authorized', 'Super admin rights required')
  }

  // Update settings
  const { data, error } = await supabaseAdmin.rpc('update_org_domain_settings', {
    p_domain_id: domain_id,
    p_auto_join_enabled: auto_join_enabled,
    p_auto_join_role: auto_join_role,
  })

  if (error) {
    return simpleError('update_domain_error', 'Failed to update domain settings', { error })
  }

  if (data !== 'OK') {
    return simpleError(data, `Failed: ${data}`)
  }

  return c.json({ success: true })
})

// GET /sso/domains/preview - Preview how many users would be added
app.get('/domains/preview', middlewareV2(['all', 'write', 'read']), async (c) => {
  const auth = c.get('auth')!
  const orgId = c.req.query('org_id')
  const domain = c.req.query('domain')

  if (!orgId || !domain) {
    return simpleError('missing_params', 'org_id and domain query parameters are required')
  }

  const supabaseAdmin = await useSupabaseAdmin(c)

  // Check user has at least admin rights
  const userRight = await supabaseAdmin.rpc('check_min_rights', {
    min_right: 'admin',
    org_id: orgId,
    user_id: auth.userId,
    channel_id: null as any,
    app_id: null as any,
  })

  if (userRight.error || !userRight.data) {
    return quickError(401, 'not_authorized', 'Not authorized')
  }

  // Count users
  const { data, error } = await supabaseAdmin.rpc('count_domain_users', {
    p_domain: domain.toLowerCase().trim(),
    p_org_id: orgId,
  })

  if (error) {
    return simpleError('count_users_error', 'Failed to count users', { error })
  }

  return c.json({
    domain: domain.toLowerCase().trim(),
    user_count: data ?? 0,
  })
})
