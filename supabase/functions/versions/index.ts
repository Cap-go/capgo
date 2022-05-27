import { serve } from 'https://deno.land/std@0.139.0/http/server.ts'
import { checkAppOwner, supabaseAdmin } from '../_utils/supabase.ts'
import type { definitions } from '../_utils/types_supabase.ts'
import { checkKey, sendRes } from '../_utils/utils.ts'

interface GetLatest {
  appid: string
  channel: string
}

serve(async(event: Request) => {
  const supabase = supabaseAdmin
  const authorization = event.headers.get('apikey')
  if (!authorization)
    return sendRes({ status: 'Cannot find authorization' }, 400)
  const apikey: definitions['apikeys'] | null = await checkKey(authorization, supabase, ['upload', 'all', 'write'])
  if (!apikey || !event.body)
    return sendRes({ status: 'Cannot Verify User' }, 400)
  try {
    const body = (await event.json()) as GetLatest
    if (!body.appid)
      return sendRes({ status: 'Missing appid or channel' }, 400)

    if (await checkAppOwner(apikey.user_id, body.appid))
      return sendRes({ status: 'You can\'t check this app' }, 400)
    const { data: dataVersions, error: dbError } = await supabase
      .from<definitions['app_versions']>('app_versions')
      .select()
      .eq('app_id', body.appid)
      .eq('deleted', false)
      .order('created_at', { ascending: false })
    if (dbError || !dataVersions || !dataVersions.length)
      return sendRes({ status: 'Cannot get latest version', error: dbError }, 400)

    return sendRes({ versions: dataVersions })
  }
  catch (e) {
    return sendRes({
      status: 'Error unknow',
      error: JSON.stringify(e),
    }, 500)
  }
})
