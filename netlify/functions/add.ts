import type { Handler } from '@netlify/functions'
import { v4 as uuidv4 } from 'uuid'
import { useSupabase } from '../services/supabase'
import type { definitions } from '~/types/supabase'

interface AppAdd {
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
    const body = JSON.parse(event.body || '{}') as AppAdd
    const fileName = `icon_${uuidv4()}`
    let signedURL = 'https://xvwzpoazmxkqosrdewyv.supabase.in/storage/v1/object/public/images/caplogo.png'
    if (body.icon && body.iconType) {
      const buff = Buffer.from(body.icon, 'base64')
      const { error } = await supabase.storage
        .from(`images/${apikey.user_id}/${body.appid}`)
        .upload(fileName, buff, {
          contentType: body.iconType,
        })
      if (error) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            message: 'Cannot Add App',
          }),
        }
      }
      const res = await supabase
        .storage
        .from(`images/${apikey.user_id}/${body.appid}`)
        .getPublicUrl(fileName)
      signedURL = res.data?.publicURL || signedURL
    }

    const { error: dbError } = await supabase
      .from('apps')
      .insert({
        icon_url: signedURL,
        user_id: apikey.user_id,
        name: body.name,
        app_id: body.appid,
      })
    if (dbError) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          message: 'Cannot add app',
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
