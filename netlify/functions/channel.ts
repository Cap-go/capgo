import type { Handler } from '@netlify/functions'
import { useSupabase } from '../services/supabase'
import type { definitions } from '~/types/supabase'

interface ChannelSet {
  appid: string
  version: string
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
  if (!isVerified || !apikey || apikey.mode === 'read' || apikey.mode === 'upload' || !event.body) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        message: 'Cannot Verify User',
      }),
    }
  }
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
      await supabase
        .from('channels')
        .insert(channel)
    }
  }
  catch (e) {
    const { error: dbError2 } = await supabase
      .from('channels')
      .insert(channel)
    if (dbError2) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          message: 'cannot set channels',
          err: JSON.stringify(dbError2),
        }),
      }
    }
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
