import type { Context } from 'hono'
import type { Database } from '../../utils/supabase.types.ts'
import { quickError, simpleError } from '../../utils/hono.ts'
import { hasOrgRightApikey, supabaseApikey } from '../../utils/supabase.ts'

export interface CreateApp {
  app_id: string
  name: string
  owner_org: string
  icon?: string
}

export async function post(c: Context, body: CreateApp, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  if (!body.name) {
    throw simpleError('missing_name', 'Missing name', { body })
  }

  // Check if the user is allowed to create an app in this organization
  const userId = apikey.user_id
  if (body.owner_org && !(await hasOrgRightApikey(c, body.owner_org, userId, 'write', c.get('capgkey') as string))) {
    throw quickError(403, 'cannot_access_organization', 'You can\'t access this organization', { org_id: body.owner_org })
  }

  const dataInsert = {
    owner_org: body.owner_org,
    app_id: body.app_id,
    icon_url: body.icon ?? '',
    name: body.name,
    retention: 2592000,
    default_upload_channel: 'dev',
  }
  // Use anon client with capgkey header; RLS will authorize insert based on org rights
  const { data, error: dbError } = await supabaseApikey(c, apikey.key)
    .from('apps')
    .insert(dataInsert)
    .select()
    .single()

  if (dbError) {
    throw simpleError('cannot_create_app', 'Cannot create app', { supabaseError: dbError })
  }

  return c.json(data)
}
