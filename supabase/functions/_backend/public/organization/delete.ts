import type { Context } from 'hono'
import type { Database } from '../../utils/supabase.types.ts'
import { quickError, simpleError } from '../../utils/hono.ts'
import { hasOrgRightApikey, supabaseAdmin } from '../../utils/supabase.ts'

interface DeleteOrganizationParams {
  orgId?: string
}

export async function deleteOrg(c: Context, body: DeleteOrganizationParams, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  const orgId = c.req.query('orgId') ?? body.orgId

  if (!orgId) {
    throw simpleError('missing_org_id', 'Missing orgId')
  }

  // Check if user has right to delete the organization
  const userId = apikey.user_id
  if (!(await hasOrgRightApikey(c, orgId, userId, 'super_admin', c.get('capgkey') as string))) {
    throw quickError(403, 'invalid_org_id', 'You can\'t delete this organization', { org_id: orgId })
  }

  const { error } = await supabaseAdmin(c)
    .from('orgs')
    .delete()
    .eq('id', orgId)

  if (error) {
    throw simpleError('cannot_delete_organization', 'Cannot delete organization', { error })
  }

  return c.json({ status: 'Organization deleted' })
}
