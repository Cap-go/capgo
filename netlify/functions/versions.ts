import type { Handler } from '@netlify/functions'
import { useSupabase } from '../services/supabase'
import type { definitions } from '~/types/supabase'

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
  try {
    const body = event.queryStringParameters as any as GetLatest
    if (!body.appid) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          message: 'missing appid or channel',
        }),
      }
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
    if (!isVerified || !apikey || apikey.mode === 'write' || apikey.mode === 'upload' || !body.appid) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          message: 'cannot Verify User',
        }),
      }
    }
    const { data: dataVersions, error: dbError } = await supabase
      .from<definitions['app_versions']>('app_versions')
      .select()
      .eq('app_id', body.appid)
      .order('created_at', { ascending: false })
    if (dbError || !dataVersions || !dataVersions.length) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          message: 'Cannot get channel',
          err: JSON.stringify(dbError),
        }),
      }
    }
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ versions: dataVersions }),
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
