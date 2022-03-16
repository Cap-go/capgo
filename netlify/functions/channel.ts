import type { Handler } from '@netlify/functions'
import { updateOrCreateChannel, useSupabase } from '../services/supabase'
import { checkKey, sendRes } from './../services/utils'
import type { definitions } from '~/types/supabase'

interface ChannelSet {
  appid: string
  version: string
  channel: string
}
export const handler: Handler = async(event) => {
  console.log(event.httpMethod)
  if (event.httpMethod === 'OPTIONS')
    return sendRes()

  const supabase = useSupabase()
  const apikey: definitions['apikeys'] | null = await checkKey(event.headers.authorization, supabase, ['read', 'upload'])
  if (!apikey || !event.body)
    return sendRes({ status: 'Cannot Verify User' }, 400)

  const body = JSON.parse(event.body || '{}') as ChannelSet
  const { data, error: vError } = await supabase
    .from<definitions['app_versions']>('app_versions')
    .select()
    .eq('app_id', body.appid)
    .eq('name', body.version)
    .eq('user_id', apikey.user_id)
  if (vError || !data || !data.length)
    return sendRes({ status: `Cannot find version ${body.version}`, error: JSON.stringify(vError) }, 400)
  const channel: Partial<definitions['channels']> = {
    created_by: apikey.user_id,
    app_id: body.appid,
    name: body.channel,
    version: data[0].id,
  }
  try {
    const { error: dbError } = await updateOrCreateChannel(channel)
    if (dbError)
      return sendRes({ status: 'Cannot set channels', error: JSON.stringify(dbError) }, 400)
  }
  catch (e) {
    return sendRes({ status: 'Cannot set channels', error: e }, 500)
  }
  return sendRes()
}
