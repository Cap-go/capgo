import type { Handler } from '@netlify/functions'
import { v4 as uuidv4 } from 'uuid'
import { useSupabase } from '../services/supabase'
import type { definitions } from '~/types/supabase'

interface AppUpload {
  appid: string
  version: string
  app: string
  fileName?: string
  isMultipart?: boolean
  chunk?: number
  totalChunks?: number
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
    const body = JSON.parse(event.body || '{}') as AppUpload
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { app, ...newObject } = body
    console.log('body', newObject)
    let fileName = uuidv4()
    let error
    if (body.isMultipart && body.fileName) {
      fileName = body.fileName
      const { data, error: dnError } = await supabase
        .storage
        .from(`apps/${apikey.user_id}/${body.appid}/versions`)
        .download(fileName)
      if (dnError || !data) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            message: 'cannot download partial File to concat',
          }),
        }
      }
      const arrayBuffer = await data?.arrayBuffer()
      const buffOld = Buffer.from(arrayBuffer)
      const buffNew = Buffer.from(body.app, 'base64')
      const bufAll = Buffer.concat([buffOld, buffNew], buffOld.length + buffNew.length)
      const { error: upError } = await supabase
        .storage
        .from(`apps/${apikey.user_id}/${body.appid}/versions`)
        .update(fileName, bufAll, {
          contentType: 'application/zip',
          upsert: false,
        })
      error = upError
    }
    else {
      const { error: upError } = await supabase.storage
        .from(`apps/${apikey.user_id}/${body.appid}/versions`)
        .upload(fileName, Buffer.from(body.app, 'base64'), {
          contentType: 'application/zip',
        })
      error = upError
    }
    if (error) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          message: 'cannot Upload File',
          error,
        }),
      }
    }
    if (body.isMultipart) {
      // send filename to allow partial upload
      const isDone = (body.chunk || 0) === (body.totalChunks || 0) && body.fileName
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ status: isDone ? 'multipart' : 'ok', fileName }),
      }
    }
    const { error: dbError } = await supabase
      .from('app_versions')
      .insert({
        bucket_id: fileName,
        user_id: apikey.user_id,
        name: body.version,
        app_id: body.appid,
      })
    const { error: dbError2 } = await supabase
      .from('apps')
      .update({
        last_version: body.version,
      }).eq('app_id', body.appid)
    if (dbError || dbError2) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          message: 'cannot add version',
          err: JSON.stringify(dbError),
        }),
      }
    }
    try {
      const { error: dbError2 } = await supabase
        .from('channels')
        .update({
          version: body.version,
        })
        .eq('app_id', body.appid)
        .eq('channel', body.channel)
        .eq('user_id', apikey.user_id)
      if (dbError2) {
        const { error: dbError3 } = await supabase
          .from('channels')
          .insert({
            channel: body.channel,
            app_id: body.appid,
            user_id: apikey.user_id,
            version: body.version,
          })
        if (dbError3) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({
              message: 'cannot update or add channel',
              err: JSON.stringify(dbError),
            }),
          }
        }
      }
    }
    catch (err) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          message: 'error channel',
          err: JSON.stringify(err),
        }),
      }
    }
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ status: 'ok' }),
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
