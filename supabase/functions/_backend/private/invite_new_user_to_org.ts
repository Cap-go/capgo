import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { Database } from '../utils/supabase.types.ts'
import dayjs from 'dayjs'
import { Hono } from 'hono/tiny'
import { z } from 'zod/mini'
import { trackBentoEvent } from '../utils/bento.ts'
import { BRES, middlewareAuth, parseBody, quickError, simpleError, useCors } from '../utils/hono.ts'
import { cloudlog } from '../utils/logging.ts'
import { checkPermission } from '../utils/rbac.ts'
import { supabaseAdmin, supabaseClient } from '../utils/supabase.ts'
import { getEnv } from '../utils/utils.ts'

// Define the schema for the invite user request
const inviteUserSchema = z.object({
  email: z.email(),
  org_id: z.string().check(z.minLength(1)),
  invite_type: z.enum([
    'read',
    'upload',
    'write',
    'admin',
    'super_admin',
    'org_member',
    'org_billing_admin',
    'org_admin',
    'org_super_admin',
  ]),
  captcha_token: z.string().optional(),
  first_name: z.string().check(z.minLength(1)),
  last_name: z.string().check(z.minLength(1)),
})

const captchaSchema = z.object({
  success: z.boolean(),
})

const legacyInviteRoles = ['read', 'upload', 'write', 'admin', 'super_admin'] as const
const rbacInviteRoles = ['org_member', 'org_billing_admin', 'org_admin', 'org_super_admin'] as const

type LegacyInviteRole = (typeof legacyInviteRoles)[number]
type RbacInviteRole = (typeof rbacInviteRoles)[number]

const rbacRoleToLegacy: Record<RbacInviteRole, Database['public']['Enums']['user_min_right']> = {
  org_member: 'read',
  org_billing_admin: 'read',
  org_admin: 'admin',
  org_super_admin: 'super_admin',
}

const legacyRoleToRbac: Partial<Record<LegacyInviteRole, RbacInviteRole>> = {
  read: 'org_member',
  upload: 'org_member',
  write: 'org_member',
  admin: 'org_admin',
  super_admin: 'org_super_admin',
}

function resolveInviteRoles(inviteType: string, useNewRbac: boolean) {
  if (!useNewRbac) {
    if (rbacInviteRoles.includes(inviteType as RbacInviteRole)) {
      throw simpleError('invalid_request', 'Invalid invite type')
    }
    return { legacyInviteType: inviteType as Database['public']['Enums']['user_min_right'], rbacRoleName: null }
  }

  if (rbacInviteRoles.includes(inviteType as RbacInviteRole)) {
    const rbacRoleName = inviteType as RbacInviteRole
    return { legacyInviteType: rbacRoleToLegacy[rbacRoleName], rbacRoleName }
  }

  if (legacyInviteRoles.includes(inviteType as LegacyInviteRole)) {
    const legacyInviteType = inviteType as Database['public']['Enums']['user_min_right']
    const rbacRoleName = legacyRoleToRbac[inviteType as LegacyInviteRole] ?? null
    return { legacyInviteType, rbacRoleName }
  }

  throw simpleError('invalid_request', 'Invalid invite type')
}

export const app = new Hono<MiddlewareKeyVariables>()

app.use('/', useCors)

async function validateInvite(c: Context, rawBody: any) {
  // Validate the request body using Zod
  const validationResult = inviteUserSchema.safeParse(rawBody)
  if (!validationResult.success) {
    throw simpleError('invalid_request', 'Invalid request', { errors: z.prettifyError(validationResult.error) })
  }

  const body = validationResult.data
  cloudlog({ requestId: c.get('requestId'), context: 'invite_new_user_to_org validated body', body })

  const authorization = c.get('authorization')
  if (!authorization)
    return quickError(401, 'not_authorized', 'Not authorized')

  // Verify the user has permission to invite
  // inviting super_admin requires org.update_user_roles, other roles require org.invite_user
  const isSuperAdminInvite = body.invite_type === 'super_admin' || body.invite_type === 'org_super_admin'
  const requiredPermission = isSuperAdminInvite ? 'org.update_user_roles' : 'org.invite_user'
  if (!await checkPermission(c, requiredPermission, { orgId: body.org_id })) {
    return quickError(403, 'not_authorized', 'Not authorized', {
      requiredPermission,
      orgId: body.org_id,
    })
  }

  // Verify captcha token with Cloudflare Turnstile
  const captchaSecret = getEnv(c, 'CAPTCHA_SECRET_KEY')
  if (captchaSecret.length > 0) {
    if (!body.captcha_token) {
      throw simpleError('invalid_request', 'Captcha token is required')
    }
    await verifyCaptchaToken(c, body.captcha_token, captchaSecret)
  }

  // Use authenticated client - RLS will enforce access based on JWT
  const supabase = supabaseClient(c, authorization)

  // Check if the user already exists
  const { data: existingUser, error: userError } = await supabase
    .from('users')
    .select('*')
    .eq('email', body.email)
    .single()

  // Create the invitation record in the database
  if (existingUser || !userError) {
    return { message: 'Failed to invite user', error: 'User already exists', status: 500 }
  }

  // Get org - RLS will block if user doesn't have access
  const { data: org, error: orgError } = await supabase
    .from('orgs')
    .select('*')
    .eq('id', body.org_id)
    .single()

  if (orgError || !org) {
    return { message: 'Failed to invite user', error: orgError?.message ?? 'Organization not found', status: 500 }
  }

  const useNewRbac = org.use_new_rbac === true
  const { legacyInviteType, rbacRoleName } = resolveInviteRoles(body.invite_type, useNewRbac)

  // Get current user ID from JWT
  const authContext = c.get('auth')
  if (!authContext?.userId) {
    return { message: 'Failed to get current user', error: 'Not authorized', status: 500 }
  }

  // Get user details
  const { data: inviteCreatorUser, error: inviteCreatorUserError } = await supabase
    .from('users')
    .select('*')
    .eq('id', authContext.userId)
    .single()

  if (inviteCreatorUserError) {
    return { message: 'Failed to invite user', error: inviteCreatorUserError.message, status: 500 }
  }
  return { inviteCreatorUser, org, body, authorization, legacyInviteType, rbacRoleName }
}

app.post('/', middlewareAuth, async (c) => {
  const rawBody = await parseBody<any>(c)
  cloudlog({ requestId: c.get('requestId'), context: 'invite_new_user_to_org raw body', rawBody })

  const res = await validateInvite(c, rawBody)
  if (!res.inviteCreatorUser) {
    throw simpleError('failed_to_invite_user', 'Failed to invite user', {}, res.error ?? 'Failed to invite user')
  }
  if (!res.org) {
    return quickError(404, 'organization_not_found', 'Organization not found')
  }
  const body = res.body
  const legacyInviteType = res.legacyInviteType
  const rbacRoleName = res.rbacRoleName
  const inviteCreatorUser = res.inviteCreatorUser
  const org = res.org

  // Use admin client for tmp_users operations since RLS blocks all access on that table
  const supabaseAdminClient = supabaseAdmin(c)

  const { data: existingInvitation } = await supabaseAdminClient
    .from('tmp_users')
    .select('*')
    .eq('email', body.email)
    .eq('org_id', body.org_id)
    .single()

  let newInvitation: Database['public']['Tables']['tmp_users']['Row'] | null = null
  if (existingInvitation) {
    const nowMinusThreeHours = dayjs().subtract(3, 'hours')
    if (!dayjs(nowMinusThreeHours).isAfter(dayjs(existingInvitation.cancelled_at))) {
      throw simpleError('user_already_invited', 'User already invited and it hasnt been 3 hours since the last invitation was cancelled')
    }

    const { error: updateInvitationError, data: updatedInvitationData } = await supabaseAdminClient
      .from('tmp_users')
      .update({
        cancelled_at: null,
        first_name: body.first_name,
        last_name: body.last_name,
        role: legacyInviteType,
        rbac_role_name: rbacRoleName,
      })
      .eq('email', body.email)
      .eq('org_id', body.org_id)
      .select('*')
      .single()

    if (updateInvitationError) {
      throw simpleError('failed_to_invite_user', 'Failed to invite user', {}, updateInvitationError.message)
    }

    newInvitation = updatedInvitationData
  }
  else {
    const { error: createUserError, data: newInvitationData } = await supabaseAdminClient.from('tmp_users').insert({
      email: body.email,
      org_id: body.org_id,
      role: legacyInviteType,
      rbac_role_name: rbacRoleName,
      first_name: body.first_name,
      last_name: body.last_name,
    }).select('*').single()

    if (createUserError) {
      throw simpleError('failed_to_invite_user', 'Failed to invite user', {}, createUserError.message)
    }

    newInvitation = newInvitationData
  }

  const bentoEvent = await trackBentoEvent(c, body.email, {
    org_admin_name: `${inviteCreatorUser.first_name} ${inviteCreatorUser.last_name}`,
    org_name: org.name,
    invite_link: `${getEnv(c, 'WEBAPP_URL')}/invitation?invite_magic_string=${newInvitation?.invite_magic_string}`,
    invited_first_name: `${newInvitation?.first_name ?? body.first_name}`,
    invited_last_name: `${newInvitation?.last_name ?? body.last_name}`,
  }, 'org:invite_new_capgo_user_to_org')
  if (bentoEvent === false) {
    cloudlog({ requestId: c.get('requestId'), context: 'invite_new_user_to_org bento', message: 'Failed to track bento event' })
  }
  return c.json(BRES)
})

// Function to verify Cloudflare Turnstile token
async function verifyCaptchaToken(c: Context, token: string, captchaSecret: string) {
  // "/siteverify" API endpoint.
  const url = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
  const result = await fetch(url, {
    body: new URLSearchParams({
      secret: captchaSecret,
      response: token,
    }),
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  })

  const captchaResult = await result.json()
  const captchaResultData = captchaSchema.safeParse(captchaResult)
  if (!captchaResultData.success) {
    throw simpleError('invalid_captcha', 'Invalid captcha result')
  }
  cloudlog({ requestId: c.get('requestId'), context: 'captcha_result', captchaResultData })
  if (captchaResultData.data.success !== true) {
    throw simpleError('invalid_captcha', 'Invalid captcha result')
  }
}
