import type { Handler } from '@netlify/functions'
import { useSupabase } from '../services/supabase'
import type { definitions } from '~/types/supabase'

interface VersionSet {
  appid: string
  version: string
  mode: 'dev' | 'prod'
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
        message: 'Requires Authorization',
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
  if (!isVerified || !apikey || !event.body) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        message: 'cannot Verify User',
      }),
    }
  }

  try {
    const body = JSON.parse(event.body || '{}') as VersionSet
    const update: any = {}
    if (body.mode === 'prod')
      update.current_prod = body.version
    else
      update.current_dev = body.version
    const { error: dbError } = await supabase
      .from('apps')
      .update(update)
      .match({ app_id: body.appid })
    if (dbError) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          message: 'cannot set version',
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
