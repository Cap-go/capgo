import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { z } from 'zod/mini'
import { parseBody, quickError, simpleError, useCors } from '../utils/hono.ts'
import { middlewareV2 } from '../utils/hono_middleware.ts'
import { supabaseAdmin as useSupabaseAdmin } from '../utils/supabase.ts'

const bodySchema = z.object({
  org_id: z.uuid(),
  enabled: z.boolean(),
  min_length: z.number().check(z.gte(6), z.lte(128)).optional(),
  require_uppercase: z.boolean().optional(),
  require_number: z.boolean().optional(),
  require_special: z.boolean().optional(),
})

export const app = new Hono<MiddlewareKeyVariables>()

app.use('/', useCors)

app.post('/', middlewareV2(['all', 'write']), async (c) => {
  const auth = c.get('auth')!

  const body = await parseBody<any>(c)
  const parsedBodyResult = bodySchema.safeParse(body)
  if (!parsedBodyResult.success) {
    return simpleError('invalid_json_body', 'Invalid json body', { body, errors: z.prettifyError(parsedBodyResult.error) })
  }

  const safeBody = parsedBodyResult.data

  const supabaseAdmin = await useSupabaseAdmin(c)

  // Check if org exists
  const { data: organization, error: organizationError } = await supabaseAdmin.from('orgs')
    .select('id, password_policy_config, password_policy_updated_at')
    .eq('id', safeBody.org_id)
    .single()

  if (!organization || organizationError) {
    return simpleError('get_org_internal_error', 'Get org internal error', { organizationError })
  }

  // Check super_admin rights
  const userRight = await supabaseAdmin.rpc('check_min_rights', {
    min_right: 'super_admin',
    org_id: safeBody.org_id,
    user_id: auth.userId,
    channel_id: null as any,
    app_id: null as any,
  })

  if (userRight.error) {
    return simpleError('internal_auth_error', 'Internal auth error', { userRight })
  }

  if (!userRight.data) {
    return quickError(401, 'not_authorized', 'Not authorized', { userId: auth.userId, orgId: safeBody.org_id })
  }

  // Build password policy config
  let policyConfig: {
    enabled: boolean
    min_length: number
    require_uppercase: boolean
    require_number: boolean
    require_special: boolean
  } | null = null

  let policyUpdatedAt: string | null = null

  if (safeBody.enabled) {
    const newPolicy = {
      enabled: true,
      min_length: safeBody.min_length ?? 10,
      require_uppercase: safeBody.require_uppercase ?? true,
      require_number: safeBody.require_number ?? true,
      require_special: safeBody.require_special ?? true,
    }

    policyConfig = newPolicy

    // Check if policy is being enabled for the first time or made stricter
    const existingPolicy = organization.password_policy_config as typeof policyConfig | null
    const shouldUpdateTimestamp = !existingPolicy
      || !existingPolicy.enabled
      || newPolicy.min_length > (existingPolicy.min_length ?? 0)
      || (newPolicy.require_uppercase && !existingPolicy.require_uppercase)
      || (newPolicy.require_number && !existingPolicy.require_number)
      || (newPolicy.require_special && !existingPolicy.require_special)

    if (shouldUpdateTimestamp) {
      policyUpdatedAt = new Date().toISOString()
    }
    else {
      // Keep existing timestamp if policy is not stricter
      policyUpdatedAt = organization.password_policy_updated_at
    }
  }

  // Update org with new policy
  const { error: updateError } = await supabaseAdmin.from('orgs')
    .update({
      password_policy_config: policyConfig,
      password_policy_updated_at: policyUpdatedAt,
    })
    .eq('id', safeBody.org_id)

  if (updateError) {
    return simpleError('update_failed', 'Failed to update password policy', { updateError })
  }

  return c.json({ success: true })
})
