import type { Context } from '@hono/hono'
import type { Database } from '../../utils/supabase.types.ts'
import { hasAppRightApikey, supabaseAdmin } from '../../utils/supabase.ts'

export async function get(c: Context, appId: string, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  if (!appId) {
    console.error('Cannot get app', 'Missing app_id')
    return c.json({ status: 'Missing app_id' }, 400)
  }

  if (!(await hasAppRightApikey(c, appId, apikey.user_id, 'read', apikey.key))) {
    console.error('Cannot get app', 'You can\'t access this app', appId)
    return c.json({ status: 'You can\'t access this app', app_id: appId }, 400)
  }

  try {
    const { data, error: dbError } = await supabaseAdmin(c)
      .from('apps')
      .select('*')
      .eq('app_id', appId)
      .single()

    if (dbError || !data) {
      console.error('Cannot find app', dbError)
      return c.json({ status: 'Cannot find app', error: JSON.stringify(dbError) }, 404)
    }

    return c.json(data)
  }
  catch (e) {
    console.error('Cannot get app', e)
    return c.json({ status: 'Cannot get app', error: JSON.stringify(e) }, 500)
  }
}

export async function getAll(c: Context, apikey: Database['public']['Tables']['apikeys']['Row'], page?: number, limit?: number): Promise<Response> {
  try {
    // Default limit to 50 if not specified
    const itemsPerPage = limit || 50
    const currentPage = page || 0
    const offset = currentPage * itemsPerPage

    let query = supabaseAdmin(c)
      .from('apps')
      .select('*')
      .range(offset, offset + itemsPerPage - 1)

    // Filter apps by user permissions
    // If the user has limited access to specific apps, filter by those
    if (apikey.limited_to_apps && apikey.limited_to_apps.length > 0) {
      query = query.in('app_id', apikey.limited_to_apps)
    }
    // If the user has limited access to specific orgs, filter by those
    else if (apikey.limited_to_orgs && apikey.limited_to_orgs.length > 0) {
      query = query.in('owner_org', apikey.limited_to_orgs)
    }

    const { data, error: dbError } = await query

    if (dbError) {
      console.error('Cannot get apps', dbError)
      return c.json({ status: 'Cannot get apps', error: JSON.stringify(dbError) }, 400)
    }

    return c.json({ data })
  }
  catch (e) {
    console.error('Cannot get apps', e)
    return c.json({ status: 'Cannot get apps', error: JSON.stringify(e) }, 500)
  }
}
