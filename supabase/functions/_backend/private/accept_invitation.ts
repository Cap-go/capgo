import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { z } from 'zod/mini'
import { parseBody, quickError, simpleError, useCors } from '../utils/hono.ts'
import { cloudlog, cloudlogErr, serializeError } from '../utils/logging.ts'
import { sanitizeText } from '../utils/sanitize.ts'
import { emptySupabase, supabaseAdmin as useSupabaseAdmin } from '../utils/supabase.ts'
import { syncUserPreferenceTags } from '../utils/user_preferences.ts'

interface AcceptInvitation {
  password: string
  magic_invite_string: string
  opt_for_newsletters: boolean
  captchaToken: string
}

interface PasswordPolicy {
  enabled: boolean
  min_length: number
  require_uppercase: boolean
  require_number: boolean
  require_special: boolean
}

const rbacRoleToLegacy: Record<string, 'read' | 'admin' | 'super_admin'> = {
  org_member: 'read',
  org_billing_admin: 'read',
  org_admin: 'admin',
  org_super_admin: 'super_admin',
}

// Default password policy (when org has no policy set)
const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  enabled: true,
  min_length: 6,
  require_uppercase: true,
  require_number: true,
  require_special: true,
}

// Build dynamic password validation schema based on org's policy
function buildPasswordSchema(policy: PasswordPolicy) {
  let schema = z.string().check(
    z.minLength(policy.min_length, `Password must be at least ${policy.min_length} characters`),
  )

  if (policy.require_uppercase) {
    schema = schema.check(z.regex(/[A-Z]/, 'Password must contain at least one uppercase letter'))
  }
  if (policy.require_number) {
    schema = schema.check(z.regex(/\d/, 'Password must contain at least one number'))
  }
  if (policy.require_special) {
    schema = schema.check(z.regex(/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/, 'Password must contain at least one special character'))
  }

  return schema
}

// Base schema for initial validation (without password)
const baseInvitationSchema = z.object({
  password: z.string(),
  magic_invite_string: z.string().check(z.minLength(1)),
  opt_for_newsletters: z.boolean(),
  captchaToken: z.string().check(z.minLength(1)),
})

export const app = new Hono<MiddlewareKeyVariables>()

app.use('/', useCors)

app.post('/', async (c) => {
  const rawBody = await parseBody<AcceptInvitation>(c)

  // First, validate base schema (without password policy checks)
  const baseValidationResult = baseInvitationSchema.safeParse(rawBody)
  if (!baseValidationResult.success) {
    throw simpleError('invalid_json_body', 'Invalid request', { errors: z.prettifyError(baseValidationResult.error) })
  }

  const baseBody = baseValidationResult.data
  const { password: _password, ...baseBodyWithoutPassword } = baseBody
  cloudlog({ requestId: c.get('requestId'), context: 'accept_invitation raw body', rawBody: baseBodyWithoutPassword })

  const supabaseAdmin = useSupabaseAdmin(c)

  // Get the invitation to find the org_id
  const { data: invitation, error: invitationError } = await supabaseAdmin.from('tmp_users')
    .select('*')
    .eq('invite_magic_string', baseBody.magic_invite_string)
    .single()

  if (invitationError) {
    return quickError(500, 'failed_to_accept_invitation', 'Failed to accept invitation get tmp_users', { error: invitationError.message })
  }

  if (!invitation) {
    return quickError(404, 'failed_to_accept_invitation', 'Invitation not found', { error: 'Invitation not found' })
  }

  // Get the org's password policy
  const { data: org, error: orgError } = await supabaseAdmin.from('orgs')
    .select('password_policy_config, use_new_rbac')
    .eq('id', invitation.org_id)
    .single()

  if (orgError) {
    return quickError(500, 'failed_to_accept_invitation', 'Failed to get org password policy', { error: orgError.message })
  }

  // Use org's password policy if enabled, otherwise use default
  const policyConfig = org?.password_policy_config as unknown as PasswordPolicy | null
  const passwordPolicy: PasswordPolicy = policyConfig?.enabled
    ? policyConfig
    : DEFAULT_PASSWORD_POLICY

  // Validate password against the policy
  const passwordSchema = buildPasswordSchema(passwordPolicy)
  const passwordValidationResult = passwordSchema.safeParse(baseBody.password)
  if (!passwordValidationResult.success) {
    throw simpleError('invalid_password', 'Password does not meet requirements', {
      errors: z.prettifyError(passwordValidationResult.error),
      policy: {
        min_length: passwordPolicy.min_length,
        require_uppercase: passwordPolicy.require_uppercase,
        require_number: passwordPolicy.require_number,
        require_special: passwordPolicy.require_special,
      },
    })
  }

  const body = {
    ...baseBody,
    password: passwordValidationResult.data,
  }
  const { password: _pwd, ...bodyWithoutPassword } = body
  cloudlog({ requestId: c.get('requestId'), context: 'accept_invitation validated body', body: bodyWithoutPassword })

  const sanitizedEmail = sanitizeText(invitation.email)
  const sanitizedFirstName = sanitizeText(invitation.first_name)
  const sanitizedLastName = sanitizeText(invitation.last_name)

  // here the real magic happens
  const { data: user, error: userError } = await supabaseAdmin.auth.admin.createUser({
    email: sanitizedEmail,
    password: body.password,
    email_confirm: true,
    id: invitation.future_uuid,
  })

  if (userError || !user) {
    return quickError(500, 'failed_to_accept_invitation', 'Failed to accept invitation createUser', { error: userError?.message ?? 'Unknown error' })
  }

  // TODO: improve error handling
  const { error: userNormalTableError, data } = await supabaseAdmin.from('users').insert({
    id: user.user.id,
    email: sanitizedEmail,
    first_name: sanitizedFirstName,
    last_name: sanitizedLastName,
    enable_notifications: true,
    opt_for_newsletters: body.opt_for_newsletters,
  }).select().single()

  if (userNormalTableError) {
    return quickError(500, 'failed_to_accept_invitation', 'Failed to accept invitation insert', { error: userNormalTableError.message })
  }

  await syncUserPreferenceTags(c, sanitizedEmail, data)

  // let's now login the user in. The rough idea is that we will create a session and then return the session to the client
  // then the client will use the session to redirect to login page.
  const userSupabase = emptySupabase(c)
  const { data: session, error: sessionError } = await userSupabase.auth.signInWithPassword({
    email: sanitizedEmail,
    password: body.password,
    options: {
      captchaToken: body.captchaToken,
    },
  })

  if (sessionError) {
    return quickError(500, 'failed_to_accept_invitation', 'Sign in failed', { error: sessionError.message })
  }

  // We are still not finished. We need to remove from tmp_users and accept the invitation
  const { error: tmpUserDeleteError } = await supabaseAdmin.from('tmp_users').delete().eq('invite_magic_string', body.magic_invite_string)
  if (tmpUserDeleteError) {
    return quickError(500, 'failed_to_accept_invitation', 'Failed to accept invitation delete tmp_users', { error: tmpUserDeleteError.message })
  }

  const rbacRoleName = invitation.rbac_role_name
  const useRbacInvite = org?.use_new_rbac === true

  if (useRbacInvite && !rbacRoleName) {
    return quickError(500, 'failed_to_accept_invitation', 'Failed to resolve RBAC role', { error: 'Missing RBAC role name' })
  }

  const rbacRoleNameValue = rbacRoleName ?? ''
  const legacyRight = useRbacInvite
    ? rbacRoleToLegacy[rbacRoleNameValue] ?? 'read'
    : invitation.role
  let rbacRoleId: string | null = null

  if (useRbacInvite) {
    const { data: role, error: roleError } = await supabaseAdmin
      .from('roles')
      .select('id')
      .eq('name', rbacRoleNameValue)
      .eq('scope_type', 'org')
      .single()

    if (roleError || !role) {
      return quickError(500, 'failed_to_accept_invitation', 'Failed to resolve RBAC role', { error: roleError?.message ?? 'Role not found' })
    }

    rbacRoleId = role.id
  }

  const { error: insertIntoMainTableError } = await supabaseAdmin.from('org_users').insert({
    user_id: user.user.id,
    org_id: invitation.org_id,
    user_right: legacyRight,
    rbac_role_name: useRbacInvite ? rbacRoleName : null,
  })

  if (insertIntoMainTableError) {
    return quickError(500, 'failed_to_accept_invitation', 'Failed to accept invitation insert into org_users', { error: insertIntoMainTableError.message })
  }

  if (useRbacInvite) {
    const { error: deleteBindingError } = await supabaseAdmin
      .from('role_bindings')
      .delete()
      .eq('principal_type', 'user')
      .eq('principal_id', user.user.id)
      .eq('scope_type', 'org')
      .eq('org_id', invitation.org_id)

    if (deleteBindingError) {
      const { error: rollbackError } = await supabaseAdmin
        .from('org_users')
        .delete()
        .eq('user_id', user.user.id)
        .eq('org_id', invitation.org_id)

      if (rollbackError) {
        cloudlogErr({
          requestId: c.get('requestId'),
          message: 'Failed to rollback org_users after RBAC binding cleanup failure',
          error: serializeError(rollbackError),
        })
        return quickError(500, 'failed_to_accept_invitation', 'Failed to rollback org_users after RBAC binding cleanup failure', { error: rollbackError.message })
      }

      return quickError(500, 'failed_to_accept_invitation', 'Failed to clear existing RBAC role bindings', { error: deleteBindingError.message })
    }

    const { error: insertBindingError } = await supabaseAdmin
      .from('role_bindings')
      .insert({
        principal_type: 'user',
        principal_id: user.user.id,
        role_id: rbacRoleId as string,
        scope_type: 'org',
        org_id: invitation.org_id,
        granted_by: user.user.id,
        granted_at: new Date().toISOString(),
        reason: 'Accepted invitation',
        is_direct: true,
      })

    if (insertBindingError) {
      const { error: rollbackError } = await supabaseAdmin
        .from('org_users')
        .delete()
        .eq('user_id', user.user.id)
        .eq('org_id', invitation.org_id)

      if (rollbackError) {
        cloudlogErr({
          requestId: c.get('requestId'),
          message: 'Failed to rollback org_users after RBAC binding insert failure',
          error: serializeError(rollbackError),
        })
        return quickError(500, 'failed_to_accept_invitation', 'Failed to rollback org_users after RBAC binding insert failure', { error: rollbackError.message })
      }

      return quickError(500, 'failed_to_accept_invitation', 'Failed to create RBAC role binding', { error: insertBindingError.message })
    }
  }

  return c.json({
    access_token: session.session?.access_token,
    refresh_token: session.session?.refresh_token,
  })
})
