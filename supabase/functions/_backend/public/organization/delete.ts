import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../../utils/hono.ts'
import type { Database } from '../../utils/supabase.types.ts'
import { quickError, simpleError } from '../../utils/hono.ts'
import { checkPermission } from '../../utils/rbac.ts'
import { supabaseApikey } from '../../utils/supabase.ts'

interface DeleteOrganizationParams {
  orgId?: string
}

export async function deleteOrg(c: Context<MiddlewareKeyVariables>, body: DeleteOrganizationParams, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  const orgId = body.orgId

  if (!orgId) {
    throw simpleError('missing_org_id', 'Missing orgId')
  }

  // Check if user has right to delete the organization (requires super_admin equivalent)
  // Auth context is already set by middlewareKey
  if (!(await checkPermission(c, 'org.update_settings', { orgId }))) {
    throw quickError(403, 'invalid_org_id', 'You can\'t delete this organization', { org_id: orgId })
  }

  const { error } = await supabaseApikey(c, apikey.key)
    .from('orgs')
    .delete()
    .eq('id', orgId)

  if (error) {
    throw simpleError('cannot_delete_organization', 'Cannot delete organization', { error })
  }

  return c.json({ status: 'Organization deleted' })
}
