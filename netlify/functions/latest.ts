import type { Handler } from '@netlify/functions'
import { useSupabase } from '../services/supabase'
import { sendRes } from './../services/utils'
import type { definitions } from '~/types/supabase'

interface Channel {
  version: definitions['app_versions']
}
interface GetLatest {
  appid: string
  channel: string
}
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
}

export const handler: Handler = async(event) => {
  console.log(event.httpMethod)
  if (event.httpMethod === 'OPTIONS')
    return sendRes()

  try {
    const body = event.queryStringParameters as any as GetLatest
    if (!body.appid || !body.channel) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          message: 'missing appid or channel',
        }),
      }
    }
    const supabase = useSupabase()

    const { data: channels, error: dbError } = await supabase
      .from<definitions['channels'] & Channel>('channels')
      .select(`
        id,
        created_at,
        name,
        app_id,
        version (
          name,
          user_id,
          bucket_id
        )
      `)
      .eq('app_id', body.appid)
      .eq('name', body.channel)
      .eq('public', true)
    if (dbError || !channels || !channels.length) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          message: 'Cannot get channel',
          err: JSON.stringify(dbError),
        }),
      }
    }
    const channel = channels[0]
    const res = await supabase
      .storage
      .from(`apps/${channel.version.user_id}/${channel.app_id}/versions`)
      .createSignedUrl(channel.version.bucket_id, 60)
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ version: channel.version.name, url: res.signedURL }),
    }
  }
  catch (e) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        message: 'Cannot get latest version',
        err: `${e}!`,
      }),
    }
  }
}
