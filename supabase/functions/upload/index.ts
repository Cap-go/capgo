import { serve } from 'https://deno.land/std@0.133.0/http/server.ts'
import { Buffer } from 'https://deno.land/x/node_buffer@1.1.0/index.ts'
import { supabaseAdmin, updateOrCreateChannel, updateOrCreateVersion } from '../_utils/supabase.ts'
import type { definitions } from '../_utils/types_supabase.ts'
import { checkKey, sendRes } from '../_utils/utils.ts'

interface AppUpload {
  appid: string
  version: string
  app: string
  format?: string
  fileName?: string
  isMultipart?: boolean
  external?: string
  chunk?: number
  totalChunks?: number
  channel: string
}

serve(async(event: Request) => {
  const supabase = supabaseAdmin
  const authorization = event.headers.get('apikey')
  if (!authorization)
    return sendRes({ status: 'Cannot find authorization' }, 400)
  const apikey: definitions['apikeys'] | null = await checkKey(authorization, supabase, ['upload', 'all', 'write'])
  if (!apikey || !event.body)
    return sendRes({ status: 'Cannot Verify User' }, 400)
  try {
    const body = (await event.json()) as AppUpload
    const { data: appData, error: dbError0 } = await supabase
      .from<definitions['apps']>('apps')
      .select()
      .eq('app_id', body.appid)
      .eq('user_id', apikey.user_id)
    if (!appData?.length || dbError0)
      return sendRes({ status: `Cannot find app ${body.appid} in your account` }, 400)
    if (body.totalChunks && body.totalChunks > 30)
      return sendRes({ status: 'app too big', error: 'we dont support app above 30 Mb for now, try to optimise your assets.' }, 400)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { app, ...newObject } = body
    // eslint-disable-next-line no-console
    console.log('body', newObject)
    let fileName = globalThis.crypto.randomUUID()
    const filePath = `apps/${apikey.user_id}/${body.appid}/versions`
    const dataFormat = body.format || 'base64'
    let error
    if (body.isMultipart && body.fileName && !body.external) {
      fileName = body.fileName
      const { data, error: dnError } = await supabase
        .storage
        .from(filePath)
        .download(fileName)
      if (dnError || !data)
        return sendRes({ status: 'Cannot download partial File to concat', error: JSON.stringify(dnError || { err: 'unknow error' }) }, 400)

      const arrayBuffer = await data.arrayBuffer()
      const buffOld = Buffer.from(arrayBuffer)
      const buffNew = Buffer.from(app, dataFormat)
      const bufAll = Buffer.concat([buffOld, buffNew], buffOld.length + buffNew.length)
      const { error: upError } = await supabase
        .storage
        .from(filePath)
        .update(fileName, bufAll, {
          contentType: 'application/zip',
          upsert: true,
        })
      error = upError
    }
    else if (!body.external) {
      const { error: upError } = await supabase.storage
        .from(filePath)
        .upload(fileName, Buffer.from(app, dataFormat), {
          contentType: 'application/zip',
        })
      error = upError
    }
    if (error) {
      console.error(error, 'unknow error')
      return sendRes({ status: 'Cannot Upload File', error: JSON.stringify(error) }, 400)
    }
    if (body.isMultipart && !((body.chunk || 0) === (body.totalChunks || 0) && body.fileName))
      return sendRes({ status: 'multipart', fileName })

    if (body.external && !body.external.startsWith('https://'))
      return sendRes({ status: 'external refused', error: `it should start with "https://" current is "${body.external}"` }, 400)
    const { data: version, error: dbError } = await updateOrCreateVersion({
      bucket_id: body.external ? undefined : fileName,
      user_id: apikey.user_id,
      name: body.version,
      app_id: body.appid,
      external_url: body.external,
    })
    const { error: dbError2 } = await supabase
      .from<definitions['apps']>('apps')
      .update({
        last_version: body.version,
      }).eq('app_id', body.appid)
      .eq('user_id', apikey.user_id)
    if (dbError || dbError2 || !version || !version.length) {
      console.error(dbError, dbError2, 'unknow error')
      return sendRes({
        status: 'Cannot add version',
        err: JSON.stringify(dbError || dbError2 || { err: 'unknow error' }),
      }, 400)
    }
    try {
      const { error: dbError3 } = await updateOrCreateChannel({
        name: body.channel,
        app_id: body.appid,
        created_by: apikey.user_id,
        version: version[0].id,
      })
      if (dbError3) {
        console.error(dbError3, 'unknow error')
        return sendRes({
          status: 'Cannot update or add channel',
          error: JSON.stringify(dbError3),
        }, 400)
      }
    }
    catch (err) {
      console.error(err, 'unknow error')
      return sendRes({
        status: 'Error channel',
        error: JSON.stringify(err),
      }, 400)
    }
    return sendRes()
  }
  catch (e) {
    return sendRes({
      status: 'Error unknow',
      error: JSON.stringify(e),
    }, 500)
  }
})
