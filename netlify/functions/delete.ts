import type { Handler } from '@netlify/functions'
import { useSupabase } from '../services/supabase'
import { checkKey, sendRes } from './../services/utils'
import type { definitions } from '~/types/supabase'

interface AppDelete {
  appid: string
  name: string
  icon: string
  iconType: string
}
export const handler: Handler = async(event) => {
  console.log(event.httpMethod)
  if (event.httpMethod === 'OPTIONS')
    return sendRes()
  const supabase = useSupabase()

  const apikey: definitions['apikeys'] | null = await checkKey(event.headers.authorization, supabase, ['read', 'upload'])
  if (!apikey || !event.body)
    return sendRes({ status: 'Cannot Verify User' }, 400)

  try {
    const body = JSON.parse(event.body || '{}') as AppDelete
    const { data, error: vError } = await supabase
      .from<definitions['app_versions']>('app_versions')
      .select()
      .eq('app_id', body.appid)
      .eq('user_id', apikey.user_id)

    if (!data || !data.length || !vError)
      return sendRes({ status: 'Version not found in databse' }, 400)

    const filesToRemove = (data as definitions['app_versions'][]).map(x => `/${apikey.user_id}/${body.appid}/versions/${x.bucket_id}`)
    const { error: delError } = await supabase
      .storage
      .from('apps')
      .remove(filesToRemove)
    if (delError)
      return sendRes({ status: 'Cannot delete version from storage', error: delError }, 400)

    const { error: dbError } = await supabase
      .from<definitions['apps']>('apps')
      .delete()
      .eq('app_id', body.appid)
      .eq('user_id', apikey.user_id)

    const { error: delAppError } = await supabase
      .from<definitions['app_versions']>('app_versions')
      .delete()
      .eq('app_id', body.appid)
      .eq('user_id', apikey.user_id)

    const { error: delChanError } = await supabase
      .from<definitions['channels']>('channels')
      .delete()
      .eq('app_id', body.appid)

    if (dbError || delAppError || delChanError)
      return sendRes({ status: 'Cannot delete version from database', error: dbError || delAppError || delChanError }, 400)
  }
  catch (e) {
    return sendRes({ status: 'Cannot delete', error: e }, 500)
  }
  return sendRes()
}
