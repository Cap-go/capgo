import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../../../utils/hono.ts'
import type { Database } from '../../../utils/supabase.types.ts'
import { z } from 'zod/mini'
import { BRES, quickError, simpleError } from '../../../utils/hono.ts'
import { cloudlog } from '../../../utils/logging.ts'
import { checkPermission } from '../../../utils/rbac.ts'
import { supabaseAdmin, supabaseApikey } from '../../../utils/supabase.ts'

const deleteBodySchema = z.object({
  orgId: z.string(),
  email: z.email(),
})

export async function deleteMember(c: Context<MiddlewareKeyVariables>, bodyRaw: any, _apikey: Database['public']['Tables']['apikeys']['Row']) {
  const bodyParsed = deleteBodySchema.safeParse(bodyRaw)
  if (!bodyParsed.success) {
    throw simpleError('invalid_body', 'Invalid body', { error: bodyParsed.error })
  }
  const body = bodyParsed.data

  // Auth context is already set by middlewareKey
  if (!(await checkPermission(c, 'org.update_user_roles', { orgId: body.orgId }))) {
    throw simpleError('cannot_access_organization', 'You can\'t access this organization', { orgId: body.orgId })
  }

  // Use admin client to lookup user by email - RLS on users table prevents cross-user lookups
  const { data: userData, error: userError } = await supabaseAdmin(c)
    .from('users')
    .select('id')
    .eq('email', body.email)
    .single()

  if (userError || !userData) {
    throw quickError(404, 'user_not_found', 'User not found', { error: userError })
  }

  // Use authenticated client for the delete operation - RLS will enforce org access
  const supabase = supabaseApikey(c, c.get('capgkey') as string)
  cloudlog({ requestId: c.get('requestId'), message: 'userData.id', data: userData.id })
  cloudlog({ requestId: c.get('requestId'), message: 'body.orgId', data: body.orgId })
  const { data: deletedMembership, error } = await supabase
    .from('org_users')
    .delete()
    .select('org_id, user_id')
    .eq('user_id', userData.id)
    .eq('org_id', body.orgId)
    .maybeSingle()

  if (error) {
    throw simpleError('error_deleting_user_from_organization', 'Error deleting user from organization', { error })
  }

  if (!deletedMembership) {
    throw quickError(404, 'organization_member_not_found', 'User is not a member of this organization', { orgId: body.orgId, email: body.email })
  }

  // The org_users delete trigger should resync role_bindings, but keep this
  // explicit cleanup as a safety net for the advisory regression path.
  const { error: rbacError } = await supabaseAdmin(c)
    .from('role_bindings')
    .delete()
    .eq('principal_type', 'user')
    .eq('principal_id', userData.id)
    .eq('org_id', body.orgId)

  if (rbacError) {
    throw simpleError('error_deleting_role_bindings', 'Error deleting role bindings for user', { error: rbacError })
  }

  cloudlog({ requestId: c.get('requestId'), message: 'User deleted from organization', data: { user_id: userData.id, org_id: body.orgId } })
  return c.json(BRES)
}
