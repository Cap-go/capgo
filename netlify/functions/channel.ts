import type { Handler } from '@netlify/functions'
import { useSupabase } from '../services/supabase'
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
  const channel = {
    user_id: apikey.user_id,
    app_id: body.appid,
    channel: body.channel,
    version: body.version,
  }
  try {
    const { error: dbError } = await supabase
      .from('channels')
      .update(channel)
    if (dbError) {
      const { error: dbError2 } = await supabase
        .from('channels')
        .insert(channel)
      if (dbError2)
        return sendRes({ status: 'Cannot set channels', error: JSON.stringify(dbError2) }, 400)
    }
  }
  catch (e) {
    return sendRes({ status: 'Cannot set channels', error: e }, 500)
  }
  return sendRes()
}
