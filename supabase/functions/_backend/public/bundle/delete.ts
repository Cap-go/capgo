import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../../utils/hono.ts'
import type { Database } from '../../utils/supabase.types.ts'
import { BRES, simpleError } from '../../utils/hono.ts'
import { checkPermission } from '../../utils/rbac.ts'
import { supabaseApikey } from '../../utils/supabase.ts'
import { isValidAppId } from '../../utils/utils.ts'

interface GetLatest {
  app_id: string
  version?: string
  page?: number
}

export async function deleteBundle(c: Context<MiddlewareKeyVariables>, body: GetLatest, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  if (!body.app_id) {
    throw simpleError('missing_app_id', 'Missing app_id', { body })
  }
  if (!isValidAppId(body.app_id)) {
    throw simpleError('invalid_app_id', 'App ID must be a reverse domain string', { app_id: body.app_id })
  }
  // Auth context is already set by middlewareKey
  if (!(await checkPermission(c, 'bundle.delete', { appId: body.app_id }))) {
    throw simpleError('cannot_delete_bundle', 'You can\'t access this app', { app_id: body.app_id })
  }

  if (body.version) {
    const { data, error: dbError } = await supabaseApikey(c, apikey.key)
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
    const { error: dbError } = await supabaseApikey(c, apikey.key)
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
