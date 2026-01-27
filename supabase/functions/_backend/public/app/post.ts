import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../../utils/hono.ts'
import type { Database } from '../../utils/supabase.types.ts'
import { quickError, simpleError } from '../../utils/hono.ts'
import { checkPermission } from '../../utils/rbac.ts'
import { sanitizeOptionalText, sanitizeText } from '../../utils/sanitize.ts'
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
  const sanitizedName = sanitizeText(body.name)
  if (!sanitizedName) {
    throw simpleError('missing_name', 'Missing name', { body })
  }

  // Check if the user is allowed to create an app in this organization (auth context set by middlewareKey)
  if (body.owner_org && !(await checkPermission(c, 'org.update_settings', { orgId: body.owner_org }))) {
    throw quickError(403, 'cannot_access_organization', 'You can\'t access this organization', { org_id: body.owner_org })
  }

  const dataInsert = {
    owner_org: body.owner_org,
    app_id: body.app_id,
    icon_url: sanitizeOptionalText(body.icon) ?? '',
    name: sanitizedName,
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
