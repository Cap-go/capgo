import type { Context } from 'hono'
import type { Database } from '../../utils/supabase.types.ts'
import { quickError, simpleError } from '../../utils/hono.ts'
import { hasAppRightApikey, supabaseApikey } from '../../utils/supabase.ts'

interface UpdateApp {
  name?: string
  icon?: string
  retention?: number
}

export async function put(c: Context, appId: string, body: UpdateApp, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  if (!(await hasAppRightApikey(c, appId, apikey.user_id, 'write', apikey.key))) {
    throw quickError(401, 'cannot_access_app', 'You can\'t access this app', { app_id: appId })
  }

  if (body.retention && body.retention >= 63113904) {
    throw quickError(400, 'retention_to_big', 'Retention cannot be bigger than 63113903 (2 years)', { retention: body.retention })
  } else if (body.retention && body.retention < 0) {
    throw quickError(400, 'retention_to_small', 'Retention cannot be smaller than 0', { retention: body.retention })
  }

  const { data, error: dbError } = await supabaseApikey(c, apikey.key)
    .from('apps')
    .update({
      name: body.name,
      icon_url: body.icon,
      retention: body.retention,
    })
    .eq('app_id', appId)
    .select()
    .single()

  if (dbError || !data) {
    throw simpleError('cannot_update_app', 'Cannot update app', { supabaseError: dbError })
  }

  return c.json(data)
}
