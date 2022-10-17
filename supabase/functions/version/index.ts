import { serve } from 'https://deno.land/std@0.160.0/http/server.ts'
import { checkAppOwner, supabaseAdmin } from '../_utils/supabase.ts'
import type { definitions } from '../_utils/types_supabase.ts'
import { checkKey, sendRes } from '../_utils/utils.ts'

interface GetLatest {
  appid?: string
  app_id?: string
}

export const deleteVersion = async (event: Request, apikey: definitions['apikeys']): Promise<Response> => {
  const body = await event.json() as GetLatest
  if (!(body.appid || body.app_id)) {
    console.log('No app_id provided')
    return sendRes({ status: 'Missing app_id' }, 400)
  }
  if (!(await checkAppOwner(apikey.user_id, body.appid || body.app_id))) {
    console.error('You can\'t access this app', body.app_id)
    return sendRes({ status: 'You can\'t access this app', app_id: body.app_id }, 400)
  }
  try {
    const { error: dbError } = await supabaseAdmin
      .from<definitions['app_versions']>('app_versions')
      .update({
        deleted: true,
      })
      .eq('app_id', body.appid || body.app_id)
    if (dbError) {
      console.log('Cannot delete version')
      return sendRes({ status: 'Cannot delete version', error: JSON.stringify(dbError) }, 400)
    }
  }
  catch (e) {
    console.log('Cannot delete version', e)
    return sendRes({ status: 'Cannot delete version', error: e }, 500)
  }
  return sendRes()
}

export const get = async (event: Request, apikey: definitions['apikeys']): Promise<Response> => {
  try {
    const body = (await event.json()) as GetLatest
    if (!(body.appid || body.app_id)) {
      console.log('No app_id provided')
      return sendRes({ status: 'Missing app_id' }, 400)
    }
    if (!(await checkAppOwner(apikey.user_id, body.appid || body.app_id))) {
      console.error('You can\'t access this app', body.app_id)
      return sendRes({ status: 'You can\'t access this app', app_id: body.app_id }, 400)
    }

    if (!(await checkAppOwner(apikey.user_id, body.appid || body.app_id)))
      return sendRes({ status: 'You can\'t check this app' }, 400)

    const { data: dataVersions, error: dbError } = await supabaseAdmin
      .from<definitions['app_versions']>('app_versions')
      .select()
      .eq('app_id', body.appid || body.app_id)
      .eq('deleted', false)
      .order('created_at', { ascending: false })
    if (dbError || !dataVersions || !dataVersions.length) {
      console.log('Cannot get version')
      return sendRes({ status: 'Cannot get version', error: dbError }, 400)
    }

    return sendRes({ versions: dataVersions })
  }
  catch (e) {
    console.log('Cannot get version', JSON.stringify(e))
    return sendRes({ status: 'Cannot get version', error: JSON.stringify(e) }, 500)
  }
}

serve(async (event: Request) => {
  const apikey_string = event.headers.get('authorization')
  const api_mode_string = event.headers.get('api_mode')

  if (!apikey_string) {
    console.log('Missing apikey')
    return sendRes({ status: 'Missing apikey' }, 400)
  }
  const apikey: definitions['apikeys'] | null = await checkKey(apikey_string, supabaseAdmin, ['all', 'write'])
  if (!apikey) {
    console.log('Missing apikey')
    return sendRes({ status: 'Missing apikey' }, 400)
  }
  if (api_mode_string === 'GET')
    return get(event, apikey)
  else if (api_mode_string === 'DELETE')
    return deleteVersion(event, apikey)
  console.log('Method not allowed')
  return sendRes({ status: 'Method now allowed' }, 400)
})
