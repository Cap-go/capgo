import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { z } from 'zod/mini'
import { parseBody, quickError, simpleError, useCors } from '../utils/hono.ts'
import { cloudlog } from '../utils/logging.ts'
import { emptySupabase, supabaseClient, supabaseAdmin as useSupabaseAdmin } from '../utils/supabase.ts'

interface ValidatePasswordCompliance {
  email: string
  password: string
  org_id: string
}

const bodySchema = z.object({
  email: z.string().check(z.email()),
  password: z.string().check(z.minLength(1)),
  org_id: z.string().check(z.uuid()),
})

// Check if password meets the policy requirements
function passwordMeetsPolicy(password: string, policy: {
  min_length?: number
  require_uppercase?: boolean
  require_number?: boolean
  require_special?: boolean
}): { valid: boolean, errors: string[] } {
  const errors: string[] = []

  // Check minimum length
  if (policy.min_length && password.length < policy.min_length) {
    errors.push(`Password must be at least ${policy.min_length} characters`)
  }

  // Check uppercase requirement
  if (policy.require_uppercase && !/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter')
  }

  // Check number requirement
  if (policy.require_number && !/\d/.test(password)) {
    errors.push('Password must contain at least one number')
  }

  // Check special character requirement
  if (policy.require_special && !/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
    errors.push('Password must contain at least one special character')
  }

  return { valid: errors.length === 0, errors }
}

export const app = new Hono<MiddlewareKeyVariables>()

app.use('/', useCors)

app.post('/', async (c) => {
  const rawBody = await parseBody<ValidatePasswordCompliance>(c)

  // Validate request body
  const validationResult = bodySchema.safeParse(rawBody)
  if (!validationResult.success) {
    return simpleError('invalid_body', 'Invalid request body', { errors: z.prettifyError(validationResult.error) })
  }

  const body = validationResult.data
  const { password: _password, ...bodyWithoutPassword } = body
  cloudlog({ requestId: c.get('requestId'), context: 'validate_password_compliance parsed body', parsedBody: bodyWithoutPassword })
  const supabaseAdmin = useSupabaseAdmin(c)

  // Get the org's password policy - need admin for initial lookup
  const { data: org, error: orgError } = await supabaseAdmin
    .from('orgs')
    .select('id, password_policy_config')
    .eq('id', body.org_id)
    .single()

  if (orgError || !org) {
    return quickError(404, 'org_not_found', 'Organization not found', { error: orgError?.message })
  }

  // Check if org has password policy enabled
  const policy = org.password_policy_config as {
    enabled?: boolean
    min_length?: number
    require_uppercase?: boolean
    require_number?: boolean
    require_special?: boolean
  } | null

  if (!policy || !policy.enabled) {
    return quickError(400, 'no_policy', 'Organization does not have a password policy enabled')
  }

  // Attempt to sign in with the provided credentials to verify password
  // Use anon client so RLS policies are enforced
  const anonClient = emptySupabase(c)
  const { data: signInData, error: signInError } = await anonClient.auth.signInWithPassword({
    email: body.email,
    password: body.password,
  })

  if (signInError || !signInData.user || !signInData.session) {
    cloudlog({ requestId: c.get('requestId'), context: 'validate_password_compliance - login failed', error: signInError?.message })
    return quickError(401, 'invalid_credentials', 'Invalid email or password')
  }

  const userId = signInData.user.id

  // Use authenticated client for subsequent queries - RLS will enforce access
  const supabase = supabaseClient(c, `Bearer ${signInData.session.access_token}`)

  // Verify user is a member of this organization
  const { data: membership, error: memberError } = await supabase
    .from('org_users')
    .select('user_id')
    .eq('org_id', body.org_id)
    .eq('user_id', userId)
    .single()

  if (memberError || !membership) {
    return quickError(403, 'not_member', 'You are not a member of this organization')
  }

  // Check if the password meets the policy requirements
  const policyCheck = passwordMeetsPolicy(body.password, policy)

  if (!policyCheck.valid) {
    return simpleError('password_does_not_meet_policy', 'Your current password does not meet the organization requirements', {
      errors: policyCheck.errors,
      policy: {
        min_length: policy.min_length,
        require_uppercase: policy.require_uppercase,
        require_number: policy.require_number,
        require_special: policy.require_special,
      },
    })
  }

  // Password is valid! Create or update the compliance record
  // Get the policy hash from the SQL function (matches the validation logic)
  const { data: policyHash, error: hashError } = await supabase
    .rpc('get_password_policy_hash', { policy_config: org.password_policy_config })

  if (hashError || !policyHash) {
    cloudlog({ requestId: c.get('requestId'), context: 'validate_password_compliance - hash error', error: hashError?.message })
    return quickError(500, 'hash_failed', 'Failed to compute policy hash', { error: hashError?.message })
  }

  // Upsert the compliance record
  const { error: upsertError } = await supabase
    .from('user_password_compliance')
    .upsert({
      user_id: userId,
      org_id: body.org_id,
      policy_hash: policyHash,
      validated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id,org_id',
    })

  if (upsertError) {
    cloudlog({ requestId: c.get('requestId'), context: 'validate_password_compliance - upsert error', error: upsertError.message })
    return quickError(500, 'compliance_update_failed', 'Failed to update compliance record', { error: upsertError.message })
  }

  cloudlog({ requestId: c.get('requestId'), context: 'validate_password_compliance - success', userId, orgId: body.org_id })

  return c.json({
    status: 'ok',
    message: 'Password verified and meets organization requirements',
  })
})
