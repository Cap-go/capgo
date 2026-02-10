import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../../utils/hono.ts'
import type { Database } from '../../utils/supabase.types.ts'
import { getAppStatusPayload, setAppStatus } from '../../utils/appStatus.ts'
import { quickError, simpleError } from '../../utils/hono.ts'
import { checkPermission } from '../../utils/rbac.ts'
import { createSignedImageUrl, normalizeImagePath } from '../../utils/storage.ts'
import { supabaseApikey } from '../../utils/supabase.ts'
import { isValidAppId } from '../../utils/utils.ts'

interface UpdateApp {
  name?: string
  icon?: string
  retention?: number
  expose_metadata?: boolean
  allow_device_custom_id?: boolean
}

export async function put(c: Context<MiddlewareKeyVariables>, appId: string, body: UpdateApp, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  if (!appId) {
    throw quickError(400, 'missing_app_id', 'Missing app_id')
  }
  if (!isValidAppId(appId)) {
    throw quickError(400, 'invalid_app_id', 'App ID must be a reverse domain string', { app_id: appId })
  }
  // Auth context is already set by middlewareKey
  if (!(await checkPermission(c, 'app.update_settings', { appId }))) {
    throw quickError(401, 'cannot_access_app', 'You can\'t access this app', { app_id: appId })
  }

  if (body.retention && body.retention >= 63113904) {
    throw quickError(400, 'retention_to_big', 'Retention cannot be bigger than 63113903 (2 years)', { retention: body.retention })
  }
  else if (body.retention && body.retention < 0) {
    throw quickError(400, 'retention_to_small', 'Retention cannot be smaller than 0', { retention: body.retention })
  }

  const normalizedIcon = normalizeImagePath(body.icon)
  const { data, error: dbError } = await supabaseApikey(c, apikey.key)
    .from('apps')
    .update({
      name: body.name,
      icon_url: normalizedIcon ?? body.icon,
      retention: body.retention,
      expose_metadata: body.expose_metadata,
      allow_device_custom_id: body.allow_device_custom_id,
    })
    .eq('app_id', appId)
    .select()
    .single()

  if (dbError || !data) {
    throw simpleError('cannot_update_app', 'Cannot update app', { supabaseError: dbError })
  }

  if (data.icon_url) {
    const signedIcon = await createSignedImageUrl(c, data.icon_url)
    data.icon_url = signedIcon ?? ''
  }

  // Best-effort: if the plugin app-status cache already exists (cancelled fast-path),
  // update the cached allow_device_custom_id value so enforcement is immediate.
  if (body.allow_device_custom_id !== undefined) {
    const cached = await getAppStatusPayload(c, appId)
    if (cached?.status === 'cancelled') {
      setAppStatus(c, appId, cached.status, { allow_device_custom_id: body.allow_device_custom_id })
    }
  }

  return c.json(data)
}
