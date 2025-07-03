import type { Context } from 'hono'
import type { Database } from '../../utils/supabase.types.ts'
import { BRES, simpleError } from '../../utils/hono.ts'
import { cloudlogErr } from '../../utils/loggin.ts'
import { hasAppRightApikey, supabaseAdmin } from '../../utils/supabase.ts'

interface GetLatest {
  app_id?: string
  version?: string
  page?: number
}

export async function deleteBundle(c: Context, body: GetLatest, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  if (!body.app_id) {
    throw simpleError('missing_app_id', 'Missing app_id', { body })
  }

  if (!(await hasAppRightApikey(c, body.app_id, apikey.user_id, 'write', apikey.key))) {
    throw simpleError('cannot_delete_bundle', 'You can\'t access this app', { app_id: body.app_id })
  }

  if (body.version) {
    const { data, error: dbError } = await supabaseAdmin(c)
      .from('app_versions')
      .update({
        deleted: true,
      })
      .eq('app_id', body.app_id)
      .eq('name', body.version)
      .select()
      .single()
    if (dbError || !data) {
      throw simpleError('cannot_delete_version', 'Cannot delete version', { supabaseError: dbError })
    }
  }
  else {
    const { error: dbError } = await supabaseAdmin(c)
      .from('app_versions')
      .update({
        deleted: true,
      })
      .eq('app_id', body.app_id)
    if (dbError) {
      throw simpleError('cannot_delete_all_version', 'Cannot delete all version', { supabaseError: dbError })
    }
  }

  return c.json(BRES)
}
