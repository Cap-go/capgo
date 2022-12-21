import { serve } from 'https://deno.land/std@0.170.0/http/server.ts'
import { checkAppOwner, supabaseAdmin } from '../_utils/supabase.ts'
import { checkKey, fetchLimit, methodJson, sendRes } from '../_utils/utils.ts'
import type { Database } from '../_utils/supabase.types.ts'
import type { BaseHeaders } from '../_utils/types.ts'

interface GetLatest {
  app_id?: string
  version?: string
  page?: number
}

export const deleteBundle = async (body: GetLatest,
  apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> => {
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

export const get = async (body: GetLatest,
  apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> => {
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

const main = async (url: URL, headers: BaseHeaders, method: string, body: any) => {
  const apikey_string = headers.authorization

  if (!apikey_string)
    return sendRes({ status: 'Missing apikey' }, 400)

  try {
    const apikey: Database['public']['Tables']['apikeys']['Row'] | null = await checkKey(apikey_string,
      supabaseAdmin(), ['all', 'write'])
    if (!apikey)
      return sendRes({ status: 'Missing apikey' }, 400)

    if (method === 'GET')
      return get(body, apikey)
    else if (method === 'DELETE')
      return deleteBundle(body, apikey)
  }
  catch (e) {
    return sendRes({ status: 'Error', error: JSON.stringify(e) }, 500)
  }
  return sendRes({ status: 'Method now allowed' }, 400)
}

serve(async (event: Request) => {
  try {
    const url: URL = new URL(event.url)
    const headers: BaseHeaders = Object.fromEntries(event.headers.entries())
    const method: string = event.method
    const body: any = methodJson.includes(method) ? await event.json() : Object.fromEntries(url.searchParams.entries())
    return main(url, headers, method, body)
  }
  catch (e) {
    return sendRes({ status: 'Error', error: JSON.stringify(e) }, 500)
  }
})
