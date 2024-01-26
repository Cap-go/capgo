import { Hono } from 'https://deno.land/x/hono/mod.ts'
import type { Context } from 'https://deno.land/x/hono/mod.ts'
import { checkAppOwner, supabaseAdmin } from '../_utils/supabase.ts'
import { fetchLimit, sendRes } from '../_utils/utils.ts'
import type { Database } from '../_utils/supabase.types.ts'
import { middlewareKey } from '../_utils/hono.ts'

interface GetLatest {
  app_id?: string
  version?: string
  page?: number
}

const deleteBundle = async (body: GetLatest, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> => {
  if (!body.app_id)
    return sendRes({ status: 'Missing app_id' }, 400)
  if (!body.version)
    return sendRes({ status: 'Missing app_id' }, 400)

  if (!(await checkAppOwner(apikey.user_id, body.app_id)))
    return sendRes({ status: 'You can\'t access this app', app_id: body.app_id }, 400)

  try {
    if (body.version) {
      const { error: dbError } = await supabaseAdmin()
        .from('app_versions')
        .update({
          deleted: true,
        })
        .eq('app_id', body.app_id)
        .eq('name', body.version)
      if (dbError)
        return sendRes({ status: 'Cannot delete version', error: JSON.stringify(dbError) }, 400)
    }
    else {
      const { error: dbError } = await supabaseAdmin()
        .from('app_versions')
        .update({
          deleted: true,
        })
        .eq('app_id', body.app_id)
      if (dbError)
        return sendRes({ status: 'Cannot delete all version', error: JSON.stringify(dbError) }, 400)
    }
  }
  catch (e) {
    return sendRes({ status: 'Cannot delete version', error: JSON.stringify(e) }, 500)
  }
  return sendRes()
}

async function get(body: GetLatest, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  try {
    if (!body.app_id)
      return sendRes({ status: 'Missing app_id' }, 400)

    if (!(await checkAppOwner(apikey.user_id, body.app_id)))
      return sendRes({ status: 'You can\'t access this app', app_id: body.app_id }, 400)

    if (!(await checkAppOwner(apikey.user_id, body.app_id)))
      return sendRes({ status: 'You can\'t check this app' }, 400)

    const fetchOffset = body.page == null ? 0 : body.page
    const from = fetchOffset * fetchLimit
    const to = (fetchOffset + 1) * fetchLimit - 1
    const { data: dataBundles, error: dbError } = await supabaseAdmin()
      .from('app_versions')
      .select()
      .eq('app_id', body.app_id)
      .eq('deleted', false)
      .range(from, to)
      .order('created_at', { ascending: false })
    if (dbError || !dataBundles || !dataBundles.length)
      return sendRes({ status: 'Cannot get bundle', error: dbError }, 400)

    return sendRes(dataBundles)
  }
  catch (e) {
    return sendRes({ status: 'Cannot get bundle', error: JSON.stringify(e) }, 500)
  }
}

export const app = new Hono()

app.get('/', middlewareKey, async (c: Context) => {
  try {
    const body = await c.req.json<GetLatest>()
    const apikey = c.get('apikey')
    return get(body, apikey)
  } catch (e) {
    return sendRes({ status: 'Cannot get bundle', error: JSON.stringify(e) }, 500)
  }
})

app.delete('/', middlewareKey, async (c: Context) => {
  try {
    const body = await c.req.json<GetLatest>()
    const apikey = c.get('apikey')
    return deleteBundle(body, apikey)
  } catch (e) {
    return sendRes({ status: 'Cannot delete bundle', error: JSON.stringify(e) }, 500)
  }
})
