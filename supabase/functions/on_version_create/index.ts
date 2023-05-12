import { serve } from 'https://deno.land/std@0.186.0/http/server.ts'
import { crc32 } from 'https://deno.land/x/crc32/mod.ts'
import { r2 } from '../_utils/r2.ts'
import type { InsertPayload } from '../_utils/supabase.ts'
import { supabaseAdmin, updateOrAppStats } from '../_utils/supabase.ts'
import type { Database } from '../_utils/supabase.types.ts'
import { getEnv, sendRes } from '../_utils/utils.ts'

// Generate a v4 UUID. For this we use the browser standard `crypto.randomUUID`
// function.
serve(async (event: Request) => {
  const API_SECRET = getEnv('API_SECRET')
  const authorizationSecret = event.headers.get('apisecret')
  if (!authorizationSecret || !API_SECRET || authorizationSecret !== API_SECRET)
    return sendRes({ message: 'Fail Authorization' }, 400)

  try {
    const table: keyof Database['public']['Tables'] = 'app_versions'
    const body = (await event.json()) as InsertPayload<typeof table>
    if (body.table !== table) {
      console.log(`Not ${table}`)
      return sendRes({ message: `Not ${table}` }, 200)
    }
    if (body.type !== 'INSERT') {
      console.log('Not INSERT')
      return sendRes({ message: 'Not INSERT' }, 200)
    }
    const record = body.record
    console.log('record', record)

    const { error: errorUpdate } = await supabaseAdmin()
      .from('apps')
      .update({
        last_version: record.name,
      })
      .eq('app_id', record.app_id)
      .eq('user_id', record.user_id)
    if (errorUpdate)
      console.log('errorUpdate', errorUpdate)

    if (!record.bucket_id) {
      console.log('No bucket_id')
      const { error: dbError } = await supabaseAdmin()
        .from('app_versions_meta')
        .insert({
          id: record.id,
          app_id: record.app_id,
          user_id: record.user_id,
          checksum: '',
          size: 0,
        })
      if (dbError)
        console.error('Cannot create app version meta', dbError)
      return sendRes()
    }

    const { data, error } = await supabaseAdmin()
      .storage
      .from(`apps/${record.user_id}/${record.app_id}/versions`)
      .download(record.bucket_id)
    if (error || !data) {
      console.log('Error', record.bucket_id, error)
      return sendRes()
    }
    const u = await data.arrayBuffer()
    // get the size of the Uint8Array
    const size = u.byteLength
    const unit8 = new Uint8Array(u)
    // cr32 hash the file
    const checksum = crc32(unit8)
    // create app version meta
    const { error: dbError } = await supabaseAdmin()
      .from('app_versions_meta')
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
    const increment: Database['public']['Functions']['increment_stats_v2']['Args'] = {
      app_id: record.app_id,
      date_id: today_id,
      bandwidth: 0,
      mlu: 0,
      mlu_real: 0,
      devices: 0,
      devices_real: 0,
      version_size: size,
      channels: 0,
      shared: 0,
      versions: 1,
    }
    await updateOrAppStats(increment, today_id, record.user_id)
    await r2.upload(record.bucket_id, unit8)
    // modify app_versions to set storage to r2
    const { error: errorUpdateStorage } = await supabaseAdmin()
      .from('app_versions')
      .update({
        storage_provider: 'r2',
      })
      .eq('id', record.id)
    if (errorUpdateStorage)
      console.log('errorUpdateStorage', errorUpdateStorage)
    // remove from supabase storage after r2 upload
    const { error: errorDelete } = await supabaseAdmin()
      .storage
      .from(`apps/${record.user_id}/${record.app_id}/versions`)
      .remove([record.bucket_id])
    if (errorDelete)
      console.log('errorDelete', errorDelete)
    return sendRes()
  }
  catch (e) {
    console.error('e', e)
    return sendRes({
      status: 'Error unknow',
      error: JSON.stringify(e),
    }, 500)
  }
})
