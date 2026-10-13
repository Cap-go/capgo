import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { z } from 'zod'
import { BRES, createHono, parseBody, quickError, useCors } from '../utils/hono.ts'
import { middlewareAuth } from '../utils/hono_jwt.ts'
import { cloudlog } from '../utils/logging.ts'
import { closeClient, getPgClient } from '../utils/pg.ts'
import { canCallerAssignOrgRole, checkPermission } from '../utils/rbac.ts'
import { safeParseSchema } from '../utils/schema_validation.ts'
import { supabaseAdmin } from '../utils/supabase.ts'
import { version } from '../utils/version.ts'

const inviteExistingUserSchema = z.object({
  email: z.email(),
  org_id: z.string().min(1),
})
const INVITE_RESEND_COOLDOWN_MINUTES = 5

type AppContext = Context<MiddlewareKeyVariables>

export const app = createHono('', version)

app.use('/', useCors)

function maskEmail(email: string) {
  const [localPart, domain = ''] = email.trim().toLowerCase().split('@')
  if (!localPart)
    return `***@${domain}`
  return `${localPart[0]}***@${domain}`
}

export function getInviteResendRequiredPermission(
  roleName: string | null | undefined,
  canInviteUser: boolean,
  canUpdateUserRoles: boolean,
) {
  if (!roleName?.trim())
    return null
  if (roleName === 'org_super_admin')
    return canUpdateUserRoles ? null : 'org.update_user_roles'
  return canInviteUser ? null : 'org.invite_user'
}

async function validateRequest(c: AppContext, rawBody: unknown) {
  const validationResult = safeParseSchema(inviteExistingUserSchema, rawBody)
  if (!validationResult.success)
    return quickError(400, 'invalid_request', 'Invalid request', { errors: validationResult.error.message })

  const body = validationResult.data
  // Check org-scoped permissions before fetching org details so this endpoint
  // does not become an organization-existence oracle for arbitrary ids.
  const canInviteUser = await checkPermission(c, 'org.invite_user', { orgId: body.org_id })
  const canUpdateUserRoles = await checkPermission(c, 'org.update_user_roles', { orgId: body.org_id })

  if (!canInviteUser && !canUpdateUserRoles) {
    return quickError(403, 'not_authorized', 'Not authorized', {
      requiredPermission: 'org.invite_user',
      orgId: body.org_id,
    })
  }

  return { body, canInviteUser, canUpdateUserRoles }
}

app.post('/', middlewareAuth, async (c) => {
  const requestId = c.get('requestId')
  const rawBody = await parseBody<unknown>(c)
  const validation = await validateRequest(c, rawBody)

  const { body, canInviteUser, canUpdateUserRoles } = validation
  const authContext = c.get('auth')
  const inviterId = authContext?.userId
  if (!inviterId) {
    cloudlog({ requestId, context: 'invite_existing_user_to_org unauthorized_inviter' })
    return quickError(401, 'not_authorized', 'Not authorized')
  }

  cloudlog({
    requestId,
    context: 'invite_existing_user_to_org validated body',
    inviterId,
    canUpdateUserRoles,
    body: {
      email: maskEmail(body.email),
      org_id: body.org_id,
    },
  })

  const supabaseAdminClient = supabaseAdmin(c)

  cloudlog({ requestId, context: 'invite_existing_user_to_org fetch organization', orgId: body.org_id })
  const { data: org, error: orgError } = await supabaseAdminClient
    .from('orgs')
    .select('id, name')
    .eq('id', body.org_id)
    .maybeSingle()

  if (orgError) {
    return quickError(500, 'failed_to_invite_user', 'Failed to fetch organization', { error: orgError.message })
  }

  if (!org) {
    return quickError(404, 'organization_not_found', 'Organization not found')
  }

  cloudlog({
    requestId,
    context: 'invite_existing_user_to_org fetch invited user',
    orgId: body.org_id,
    invitedEmail: maskEmail(body.email),
  })
  const { data: invitedUser, error: invitedUserError } = await supabaseAdminClient
    .from('users')
    .select('id, email, first_name, last_name')
    .eq('email', body.email)
    .maybeSingle()

  if (invitedUserError) {
    return quickError(500, 'failed_to_invite_user', 'Failed to fetch invited user', { error: invitedUserError.message })
  }

  if (!invitedUser) {
    return quickError(404, 'user_not_found', 'User not found')
  }

  cloudlog({
    requestId,
    context: 'invite_existing_user_to_org fetch membership',
    orgId: body.org_id,
    invitedUserId: invitedUser.id,
  })
  const { data: membership, error: membershipError } = await supabaseAdminClient
    .from('org_users')
    .select('id, is_invite, rbac_role_name')
    .eq('org_id', body.org_id)
    .eq('user_id', invitedUser.id)
    .maybeSingle()

  if (membershipError) {
    return quickError(500, 'failed_to_invite_user', 'Failed to fetch organization membership', { error: membershipError.message })
  }

  if (!membership) {
    return quickError(404, 'invite_not_found', 'Pending invitation not found')
  }

  if (!membership.is_invite) {
    return quickError(409, 'invite_already_accepted', 'Invitation already accepted')
  }

  if (!membership.rbac_role_name) {
    return quickError(500, 'failed_to_invite_user', 'Invitation has no RBAC role')
  }

  const missingPermission = getInviteResendRequiredPermission(
    membership.rbac_role_name,
    canInviteUser,
    canUpdateUserRoles,
  )

  if (missingPermission) {
    return quickError(403, 'not_authorized', 'Not authorized', {
      requiredPermission: missingPermission,
      orgId: body.org_id,
    })
  }

  const canManageInviteRole = await canCallerAssignOrgRole(
    c,
    body.org_id,
    membership.rbac_role_name,
  )
  if (!canManageInviteRole) {
    return quickError(403, 'not_authorized', 'Not authorized', {
      requiredPermission: 'org.update_user_roles',
      orgId: body.org_id,
    })
  }

  const pgPool = await getPgClient(c)
  try {
    const { rows } = await pgPool.query<{ status: string }>(
      'SELECT public.queue_org_invitation_email($1, $2::bigint, $3::uuid) AS status',
      ['existing', membership.id, inviterId],
    )
    if (rows[0]?.status === 'COOLDOWN') {
      return quickError(409, 'user_already_invited', 'User already invited recently. Please wait before resending.', {
        reason: 'invite_recently_sent',
        cooldown_minutes: INVITE_RESEND_COOLDOWN_MINUTES,
      })
    }
    if (rows[0]?.status === 'NOT_PENDING')
      return quickError(409, 'invite_already_accepted', 'Invitation is no longer pending')
    if (rows[0]?.status !== 'QUEUED')
      return quickError(500, 'failed_to_send_invite_email', 'Failed to queue invitation email')
  }
  finally {
    closeClient(c, pgPool)
  }

  cloudlog({ requestId, context: 'invite_existing_user_to_org queued', orgId: body.org_id, invitationId: membership.id })

  return c.json(BRES)
})
