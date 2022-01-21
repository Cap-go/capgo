import type { Handler } from '@netlify/functions'
import { useSupabase } from '../services/supabase'
import type { definitions } from '~/types/supabase'

interface AppDelete {
  appid: string
  name: string
  icon: string
  iconType: string
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
  if (!isVerified || !apikey || apikey.mode === 'read' || !event.body) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        message: 'cannot Verify User',
      }),
    }
  }

  try {
    const body = JSON.parse(event.body || '{}') as AppDelete

    const { data, error: vError } = await supabase
      .from<definitions['app_versions']>('app_versions')
      .select()
      .eq('app_id', body.appid)
      .eq('user_id', apikey.user_id)

    if (data && data.length && !vError) {
      const { error: delError } = await supabase
        .storage
        .from(`apps/${apikey.user_id}/${body.appid}/versions`)
        .remove(data.map(v => v.bucket_id))
      if (delError) {
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({
            message: `${delError}!`,
          }),
        }
      }
      await supabase
        .from('app_versions')
        .delete()
        .eq('app_id', body.appid)
        .eq('user_id', apikey.user_id)
    }

    const { error: dbError } = await supabase
      .from('apps')
      .delete()
      .eq('app_id', body.appid)
      .eq('user_id', apikey.user_id)
    if (dbError) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          message: 'cannot delete app',
          err: JSON.stringify(dbError),
        }),
      }
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
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ status: 'ok' }),
  }
}
