import type { Context } from '@hono/hono'
import type { Database } from '../../utils/supabase.types.ts'
import { hasAppRightApikey, supabaseAdmin } from '../../utils/supabase.ts'

interface UpdateApp {
  name?: string
  icon?: string
  retention?: number
}

export async function put(c: Context, appId: string, body: UpdateApp, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  if (!appId) {
    console.error('Cannot update app', 'Missing app_id')
    return c.json({ status: 'Missing app_id' }, 400)
  }

  if (!(await hasAppRightApikey(c, appId, apikey.user_id, 'write', apikey.key))) {
    console.error('Cannot update app', 'You can\'t access this app', appId)
    return c.json({ status: 'You can\'t access this app', app_id: appId }, 400)
  }

  try {
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
      console.error('Cannot update app', dbError)
      return c.json({ status: 'Cannot update app', error: JSON.stringify(dbError) }, 400)
    }

    return c.json(data)
  }
  catch (e) {
    console.error('Cannot update app', e)
    return c.json({ status: 'Cannot update app', error: JSON.stringify(e) }, 500)
  }
}
