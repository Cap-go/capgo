import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { BRES, middlewareAuth, parseBody, quickError, useCors } from '../utils/hono.ts'
import { cloudlog } from '../utils/logging.ts'
import { closeClient, getPgClient } from '../utils/pg.ts'
import { supabaseAdmin as useSupabaseAdmin } from '../utils/supabase.ts'
import { ensureOrgMembership } from './invitation_membership.ts'

export const app = new Hono<MiddlewareKeyVariables>()

app.use('/', useCors)

interface PendingInvitation {
  id: number
  org_id: string
  org_name: string
  org_logo: string | null
  role: 'read' | 'upload' | 'write' | 'admin' | 'super_admin'
  rbac_role_name: string | null
  use_new_rbac: boolean
}

interface PendingInvitationAction {
  action?: 'accept' | 'decline' | 'decline_all'
  invitation_id?: number
}

function isErrorResponse(value: unknown): value is Response {
  return value instanceof Response
}

async function getAuthenticatedEmail(supabaseAdmin: ReturnType<typeof useSupabaseAdmin>, userId: string) {
  const { data: authUserData, error: authUserError } = await supabaseAdmin.auth.admin.getUserById(userId)
  if (authUserError) {
    return quickError(500, 'failed_to_load_pending_invitations', 'Failed to load authenticated user', { error: authUserError.message })
  }

  return authUserData.user?.email?.trim().toLowerCase() ?? ''
}

async function getPendingInvitations(c: Context<MiddlewareKeyVariables>, email: string, invitationId?: number) {
  const pgClient = getPgClient(c)
  try {
    const params: Array<string | number> = [email]
    const idFilter = invitationId === undefined ? '' : 'AND tmp.id = $2'
    if (invitationId !== undefined)
      params.push(invitationId)

    const result = await pgClient.query<PendingInvitation>(
      `SELECT
          tmp.id,
          tmp.org_id,
          tmp.role,
          tmp.rbac_role_name,
          orgs.name AS org_name,
          orgs.logo AS org_logo,
          orgs.use_new_rbac
        FROM public.tmp_users tmp
        JOIN public.orgs orgs ON orgs.id = tmp.org_id
        WHERE lower(trim(tmp.email)) = $1
          ${idFilter}
          AND tmp.cancelled_at IS NULL
          AND GREATEST(tmp.updated_at, tmp.created_at) > now() - interval '7 days'
        ORDER BY GREATEST(tmp.updated_at, tmp.created_at) DESC`,
      params,
    )

    return result.rows
  }
  catch (error) {
    return quickError(500, 'failed_to_load_pending_invitations', 'Failed to load pending invitations', { error })
  }
  finally {
    closeClient(c, pgClient)
  }
}

app.get('/', middlewareAuth, async (c) => {
  const auth = c.get('auth')
  if (!auth?.userId)
    return quickError(401, 'not_authorized', 'Not authorized')

  const supabaseAdmin = useSupabaseAdmin(c)
  const email = await getAuthenticatedEmail(supabaseAdmin, auth.userId)
  if (isErrorResponse(email))
    return email
  if (!email)
    return quickError(400, 'missing_email', 'Authenticated user has no email')

  const invitations = await getPendingInvitations(c, email)
  if (isErrorResponse(invitations))
    return invitations

  return c.json({
    ...BRES,
    invitations: invitations.map(invitation => ({
      id: invitation.id,
      org_id: invitation.org_id,
      org_name: invitation.org_name,
      org_logo: invitation.org_logo,
      role: invitation.rbac_role_name ?? invitation.role,
    })),
  })
})

app.post('/', middlewareAuth, async (c) => {
  const auth = c.get('auth')
  if (!auth?.userId)
    return quickError(401, 'not_authorized', 'Not authorized')

  const body = await parseBody<PendingInvitationAction>(c)
  const action = body.action
  if (action !== 'accept' && action !== 'decline' && action !== 'decline_all')
    return quickError(400, 'invalid_action', 'Invalid invitation action')

  const supabaseAdmin = useSupabaseAdmin(c)
  const email = await getAuthenticatedEmail(supabaseAdmin, auth.userId)
  if (isErrorResponse(email))
    return email
  if (!email)
    return quickError(400, 'missing_email', 'Authenticated user has no email')

  if (action === 'decline_all') {
    const invitations = await getPendingInvitations(c, email)
    if (isErrorResponse(invitations))
      return invitations

    const declinedOrgIds: string[] = []

    for (const invitation of invitations) {
      const { error: declineError } = await supabaseAdmin
        .from('tmp_users')
        .update({ cancelled_at: new Date().toISOString() })
        .eq('id', invitation.id)

      if (declineError) {
        return quickError(500, 'failed_to_decline_pending_invitation', 'Failed to decline pending invitation', { error: declineError.message })
      }

      declinedOrgIds.push(invitation.org_id)
    }

    return c.json({
      ...BRES,
      declined_count: declinedOrgIds.length,
      declined_org_ids: declinedOrgIds,
    })
  }

  if (!body.invitation_id)
    return quickError(400, 'missing_invitation_id', 'Missing invitation id')

  const invitations = await getPendingInvitations(c, email, body.invitation_id)
  if (isErrorResponse(invitations))
    return invitations

  const invitation = invitations[0]
  if (!invitation)
    return quickError(404, 'pending_invitation_not_found', 'Pending invitation not found')

  if (action === 'decline') {
    const { error: declineError } = await supabaseAdmin
      .from('tmp_users')
      .update({ cancelled_at: new Date().toISOString() })
      .eq('id', invitation.id)

    if (declineError) {
      return quickError(500, 'failed_to_decline_pending_invitation', 'Failed to decline pending invitation', { error: declineError.message })
    }

    return c.json({
      ...BRES,
      declined_org_id: invitation.org_id,
    })
  }

  const { data: existingMembership, error: existingMembershipError } = await supabaseAdmin
    .from('org_users')
    .select('id, user_right')
    .eq('user_id', auth.userId)
    .eq('org_id', invitation.org_id)
    .is('app_id', null)
    .is('channel_id', null)
    .maybeSingle()

  if (existingMembershipError) {
    return quickError(500, 'failed_to_accept_pending_invitation', 'Failed to check existing org membership', { error: existingMembershipError.message })
  }

  const alreadyJoined = existingMembership?.user_right
    && !existingMembership.user_right.startsWith('invite_')
  if (!alreadyJoined) {
    const membershipResult = await ensureOrgMembership(supabaseAdmin, auth.userId, invitation, {
      use_new_rbac: invitation.use_new_rbac,
    })
    if (isErrorResponse(membershipResult))
      return membershipResult
  }

  const { error: tmpUserDeleteError } = await supabaseAdmin
    .from('tmp_users')
    .delete()
    .eq('id', invitation.id)

  if (tmpUserDeleteError) {
    return quickError(500, 'failed_to_accept_pending_invitation', 'Failed to delete accepted invitation', { error: tmpUserDeleteError.message })
  }

  cloudlog({
    requestId: c.get('requestId'),
    message: 'Accepted pending organization invitation',
    userId: auth.userId,
    orgId: invitation.org_id,
  })

  return c.json({
    ...BRES,
    accepted_org_id: invitation.org_id,
  })
})
