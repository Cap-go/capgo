import type { Context } from '@hono/hono'
import type { Database } from '../../utils/supabase.types.ts'
import { hasAppRightApikey, supabaseAdmin } from '../../utils/supabase.ts'

export async function get(c: Context, appId: string, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  if (!appId) {
    console.error('Cannot get app', 'Missing app_id')
    return c.json({ status: 'Missing app_id' }, 400)
  }

  if (!(await hasAppRightApikey(c, appId, apikey.user_id, 'read', apikey.key))) {
    console.error('Cannot get app', 'You can\'t access this app', appId)
    return c.json({ status: 'You can\'t access this app', app_id: appId }, 400)
  }

  try {
    const { data, error: dbError } = await supabaseAdmin(c)
      .from('apps')
      .select('*')
      .eq('app_id', appId)
      .single()

    if (dbError || !data) {
      console.error('Cannot find app', dbError)
      return c.json({ status: 'Cannot find app', error: JSON.stringify(dbError) }, 404)
    }

    return c.json(data)
  }
  catch (e) {
    console.error('Cannot get app', e)
    return c.json({ status: 'Cannot get app', error: JSON.stringify(e) }, 500)
  }
}
