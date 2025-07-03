import type { Context } from 'hono'
import type { Database } from '../../utils/supabase.types.ts'
import { simpleError } from '../../utils/hono.ts'
import { cloudlogErr } from '../../utils/loggin.ts'
import { hasAppRightApikey, supabaseAdmin } from '../../utils/supabase.ts'

interface UpdateApp {
  name?: string
  icon?: string
  retention?: number
}

export async function put(c: Context, appId: string, body: UpdateApp, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  if (!appId) {
    throw simpleError('missing_app_id', 'Missing app_id', { appId })
  }

  if (!(await hasAppRightApikey(c, appId, apikey.user_id, 'write', apikey.key))) {
    throw simpleError('cannot_update_app', 'You can\'t access this app', { app_id: appId })
  }

  const { data, error: dbError } = await supabaseAdmin(c)
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
