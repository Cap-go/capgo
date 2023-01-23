import { serve } from 'https://deno.land/std@0.171.0/http/server.ts'
import type { UpdatePayload } from '../_utils/supabase.ts'
import { r2 } from '../_utils/r2.ts'
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
    const body = (await event.json()) as UpdatePayload<typeof table>
    if (body.table !== table) {
      console.log(`Not ${table}`)
      return sendRes({ message: `Not ${table}` }, 200)
    }
    if (body.type !== 'UPDATE') {
      console.log('Not UPDATE')
      return sendRes({ message: 'Not UPDATE' }, 200)
    }
    // console.log('body', body)
    const record = body.record
    console.log('record', record)

    if (!record.app_id || !record.user_id) {
      console.log('no app_id or user_id')
      return sendRes()
    }
    if (!record.bucket_id) {
      console.log('no bucket_id')
      return sendRes()
    }
    // // check if not deleted it's present in r2 storage
    if (!record.deleted) {
      const exist = await r2.checkIfExist(record.bucket_id)
      console.log('exist ?', exist)
      if (!exist) {
        console.log('upload to r2', record.bucket_id)
        // upload to r2
        const { data, error } = await supabaseAdmin()
          .storage
          .from(`apps/${record.user_id}/${record.app_id}/versions`)
          .download(record.bucket_id)
        if (error || !data) {
          console.log('Cannot download', record.bucket_id)
          return sendRes()
        }
        try {
          const u = await data.arrayBuffer()
          const unit8 = new Uint8Array(u)
          await r2.upload(record.bucket_id, unit8)
          const { error: errorUpdateStorage } = await supabaseAdmin()
            .from('app_versions')
            .update({
              storage_provider: 'r2',
            })
            .eq('id', record.id)
          if (errorUpdateStorage)
            console.log('errorUpdateStorage', errorUpdateStorage)
        }
        catch (error) {
          console.log('Cannot upload', record.bucket_id, error)
          return sendRes()
        }
      }
      else if (record.storage_provider !== 'r2') {
        const { error: errorUpdateStorage } = await supabaseAdmin()
          .from('app_versions')
          .update({
            storage_provider: 'r2',
          })
          .eq('id', record.id)
        if (errorUpdateStorage)
          console.log('errorUpdateStorage', errorUpdateStorage)
      }
    }
    if (record.deleted === body.old_record.deleted) {
      console.log('Update but not deleted')
      return sendRes()
    }
    // check if in r2 storage and delete
    const exist = await r2.checkIfExist(record.bucket_id)
    if (exist) {
      // delete in r2
      try {
        await r2.deleteObject(record.bucket_id)
      }
      catch (error) {
        console.log('Cannot delete r2', record.bucket_id, error)
        return sendRes()
      }
    }

    const { data, error: dbError } = await supabaseAdmin()
      .from('app_versions_meta')
      .select()
      .eq('id', record.id)
      .single()
    if (dbError || !data) {
      console.log('Cannot find version meta', record.id)
      return sendRes()
    }

    const today_id = new Date().toISOString().slice(0, 10)
    const increment: Database['public']['Functions']['increment_stats_v2']['Args'] = {
      app_id: record.app_id,
      date_id: today_id,
      bandwidth: 0,
      mlu: 0,
      mlu_real: 0,
      devices: 0,
      devices_real: 0,
      version_size: -data.size,
      channels: 0,
      shared: 0,
      versions: -1,
    }
    await updateOrAppStats(increment, today_id, record.user_id)
    // set app_versions_meta versionSize = 0
    const { error: errorUpdate } = await supabaseAdmin()
      .from('app_versions_meta')
      .update({ size: 0 })
      .eq('id', record.id)
    if (errorUpdate)
      console.log('error', errorUpdate)
    const { error: errorDelete } = await supabaseAdmin()
      .storage
      .from(`apps/${record.user_id}/${record.app_id}/versions`)
      .remove([record.bucket_id])
    if (errorDelete)
      console.log('errorDelete', errorDelete)
    return sendRes()
  }
  catch (e) {
    return sendRes({
      status: 'Error unknow',
      error: JSON.stringify(e),
    }, 500)
  }
})
