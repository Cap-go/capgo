import { z } from 'zod/mini'
import { verifyDnsTxtRecord } from '../../utils/dns-verification.ts'
import { createHono, middlewareAuth, parseBody, quickError, simpleError, useCors } from '../../utils/hono.ts'
import { cloudlog } from '../../utils/logging.ts'
import { requireEnterprisePlan } from '../../utils/plan-gating.ts'
import { checkPermission } from '../../utils/rbac.ts'
import { supabaseWithAuth } from '../../utils/supabase.ts'
import { version } from '../../utils/version.ts'

const bodySchema = z.object({
  provider_id: z.string().check(z.uuid()),
})

export const app = createHono('', version)

app.use('/', useCors)

app.post('/', middlewareAuth, async (c) => {
  const auth = c.get('auth')
  if (!auth) {
    quickError(401, 'not_authorized', 'Not authorized')
  }

  const rawBody = await parseBody<{ provider_id?: string }>(c)

  const validation = bodySchema.safeParse({ provider_id: rawBody.provider_id })
  if (!validation.success) {
    throw simpleError('invalid_body', 'Invalid request body', { errors: z.prettifyError(validation.error) })
  }

  const { provider_id } = validation.data
  const requestId = c.get('requestId')

  const supabase = supabaseWithAuth(c, auth) as any

  // Fetch the provider record
  const { data: provider, error: providerError } = await supabase
    .from('sso_providers')
    .select('id, org_id, domain, dns_verification_token, status')
    .eq('id', provider_id)
    .single()

  if (providerError || !provider) {
    cloudlog({ requestId, context: 'verify-dns - provider not found', provider_id })
    quickError(404, 'provider_not_found', 'SSO provider not found')
  }

  // Check permission
  const allowed = await checkPermission(c, 'org.manage_sso' as any, { orgId: provider.org_id })
  if (!allowed) {
    quickError(403, 'not_authorized', 'Not authorized')
  }

  await requireEnterprisePlan(c, provider.org_id)

  // Verify DNS TXT record
  const result = await verifyDnsTxtRecord(provider.domain, provider.dns_verification_token)

  if (result.error) {
    cloudlog({ requestId, context: 'verify-dns - DNS lookup error', error: result.error, domain: provider.domain })
    return c.json({ verified: false, message: `DNS verification failed: ${result.error}` })
  }

  if (result.verified) {
    // Update provider status to verified
    const { error: updateError } = await supabase
      .from('sso_providers')
      .update({ status: 'verified', dns_verified_at: new Date().toISOString() })
      .eq('id', provider_id)

    if (updateError) {
      cloudlog({ requestId, context: 'verify-dns - update error', error: updateError.message, provider_id })
      quickError(500, 'update_failed', 'DNS verified but failed to update provider status')
    }

    cloudlog({ requestId, context: 'verify-dns - verified', domain: provider.domain, provider_id })
    return c.json({ verified: true, message: 'DNS verification successful' })
  }

  cloudlog({ requestId, context: 'verify-dns - not verified', domain: provider.domain, provider_id })
  return c.json({
    verified: false,
    message: `DNS TXT record not found. Add: _capgo-sso.${provider.domain} \u2192 ${provider.dns_verification_token}`,
  })
})
