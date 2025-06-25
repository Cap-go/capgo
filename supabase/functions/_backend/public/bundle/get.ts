import type { Context } from '@hono/hono'
import type { Database } from '../../utils/supabase.types.ts'
import { hasAppRightApikey, supabaseAdmin } from '../../utils/supabase.ts'
import { fetchLimit } from '../../utils/utils.ts'

export interface GetLatest {
  app_id?: string
  version?: string
  page?: number
}

export async function get(c: Context, body: GetLatest, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  try {
    if (!body.app_id) {
      console.error('Cannot get bundle', 'Missing app_id')
      return c.json({ status: 'Missing app_id' }, 400)
    }

    if (!(await hasAppRightApikey(c, body.app_id, apikey.user_id, 'read', apikey.key))) {
      console.error('Cannot get bundle', 'You can\'t access this app', body.app_id)
      return c.json({ status: 'You can\'t access this app', app_id: body.app_id }, 400)
    }

    const fetchOffset = body.page ?? 0
    const from = fetchOffset * fetchLimit
    const to = (fetchOffset + 1) * fetchLimit - 1
    const { data: dataBundles, error: dbError } = await supabaseAdmin(c)
      .from('app_versions')
      .select()
      .eq('app_id', body.app_id)
      .eq('deleted', false)
      .range(from, to)
      .order('created_at', { ascending: false })
    if (dbError || !dataBundles || !dataBundles.length) {
      console.error('Cannot get bundle', dbError)
      return c.json({ status: 'Cannot get bundle', error: dbError }, 400)
    }

    return c.json(dataBundles as any)
  }
  catch (e) {
    console.error('Cannot get bundle', e)
    return c.json({ status: 'Cannot get bundle', error: JSON.stringify(e) }, 500)
  }
}
