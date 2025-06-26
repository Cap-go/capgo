import type { Context } from '@hono/hono'
import type { Database } from '../../utils/supabase.types.ts'
import { cloudlogErr } from '../../utils/loggin.ts'
import { hasOrgRightApikey, supabaseAdmin } from '../../utils/supabase.ts'

interface DeleteOrganizationParams {
  orgId?: string
}

export async function deleteOrg(c: Context, body: DeleteOrganizationParams, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  const orgId = c.req.query('orgId') ?? body.orgId

  if (!orgId) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Missing orgId' })
    return c.json({ status: 'Missing orgId' }, 400)
  }

  // Check if user has right to delete the organization
  const userId = apikey.user_id
  if (!(await hasOrgRightApikey(c, orgId, userId, 'super_admin', c.get('capgkey') as string))) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'You can\'t delete this organization', org_id: orgId })
    return c.json({ status: 'You don\'t have permission to delete this organization', orgId }, 403)
  }

  try {
    const { error } = await supabaseAdmin(c)
      .from('orgs')
      .delete()
      .eq('id', orgId)

    if (error) {
      cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot delete organization', error })
      return c.json({ status: 'Cannot delete organization', error: JSON.stringify(error) }, 400)
    }

    return c.json({ status: 'Organization deleted' })
  }
  catch (e) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot delete organization', error: e })
    return c.json({ status: 'Cannot delete organization', error: JSON.stringify(e) }, 500)
  }
}
