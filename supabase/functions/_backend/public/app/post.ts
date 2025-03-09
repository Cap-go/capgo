import type { Context } from '@hono/hono'
import type { Database } from '../../utils/supabase.types.ts'
import { supabaseAdmin } from '../../utils/supabase.ts'

export interface CreateApp {
  name: string
  icon?: string
  owner_org: string
}

export async function post(c: Context, body: CreateApp, _apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  if (!body.name) {
    console.error('Missing name')
    return c.json({ status: 'Missing name' }, 400)
  }

  // Check if the user is allowed to create an app in this organization
  const userId = _apikey.user_id
  const { data: isAllowed, error: permError } = await supabaseAdmin(c)
    .rpc('is_member_of_org', {
      user_id: userId,
      org_id: body.owner_org,
    })

  const { data: isOwner, error: ownerError } = await supabaseAdmin(c)
    .rpc('is_owner_of_org', {
      user_id: userId,
      org_id: body.owner_org,
    })

  if (permError || ownerError) {
    console.error('Error checking organization permissions', permError || ownerError)
    return c.json({ status: 'Error checking organization permissions' }, 500)
  }

  if (!isAllowed && !isOwner) {
    console.error('User not authorized to create app in this organization')
    return c.json({ status: 'Not authorized to create app in this organization' }, 403)
  }

  const dataInsert = {
    owner_org: body.owner_org,
    app_id: body.name,
    icon_url: body.icon || '',
    name: body.name,
    retention: 2592000,
    default_upload_channel: 'dev',
  }
  try {
    const { data, error: dbError } = await supabaseAdmin(c)
      .from('apps')
      .insert(dataInsert)
      .select()
      .single()

    if (dbError) {
      console.error('Cannot create app', dbError, dataInsert)
      return c.json({ status: 'Cannot create app', error: JSON.stringify(dbError) }, 400)
    }

    return c.json(data)
  }
  catch (e) {
    console.error('Cannot create app', e)
    return c.json({ status: 'Cannot create app', error: JSON.stringify(e) }, 500)
  }
}
