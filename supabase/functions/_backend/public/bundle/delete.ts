import type { Context } from '@hono/hono'
import { BRES } from '../../utils/hono.ts'
import { hasAppRight, supabaseAdmin } from '../../utils/supabase.ts'
import type { Database } from '../../utils/supabase.types.ts'

interface GetLatest {
  app_id?: string
  version?: string
  page?: number
}

export async function deleteBundle(c: Context, body: GetLatest, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  if (!body.app_id)
    return c.json({ status: 'Missing app_id' }, 400)

  if (!(await hasAppRight(c, body.app_id, apikey.user_id, 'write')))
    return c.json({ status: 'You can\'t access this app', app_id: body.app_id }, 400)

  try {
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
      if (dbError || !data)
        return c.json({ status: 'Cannot delete version', error: JSON.stringify(dbError) }, 400)
    }
    else {
      const { error: dbError } = await supabaseAdmin(c)
        .from('app_versions')
        .update({
          deleted: true,
        })
        .eq('app_id', body.app_id)
      if (dbError)
        return c.json({ status: 'Cannot delete all version', error: JSON.stringify(dbError) }, 400)
    }
  }
  catch (e) {
    return c.json({ status: 'Cannot delete version', error: JSON.stringify(e) }, 500)
  }
  return c.json(BRES)
}
