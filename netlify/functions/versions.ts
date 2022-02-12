import type { Handler } from '@netlify/functions'
import { useSupabase } from '../services/supabase'
import { checkKey, sendRes } from './../services/utils'
import type { definitions } from '~/types/supabase'

interface GetLatest {
  appid: string
  channel: string
}

export const handler: Handler = async(event) => {
  console.log(event.httpMethod)
  if (event.httpMethod === 'OPTIONS')
    return sendRes()
  try {
    const body = event.queryStringParameters as any as GetLatest
    if (!body.appid)
      return sendRes({ status: 'Missing appid or channel' }, 400)

    const supabase = useSupabase()
    const apikey: definitions['apikeys'] | null = await checkKey(event.headers.authorization, supabase, ['write', 'upload'])
    if (!apikey || !event.body)
      return sendRes({ status: 'Cannot Verify User' }, 400)
    const { data: dataVersions, error: dbError } = await supabase
      .from<definitions['app_versions']>('app_versions')
      .select()
      .eq('app_id', body.appid)
      .order('created_at', { ascending: false })
    if (dbError || !dataVersions || !dataVersions.length)
      return sendRes({ status: 'Cannot get latest version', error: dbError }, 400)

    return sendRes({ versions: dataVersions })
  }
  catch (e) {
    return sendRes({ status: 'Cannot get latest version', error: e }, 500)
  }
}
