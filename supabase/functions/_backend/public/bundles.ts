import { Hono } from 'hono/tiny'
import type { Context } from 'hono'
import { hasAppRight, supabaseAdmin } from '../utils/supabase.ts'
import { fetchLimit } from '../utils/utils.ts'
import type { Database } from '../utils/supabase.types.ts'
import { BRES, getBody, middlewareKey } from '../utils/hono.ts'

interface GetLatest {
  app_id?: string
  version?: string
  page?: number
}

async function deleteBundle(c: Context, body: GetLatest, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
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
      if (dbError || !data) {
        console.error('Cannot delete version', dbError)
        return c.json({ status: 'Cannot delete version', error: JSON.stringify(dbError) }, 400)
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
        console.error('Cannot delete all version', dbError)
        return c.json({ status: 'Cannot delete all version', error: JSON.stringify(dbError) }, 400)
      }
    }
  }
  catch (e) {
    console.error('Cannot delete version', e)
    return c.json({ status: 'Cannot delete version', error: JSON.stringify(e) }, 500)
  }
  return c.json(BRES)
}

async function get(c: Context, body: GetLatest, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> {
  try {
    if (!body.app_id)
      return c.json({ status: 'Missing app_id' }, 400)

    if (!(await hasAppRight(c, body.app_id, apikey.user_id, 'read')))
      return c.json({ status: 'You can\'t access this app', app_id: body.app_id }, 400)

    const fetchOffset = body.page == null ? 0 : body.page
    const from = fetchOffset * fetchLimit
    const to = (fetchOffset + 1) * fetchLimit - 1
    const { data: dataBundles, error: dbError } = await supabaseAdmin(c)
      .from('app_versions')
      .select()
      .eq('app_id', body.app_id)
      .eq('deleted', false)
      .range(from, to)
      .order('created_at', { ascending: false })
    if (dbError || !dataBundles || !dataBundles.length)
      return c.json({ status: 'Cannot get bundle', error: dbError }, 400)

    return c.json(dataBundles as any)
  }
  catch (e) {
    return c.json({ status: 'Cannot get bundle', error: JSON.stringify(e) }, 500)
  }
}

export const app = new Hono()

app.get('/', middlewareKey(['all', 'write']), async (c: Context) => {
  try {
    const body = await getBody<GetLatest>(c)
    const apikey = c.get('apikey')
    return get(c, body, apikey)
  }
  catch (e) {
    return c.json({ status: 'Cannot get bundle', error: JSON.stringify(e) }, 500)
  }
})

app.delete('/', middlewareKey(['all', 'write']), async (c: Context) => {
  try {
    const body = await getBody<GetLatest>(c)
    const apikey = c.get('apikey')
    return deleteBundle(c, body, apikey)
  }
  catch (e) {
    return c.json({ status: 'Cannot delete bundle', error: JSON.stringify(e) }, 500)
  }
})
