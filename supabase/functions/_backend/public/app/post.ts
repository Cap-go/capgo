import type { Context } from '@hono/hono'
import type { Database } from '../../utils/supabase.types.ts'
import { hasOrgRightApikey, supabaseAdmin } from '../../utils/supabase.ts'

export interface CreateApp {
  name: string
  owner_org: string
  icon?: string
}

export async function post(c: Context, body: CreateApp, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  if (!body.name) {
    console.error('Missing name')
    return c.json({ status: 'Missing name' }, 400)
  }

  // Check if the user is allowed to create an app in this organization
  const userId = apikey.user_id
  if (body.owner_org && !(await hasOrgRightApikey(c, body.owner_org, userId, 'write', c.get('capgkey') as string))) {
    console.error('You can\'t access this organization', body.owner_org)
    return c.json({ status: 'You can\'t access this organization', orgId: body.owner_org }, 403)
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
