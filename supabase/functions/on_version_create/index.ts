import { serve } from 'https://deno.land/std@0.155.0/http/server.ts'
import { crc32 } from 'https://deno.land/x/crc32/mod.ts'
import type { AppStatsIncrement } from '../_utils/supabase.ts'
import { supabaseAdmin, updateOrAppStats } from '../_utils/supabase.ts'
import type { definitions } from '../_utils/types_supabase.ts'
import { sendRes } from '../_utils/utils.ts'

// Generate a v4 UUID. For this we use the browser standard `crypto.randomUUID`
// function.
serve(async (event: Request) => {
  const API_SECRET = Deno.env.get('API_SECRET')
  const authorizationSecret = event.headers.get('apisecret')
  if (!authorizationSecret)
    return sendRes({ status: 'Cannot find authorization secret' }, 400)
  if (!authorizationSecret || !API_SECRET || authorizationSecret !== API_SECRET) {
    console.log('Fail Authorization')
    return sendRes({ message: 'Fail Authorization' }, 400)
  }
  try {
    console.log('body')
    const body = (await event.json()) as { record: definitions['app_versions'] }
    const record = body.record

    if (!record.bucket_id) {
      console.log('Cannot find bucket_id')
      return sendRes()
    }

    const { data, error } = await supabaseAdmin
      .storage
      .from(`apps/${record.user_id}/${record.app_id}/versions`)
      .download(record.bucket_id)
    if (error || !data) {
      console.log('Error', record.bucket_id, error)
      return sendRes()
    }
    const u = await new Response(data).arrayBuffer()
    // get the size of the Uint8Array
    const size = u.byteLength
    // cr32 hash the file
    const checksum = crc32(new Uint8Array(u))
    // create app version meta
    const { error: dbError } = await supabaseAdmin
      .from<definitions['app_versions_meta']>('app_versions_meta')
      .insert({
        id: record.id,
        app_id: record.app_id,
        user_id: record.user_id,
        checksum,
        size,
      })
    if (dbError)
      console.error('Cannot create app version meta', dbError)
    const today_id = new Date().toISOString().slice(0, 10)
    const increment: AppStatsIncrement = {
      app_id: record.app_id,
      date_id: today_id,
      bandwidth: 0,
      mlu: 0,
      mlu_real: 0,
      devices: 0,
      version_size: size,
      channels: 0,
      shared: 0,
      versions: 1,
    }
    await updateOrAppStats(increment, today_id, record.user_id)
    return sendRes()
  }
  catch (e) {
    console.log('Error', e)
    return sendRes({
      status: 'Error unknow',
      error: JSON.stringify(e),
    }, 500)
  }
})
