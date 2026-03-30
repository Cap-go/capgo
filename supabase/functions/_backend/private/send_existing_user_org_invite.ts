import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { z } from 'zod/mini'
import { trackBentoEvent } from '../utils/bento.ts'
import { BRES, middlewareAuth, parseBody, quickError, simpleError, useCors } from '../utils/hono.ts'
import { checkPermission } from '../utils/rbac.ts'
import { supabaseAdmin } from '../utils/supabase.ts'
import { getEnv } from '../utils/utils.ts'

const sendInviteSchema = z.object({
  email: z.email(),
  org_id: z.string().check(z.minLength(1)),
})

export const app = new Hono<MiddlewareKeyVariables>()

app.use('/', useCors)

async function validateRequest(c: Context, rawBody: unknown) {
  const validationResult = sendInviteSchema.safeParse(rawBody)
  if (!validationResult.success) {
    throw simpleError('invalid_request', 'Invalid request', { errors: z.prettifyError(validationResult.error) })
  }

  const body = validationResult.data
  const canInviteUser = await checkPermission(c, 'org.invite_user', { orgId: body.org_id })
  const canUpdateUserRoles = await checkPermission(c, 'org.update_user_roles', { orgId: body.org_id })

  if (!canInviteUser && !canUpdateUserRoles) {
    return quickError(403, 'not_authorized', 'Not authorized', {
      requiredPermission: 'org.invite_user',
      orgId: body.org_id,
    })
  }

  return { body, canUpdateUserRoles }
}

app.post('/', middlewareAuth, async (c) => {
  const rawBody = await parseBody<unknown>(c)
  const validation = await validateRequest(c, rawBody)

  if (validation instanceof Response)
    return validation

  const { body, canUpdateUserRoles } = validation
  const authContext = c.get('auth')
  const inviterId = authContext?.userId
  if (!inviterId) {
    return quickError(401, 'not_authorized', 'Not authorized')
  }

  const supabaseAdminClient = supabaseAdmin(c)

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

  const { data: inviter, error: inviterError } = await supabaseAdminClient
    .from('users')
    .select('id, first_name, last_name')
    .eq('id', inviterId)
    .maybeSingle()

  if (inviterError) {
    return quickError(500, 'failed_to_invite_user', 'Failed to fetch inviter', { error: inviterError.message })
  }

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

  const { data: membership, error: membershipError } = await supabaseAdminClient
    .from('org_users')
    .select('id, user_right')
    .eq('org_id', body.org_id)
    .eq('user_id', invitedUser.id)
    .maybeSingle()

  if (membershipError) {
    return quickError(500, 'failed_to_invite_user', 'Failed to fetch organization membership', { error: membershipError.message })
  }

  if (!membership) {
    return quickError(404, 'invite_not_found', 'Pending invitation not found')
  }

  if (!membership.user_right?.startsWith('invite_')) {
    return quickError(409, 'invite_already_accepted', 'Invitation already accepted')
  }

  if (membership.user_right === 'invite_super_admin' && !canUpdateUserRoles) {
    return quickError(403, 'not_authorized', 'Not authorized', {
      requiredPermission: 'org.update_user_roles',
      orgId: body.org_id,
    })
  }

  const inviterName = [inviter?.first_name, inviter?.last_name].filter(Boolean).join(' ').trim() || 'Capgo team'
  const invitedFirstName = invitedUser.first_name?.trim() || body.email.split('@')[0] || ''
  const invitedLastName = invitedUser.last_name?.trim() || ''

  const bentoEvent = await trackBentoEvent(c, invitedUser.email, {
    org_admin_name: inviterName,
    org_name: org.name,
    invite_link: `${getEnv(c, 'WEBAPP_URL')}/dashboard?invite_org=${body.org_id}`,
    invited_first_name: invitedFirstName,
    invited_last_name: invitedLastName,
  }, 'org:invite_existing_capgo_user_to_org')

  if (bentoEvent === false) {
    return quickError(500, 'failed_to_send_invite_email', 'Failed to send invitation email')
  }

  return c.json(BRES)
})
