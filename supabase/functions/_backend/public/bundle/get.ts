import type { Context } from 'hono'
import type { Database } from '../../utils/supabase.types.ts'
import { simpleError } from '../../utils/hono.ts'
import { hasAppRightApikey, supabaseAdmin } from '../../utils/supabase.ts'
import { fetchLimit } from '../../utils/utils.ts'

export interface GetLatest {
  app_id: string
  version?: string
  page?: number
}

export async function get(c: Context, body: GetLatest, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  if (!(await hasAppRightApikey(c, body.app_id, apikey.user_id, 'read', apikey.key))) {
    throw simpleError('cannot_get_bundle', 'You can\'t access this app', { app_id: body.app_id })
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
  if (dbError || !dataBundles?.length) {
    throw simpleError('cannot_get_bundle', 'Cannot get bundle', { supabaseError: dbError })
  }

  return c.json(dataBundles as any)
}
