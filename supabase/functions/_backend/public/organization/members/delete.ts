import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../../../utils/hono.ts'
import type { Database } from '../../../utils/supabase.types.ts'
import { type } from 'arktype'
import { safeParseSchema } from '../../../utils/ark_validation.ts'
import { BRES, quickError, simpleError } from '../../../utils/hono.ts'
import { cloudlog } from '../../../utils/logging.ts'
import { closeClient, getPgClient } from '../../../utils/pg.ts'
import { checkPermission } from '../../../utils/rbac.ts'
import { supabaseAdmin } from '../../../utils/supabase.ts'

const deleteBodySchema = type({
  orgId: 'string',
  email: 'string.email',
})

export async function deleteMember(c: Context<MiddlewareKeyVariables>, bodyRaw: any, _apikey: Database['public']['Tables']['apikeys']['Row']) {
  const bodyParsed = safeParseSchema(deleteBodySchema, bodyRaw)
  if (!bodyParsed.success) {
    throw simpleError('invalid_body', 'Invalid body', { error: bodyParsed.error })
  }
  const body = bodyParsed.data
  const auth = c.get('auth')
  if (!auth?.userId) {
    throw simpleError('cannot_access_organization', 'You can\'t access this organization', { orgId: body.orgId })
  }

  // Arbitrary target lookup stays behind role-management permission to avoid user enumeration.
  const adminClient = supabaseAdmin(c)
  const canManageRoles = await checkPermission(c, 'org.update_user_roles', { orgId: body.orgId })
  let targetUserId = ''

  if (canManageRoles) {
    const { data: userData, error: userError } = await adminClient
      .from('users')
      .select('id')
      .eq('email', body.email)
      .single()

    if (userError || !userData) {
      throw quickError(404, 'user_not_found', 'User not found', { error: userError })
    }
    targetUserId = userData.id
  }
  else {
    if (auth.authType !== 'jwt') {
      throw simpleError('cannot_access_organization', 'You can\'t access this organization', { orgId: body.orgId })
    }

    const { data: callerData, error: callerError } = await adminClient
      .from('users')
      .select('id, email')
      .eq('id', auth.userId)
      .single()

    if (callerError || !callerData || callerData.email?.toLowerCase() !== body.email.toLowerCase()) {
      throw simpleError('cannot_access_organization', 'You can\'t access this organization', { orgId: body.orgId })
    }
    targetUserId = callerData.id
  }

  const { data: existingMembership, error: membershipLookupError } = await adminClient
    .from('org_users')
    .select('org_id, user_id')
    .eq('user_id', targetUserId)
    .eq('org_id', body.orgId)
    .maybeSingle()

  if (membershipLookupError) {
    throw simpleError('error_deleting_user_from_organization', 'Error finding user organization membership', { error: membershipLookupError })
  }

  if (!existingMembership) {
    throw quickError(404, 'organization_member_not_found', 'User is not a member of this organization', { orgId: body.orgId, email: body.email })
  }

  // Permission is proven above; use one transaction so RBAC bindings and org_users cannot diverge.
  const pgClient = getPgClient(c)
  cloudlog({ requestId: c.get('requestId'), message: 'targetUserId', data: targetUserId })
  cloudlog({ requestId: c.get('requestId'), message: 'body.orgId', data: body.orgId })
  try {
    await pgClient.query('BEGIN')
    await pgClient.query(
      `
      DELETE FROM public.role_bindings
      WHERE principal_type = public.rbac_principal_user()
        AND principal_id = $1::uuid
        AND org_id = $2::uuid
      `,
      [targetUserId, body.orgId],
    )

    const deletedMembership = await pgClient.query(
      `
      DELETE FROM public.org_users
      WHERE user_id = $1::uuid
        AND org_id = $2::uuid
      RETURNING org_id, user_id
      `,
      [targetUserId, body.orgId],
    )

    if (deletedMembership.rowCount !== 1) {
      await pgClient.query('ROLLBACK')
      throw quickError(404, 'organization_member_not_found', 'User is not a member of this organization', { orgId: body.orgId, email: body.email })
    }

    await pgClient.query('COMMIT')
  }
  catch (error) {
    await pgClient.query('ROLLBACK').catch(() => {})
    const message = error instanceof Error ? error.message : ''
    if (message.includes('CANNOT_DELETE_LAST_SUPER_ADMIN_BINDING')) {
      throw simpleError('CANNOT_REMOVE_LAST_SUPER_ADMIN', 'Cannot remove the last super admin from the organization', { orgId: body.orgId })
    }
    if (error instanceof Error && error.name === 'HTTPException') {
      throw error
    }
    throw simpleError('error_deleting_user_from_organization', 'Error deleting user from organization', { error })
  }
  finally {
    closeClient(c, pgClient)
  }

  cloudlog({ requestId: c.get('requestId'), message: 'User deleted from organization', data: { user_id: targetUserId, org_id: body.orgId } })
  return c.json(BRES)
}
