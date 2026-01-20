import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../../../utils/hono.ts'
import type { Database } from '../../../utils/supabase.types.ts'
import { z } from 'zod/mini'
import { BRES, simpleError } from '../../../utils/hono.ts'
import { cloudlog } from '../../../utils/logging.ts'
import { checkPermission } from '../../../utils/rbac.ts'
import { supabaseApikey } from '../../../utils/supabase.ts'

const inviteBodySchema = z.object({
  orgId: z.string(),
  email: z.email(),
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
})

type LegacyInviteRole = 'read' | 'upload' | 'write' | 'admin' | 'super_admin'
type RbacInviteRole = (typeof rbacInviteRoles)[number]

const legacyToRbac: Partial<Record<LegacyInviteRole, RbacInviteRole>> = {
  read: 'org_member',
  upload: 'org_member',
  write: 'org_member',
  admin: 'org_admin',
  super_admin: 'org_super_admin',
}

export async function post(c: Context<MiddlewareKeyVariables>, bodyRaw: any, _apikey: Database['public']['Tables']['apikeys']['Row']) {
  const bodyParsed = inviteBodySchema.safeParse(bodyRaw)
  if (!bodyParsed.success) {
    throw simpleError('invalid_body', 'Invalid body', { error: bodyParsed.error })
  }
  const body = bodyParsed.data

  // Auth context is already set by middlewareKey
  if (!(await checkPermission(c, 'org.invite_user', { orgId: body.orgId }))) {
    throw simpleError('cannot_access_organization', 'You can\'t access this organization', { orgId: body.orgId })
  }

  const supabase = supabaseApikey(c, c.get('capgkey') as string)

  const { data: org, error: orgError } = await supabase
    .from('orgs')
    .select('use_new_rbac')
    .eq('id', body.orgId)
    .single()

  if (orgError) {
    throw simpleError('cannot_access_organization', 'You can\'t access this organization', { error: orgError.message })
  }

  const useNewRbac = org?.use_new_rbac === true
  const isRbacRole = rbacInviteRoles.includes(body.invite_type as RbacInviteRole)
  const legacyInviteType = body.invite_type as LegacyInviteRole
  const rbacRoleName = isRbacRole
    ? (body.invite_type as RbacInviteRole)
    : legacyToRbac[legacyInviteType]

  if (!useNewRbac && isRbacRole) {
    throw simpleError('invalid_body', 'Invalid invite type', { invite_type: body.invite_type })
  }

  let data: string | null = null
  let error: unknown = null

  if (useNewRbac) {
    const result = await supabase.rpc('invite_user_to_org_rbac', {
      email: body.email,
      org_id: body.orgId,
      role_name: rbacRoleName ?? 'org_member',
    })
    data = result.data
    error = result.error
  }
  else {
    const legacyInviteType = body.invite_type as LegacyInviteRole
    const inviteType = `invite_${legacyInviteType}` as Database['public']['Enums']['user_min_right']
    const result = await supabase.rpc('invite_user_to_org', {
      email: body.email,
      org_id: body.orgId,
      invite_type: inviteType,
    })
    data = result.data
    error = result.error
  }

  if (error) {
    throw simpleError('error_inviting_user_to_organization', 'Error inviting user to organization', { error })
  }
  if (data && data !== 'OK') {
    throw simpleError('error_inviting_user_to_organization', 'Error inviting user to organization', { data })
  }
  cloudlog({ requestId: c.get('requestId'), message: 'User invited to organization', data: { email: body.email, org_id: body.orgId } })
  return c.json(BRES)
}
