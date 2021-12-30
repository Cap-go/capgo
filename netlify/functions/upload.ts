import type { Handler } from '@netlify/functions'
import { v4 as uuidv4 } from 'uuid'
import type { User } from '@supabase/supabase-js'
import { useSupabase } from '../services/supabase'
import multipart from'parse-multipart-data'
// import { parseMultipartForm } from '../services/upload'
import type { definitions } from '~/types/supabase'

// interface AppUpload {
//   name: string
//   type: string
//   version: string
//   app: { filename: string; type: string; content: Buffer }
// }
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
  let apikey: definitions['apikeys']
  const supabase = useSupabase()
  let auth: User | null = null
  try {
    const { data } = await supabase
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
    const { user, error } = await supabase.auth.api.getUser(
      apikey.user_id,
    )
    isVerified = !!user && !error
    auth = user
  }
  catch (error) {
    isVerified = false
    console.error(error)
  }
  if (!isVerified || !auth || !event.body) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        message: 'cannot Verify User',
      }),
    }
  }

  try {
    // console.log('headers', event.headers)
    const fields = multipart.parse(event.body, '----WebKitFormBoundary');
    // fields[0]
    // const fields = await parseMultipartForm(event) as AppUpload
    const fileName = uuidv4()
    const { error } = await supabase.storage
      .from(`apps/${auth.id}`)
      .upload(`${fileName}`, fields.app.content, {
        contentType: fields.app.type,
      })
    if (error) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          message: 'cannot Upload File',
        }),
      }
    }
    const { error: dbError } = await supabase
      .from('apps')
      .insert({
        bucket_id: fileName,
        user_id: auth.id,
        name: fields.name,
        version: fields.version,
      })
    if (dbError) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          message: 'cannot add app',
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
