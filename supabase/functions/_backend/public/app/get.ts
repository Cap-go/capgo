import type { Context } from '@hono/hono'
import type { Database } from '../../utils/supabase.types.ts'
import { hasAppRightApikey, supabaseAdmin } from '../../utils/supabase.ts'
import { fetchLimit } from '../../utils/utils.ts'
import { cloudlog, cloudlogErr } from '../../utils/loggin.ts'

export async function get(c: Context, appId: string, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  if (!appId) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot get app Missing app_id' })
    return c.json({ status: 'Missing app_id' }, 400)
  }
  cloudlog({ requestId: c.get('requestId'), message: 'apikeysubkey', apikey }) 

  if (!(await hasAppRightApikey(c, appId, apikey.user_id, 'read', apikey.key))) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot get app, You can\'t access this app', app_id: appId })
    return c.json({ status: 'You can\'t access this app', app_id: appId }, 400)
  }
  if (apikey.limited_to_apps && apikey.limited_to_apps.length > 0 && !apikey.limited_to_apps.includes(appId)) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot get app, You can\'t access this app', app_id: appId })
    return c.json({ status: 'You can\'t access this app', app_id: appId }, 400)
  }

  try {
    const { data, error: dbError } = await supabaseAdmin(c)
      .from('apps')
      .select('*')
      .eq('app_id', appId)
      .single()

    if (dbError || !data) {
      cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot find app', error: dbError })
      return c.json({ status: 'Cannot find app', error: JSON.stringify(dbError) }, 404)
    }

    return c.json(data)
  }
  catch (e) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot get app', error: e })
    return c.json({ status: 'Cannot get app', error: JSON.stringify(e) }, 500)
  }
}

export async function getAll(c: Context, apikey: Database['public']['Tables']['apikeys']['Row'], page?: number, limit?: number, orgId?: string): Promise<Response> {
  try {
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
        cloudlogErr({ requestId: c.get('requestId'), message: 'User does not have access to this organization', org_id: orgId })
        return c.json({ status: 'You do not have access to this organization' }, 403)
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
        cloudlogErr({ requestId: c.get('requestId'), message: 'Cannot get user organizations', error: orgsError })
        return c.json({ status: 'Cannot get user organizations', error: JSON.stringify(orgsError) }, 500)
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
      console.error('Cannot get apps', dbError)
      return c.json({ status: 'Cannot get apps', error: JSON.stringify(dbError) }, 400)
    }

    return c.json(data)
  }
  catch (e) {
    console.error('Cannot get apps', e)
    return c.json({ status: 'Cannot get apps', error: JSON.stringify(e) }, 500)
  }
}
