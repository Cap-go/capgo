import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../../utils/hono.ts'
import type { Database } from '../../utils/supabase.types.ts'
import { quickError, simpleError } from '../../utils/hono.ts'
import { checkPermission } from '../../utils/rbac.ts'
import { createSignedImageUrl, normalizeImagePath } from '../../utils/storage.ts'
import { supabaseApikey } from '../../utils/supabase.ts'
import { isValidAppId } from '../../utils/utils.ts'

export interface CreateApp {
  app_id: string
  name: string
  owner_org: string
  icon?: string
}

export async function post(c: Context<MiddlewareKeyVariables>, body: CreateApp, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  if (!body.app_id) {
    throw simpleError('missing_app_id', 'Missing app_id', { body })
  }
  if (!isValidAppId(body.app_id)) {
    throw simpleError('invalid_app_id', 'App ID must be a reverse domain string', { app_id: body.app_id })
  }
  if (!body.name) {
    throw simpleError('missing_name', 'Missing name', { body })
  }

  // Check if the user is allowed to create an app in this organization (auth context set by middlewareKey)
  if (body.owner_org && !(await checkPermission(c, 'org.update_settings', { orgId: body.owner_org }))) {
    throw quickError(403, 'cannot_access_organization', 'You can\'t access this organization', { org_id: body.owner_org })
  }

  const normalizedIcon = normalizeImagePath(body.icon ?? '')
  const dataInsert = {
    owner_org: body.owner_org,
    app_id: body.app_id,
    icon_url: normalizedIcon ?? '',
    name: body.name,
    retention: 2592000,
    default_upload_channel: 'dev',
  }
  // Use anon client with capgkey header; RLS will authorize insert based on org rights
  const supabase = supabaseApikey(c, apikey.key)
  const { error: dbError } = await supabase
    .from('apps')
    .insert(dataInsert)

  if (dbError) {
    throw simpleError('cannot_create_app', 'Cannot create app', { supabaseError: dbError })
  }

  const { data, error: fetchError } = await supabase
    .from('apps')
    .select()
    .eq('app_id', body.app_id)
    .single()

  if (fetchError || !data) {
    throw simpleError('cannot_read_app', 'Cannot read created app', { supabaseError: fetchError })
  }

  if (data.icon_url) {
    const signedIcon = await createSignedImageUrl(c, data.icon_url)
    data.icon_url = signedIcon ?? ''
  }

  return c.json(data)
}
