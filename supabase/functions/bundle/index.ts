import { serve } from 'https://deno.land/std@0.167.0/http/server.ts'
import { checkAppOwner, supabaseAdmin } from '../_utils/supabase.ts'
import { checkKey, fetchLimit, sendRes } from '../_utils/utils.ts'
import type { Database } from '../_utils/supabase.types.ts'

interface GetLatest {
  app_id?: string
  page?: number
}

export const deleteBundle = async (event: Request,
  apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> => {
  const body = await event.json() as GetLatest
  if (!body.app_id)
    return sendRes({ status: 'Missing app_id' }, 400)

  if (!(await checkAppOwner(apikey.user_id, body.app_id)))
    return sendRes({ status: 'You can\'t access this app', app_id: body.app_id }, 400)

  try {
    const { error: dbError } = await supabaseAdmin()
      .from('app_versions')
      .update({
        deleted: true,
      })
      .eq('app_id', body.app_id)
    if (dbError)
      return sendRes({ status: 'Cannot delete version', error: JSON.stringify(dbError) }, 400)
  }
  catch (e) {
    return sendRes({ status: 'Cannot delete version', error: JSON.stringify(e) }, 500)
  }
  return sendRes()
}

export const get = async (event: Request,
  apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> => {
  try {
    const body = (await event.json()) as GetLatest
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

serve(async (event: Request) => {
  const apikey_string = event.headers.get('authorization')

  if (!apikey_string)
    return sendRes({ status: 'Missing apikey' }, 400)

  try {
    const apikey: Database['public']['Tables']['apikeys']['Row'] | null = await checkKey(apikey_string,
      supabaseAdmin(), ['all', 'write'])
    if (!apikey)
      return sendRes({ status: 'Missing apikey' }, 400)

    if (event.method === 'GET')
      return get(event, apikey)
    else if (event.method === 'DELETE')
      return deleteBundle(event, apikey)
  }
  catch (e) {
    return sendRes({ status: 'Error', error: JSON.stringify(e) }, 500)
  }
  return sendRes({ status: 'Method now allowed' }, 400)
})
