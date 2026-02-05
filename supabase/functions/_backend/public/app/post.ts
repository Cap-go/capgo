import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../../utils/hono.ts'
import type { Database } from '../../utils/supabase.types.ts'
import { quickError, simpleError } from '../../utils/hono.ts'
import { closeClient, getPgClient, logPgError } from '../../utils/pg.ts'
import { checkPermission } from '../../utils/rbac.ts'
import { createSignedImageUrl, normalizeImagePath } from '../../utils/storage.ts'
import { isValidAppId } from '../../utils/utils.ts'

export interface CreateApp {
  app_id: string
  name: string
  owner_org: string
  icon?: string
}

export async function post(c: Context<MiddlewareKeyVariables>, body: CreateApp, _apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
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
  let pgClient
  let data: Record<string, any> | undefined
  try {
    pgClient = getPgClient(c)
    const result = await pgClient.query(
      `INSERT INTO public.apps (owner_org, app_id, icon_url, name, retention, default_upload_channel)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        dataInsert.owner_org,
        dataInsert.app_id,
        dataInsert.icon_url,
        dataInsert.name,
        dataInsert.retention,
        dataInsert.default_upload_channel,
      ],
    )
    data = result.rows[0]
  }
  catch (error) {
    logPgError(c, 'create_app', error)
    throw simpleError('cannot_create_app', 'Cannot create app', { error: (error as Error)?.message })
  }
  finally {
    if (pgClient) {
      await closeClient(c, pgClient)
    }
  }

  if (!data) {
    throw simpleError('cannot_read_app', 'Cannot read created app')
  }

  if (data.icon_url) {
    const signedIcon = await createSignedImageUrl(c, data.icon_url)
    data.icon_url = signedIcon ?? ''
  }

  return c.json(data)
}
