import { version } from 'os'
import type { Handler } from '@netlify/functions'
import { useSupabase } from '../services/supabase'
import type { definitions } from '~/types/supabase'

interface Channel {
  version: definitions['app_versions']
}
interface GetLatest {
  appid: string
  channel: string
}
export const handler: Handler = async(event) => {
  console.log(event.httpMethod)
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Methods': 'POST',
      },
      body: JSON.stringify({
        message: 'ok',
      }),
    }
  }

  const { authorization } = event.headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  }

  let isVerified = false
  let apikey: definitions['apikeys'] | null = null
  const supabase = useSupabase()
  try {
    const { data, error } = await supabase
      .from<definitions['apikeys']>('apikeys')
      .select()
      .eq('key', authorization)
    if (!data || !data.length) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          message: 'Requires Authorization',
        }),
      }
    }
    apikey = data[0]
    isVerified = !!apikey && !error
  }
  catch (error) {
    isVerified = false
    console.error(error)
  }
  if (!isVerified || !apikey || apikey.mode === 'write' || !event.body) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        message: 'cannot Verify User',
      }),
    }
  }

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

    const { data: channels, error: dbError } = await supabase
      .from<definitions['channels'] & Channel>('channels')
      .select(`
        id,
        created_at,
        name,
        app_id,
        version (
          name,
          uuser_id,
          bucket_id
        )
      `)
      .eq('app_id', body.appid)
      .eq('name', body.channel)
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
      .from(`apps/${channel.version.user_id}/versions/${channel.app_id}`)
      .createSignedUrl(channel.version.bucket_id, 60)
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ version: version.name, url: res.signedURL }),
    }
  }
  catch (e) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        message: `${e}!`,
      }),
    }
  }
}
