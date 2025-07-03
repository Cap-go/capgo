import type { Context } from 'hono'
import type { Database } from '../../utils/supabase.types.ts'
import { simpleError } from '../../utils/hono.ts'
import { hasAppRightApikey, supabaseAdmin } from '../../utils/supabase.ts'
import { fetchLimit } from '../../utils/utils.ts'

export async function get(c: Context, appId: string, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  if (!appId) {
    throw simpleError('missing_app_id', 'Missing app_id', { appId })
  }

  if (!(await hasAppRightApikey(c, appId, apikey.user_id, 'read', apikey.key))) {
    throw simpleError('cannot_get_app', 'You can\'t access this app', { app_id: appId })
  }
  if (apikey.limited_to_apps && apikey.limited_to_apps.length > 0 && !apikey.limited_to_apps.includes(appId)) {
    throw simpleError('cannot_get_app', 'You can\'t access this app', { app_id: appId })
  }

  const { data, error: dbError } = await supabaseAdmin(c)
    .from('apps')
    .select('*')
    .eq('app_id', appId)
    .single()

  if (dbError || !data) {
    throw simpleError('cannot_find_app', 'Cannot find app', { supabaseError: dbError })
  }

  return c.json(data)
}

export async function getAll(c: Context, apikey: Database['public']['Tables']['apikeys']['Row'], page?: number, limit?: number, orgId?: string): Promise<Response> {
  // Default limit to 50 if not specified
  const itemsPerPage = limit ?? fetchLimit
  const currentPage = page ?? 0
  const offset = currentPage * itemsPerPage

  let query = supabaseAdmin(c)
    .from('apps')
    .select('*')

  // If a specific org_id is provided, filter by it
  if (orgId) {
    // Check if user has access to this organization
    const hasOrgAccess = await supabaseAdmin(c)
      .rpc('is_member_of_org', {
        user_id: apikey.user_id,
        org_id: orgId,
      })
      .single()

    if (!hasOrgAccess.data) {
      throw simpleError('user_does_not_have_access_to_this_organization', 'You do not have access to this organization', { org_id: orgId })
    }

    query = query.eq('owner_org', orgId)
  }
  // If the user has limited access to specific apps, filter by those
  else if (apikey.limited_to_apps && apikey.limited_to_apps.length > 0) {
    query = query.in('app_id', apikey.limited_to_apps)
  }
  // If the user has limited access to specific orgs, filter by those
  else if (apikey.limited_to_orgs && apikey.limited_to_orgs.length > 0) {
    query = query.in('owner_org', apikey.limited_to_orgs)
  }
  // Otherwise, get all organizations the user is a member of and filter by those
  else {
    // Get list of orgs the user is a member of
    const { data: userOrgs, error: orgsError } = await supabaseAdmin(c)
      .from('org_users')
      .select('org_id')
      .eq('user_id', apikey.user_id)

    if (orgsError) {
      throw simpleError('cannot_get_user_organizations', 'Cannot get user organizations', { supabaseError: orgsError })
    }

    if (userOrgs && userOrgs.length > 0) {
      const orgIds = userOrgs.map(org => org.org_id)
      query = query.in('owner_org', orgIds)
    }
  }

  // Apply pagination after filtering
  query = query.range(offset, offset + itemsPerPage - 1)

  const { data, error: dbError } = await query

  if (dbError) {
    throw simpleError('cannot_get_apps', 'Cannot get apps', { supabaseError: dbError })
  }

  return c.json(data)
}
