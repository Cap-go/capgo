import type { Handler } from '@netlify/functions'
import { v4 as uuidv4 } from 'uuid'
import { useSupabase } from '../services/supabase'
import { sendRes } from './../services/utils'
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
const supabase = useSupabase()

const updateOrCreateVersion = async(update: Partial<definitions['app_versions']>) => {
  console.log('updateOrCreateVersion', update)
  const { data, error } = await supabase
    .from<definitions['app_versions']>('app_versions')
    .select()
    .eq('app_id', update.app_id)
    .eq('name', update.name)
  if (data && data.length && !error) {
    return supabase
      .from<definitions['app_versions']>('app_versions')
      .update(update)
      .eq('app_id', update.app_id)
      .eq('name', update.name)
  }
  else {
    return await supabase
      .from<definitions['app_versions']>('app_versions')
      .insert(update)
  }
}

const updateOrCreateChannel = async(user_id: string, update: Partial<definitions['channels']>) => {
  console.log('updateOrCreateChannel', update)
  const { data, error } = await supabase
    .from<definitions['channels']>('channels')
    .select()
    .eq('app_id', update.app_id)
    .eq('name', update.name)
    .eq('created_by', user_id)
  if (data && data.length && !error) {
    return supabase
      .from<definitions['channels']>('channels')
      .update(update)
      .eq('app_id', update.app_id)
      .eq('name', update.name)
      .eq('created_by', user_id)
  }
  else {
    return supabase
      .from<definitions['channels']>('channels')
      .insert(update)
  }
}
export const handler: Handler = async(event) => {
  console.log(event.httpMethod)
  if (event.httpMethod === 'OPTIONS')
    return sendRes()

  const { authorization } = event.headers

  let isVerified = false
  let apikey: definitions['apikeys'] | null = null
  try {
    const { data, error } = await supabase
      .from<definitions['apikeys']>('apikeys')
      .select()
      .eq('key', authorization)
    if (!data || !data.length)
      return sendRes({ status: 'Requires Authorization' }, 400)

    apikey = data[0]
    isVerified = !!apikey && !error
  }
  catch (error) {
    isVerified = false
    console.error(error)
  }
  if (!isVerified || !apikey || apikey.mode === 'read' || !event.body)
    return sendRes({ status: 'Cannot Verify User' }, 400)

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
      if (dnError || !data)
        return sendRes({ status: 'Cannot download partial File to concat' }, 400)

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
    if (error)
      return sendRes({ status: 'Cannot Upload File' }, 400)

    if (body.isMultipart) {
      // send filename to allow partial upload
      const isDone = (body.chunk || 0) === (body.totalChunks || 0) && body.fileName
      if (!isDone)
        return sendRes({ status: 'multipart', fileName })
    }
    const { data: version, error: dbError } = await updateOrCreateVersion({
      bucket_id: fileName,
      user_id: apikey.user_id,
      name: body.version,
      app_id: body.appid,
    })
    const { error: dbError2 } = await supabase
      .from<definitions['apps']>('apps')
      .update({
        last_version: body.version,
      }).eq('app_id', body.appid)
      .eq('user_id', apikey.user_id)
    if (dbError || dbError2 || !version || !version.length) {
      return sendRes({
        status: 'Cannot add version',
        err: JSON.stringify(dbError),
      }, 400)
    }
    try {
      const { error: dbError2 } = await updateOrCreateChannel(apikey.user_id, {
        name: body.channel,
        app_id: body.appid,
        created_by: apikey.user_id,
        version: version[0].id,
      })
      if (dbError2) {
        return sendRes({
          status: 'Cannot update or add channel',
          err: JSON.stringify(dbError2),
        }, 400)
      }
    }
    catch (err) {
      return sendRes({
        status: 'Error channel',
        err: JSON.stringify(err),
      }, 400)
    }
    return sendRes()
  }
  catch (e) {
    return sendRes({
      status: 'Error unknow',
      err: JSON.stringify(e),
    }, 500)
  }
}
