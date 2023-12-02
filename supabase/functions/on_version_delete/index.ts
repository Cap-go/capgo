import type { UpdatePayload } from '../_utils/supabase.ts'
import { supabaseAdmin } from '../_utils/supabase.ts'
import { r2 } from '../_utils/r2.ts'
import type { Database } from '../_utils/supabase.types.ts'
import { getEnv, sendRes } from '../_utils/utils.ts'
import { sendMetaToClickHouse } from '../_utils/clickhouse.ts'

async function isDelete(body: UpdatePayload<'app_versions'>) {
  const record = body.record

  if (!record.bucket_id) {
    console.log('no bucket_id')
    return sendRes()
  }
  if (!record.app_id || !record.user_id) {
    console.log('no app_id or user_id')
    return sendRes()
  }
  if (!record.id) {
    console.log('no id')
    return sendRes()
  }
  console.log('Delete', record.bucket_id)

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
  else {
    // delete in r2 (V2)
    const v2Path = `apps/${record.user_id}/${record.app_id}/versions/${record.bucket_id}`
    const existV2 = await r2.checkIfExist(v2Path)

    if (existV2) {
      try {
        await r2.deleteObject(v2Path)
      }
      catch (error) {
        console.log('Cannot delete r2 (v2)', record.bucket_id, error)
        return sendRes()
      }
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
  await sendMetaToClickHouse({
    id: record.id,
    created_at: new Date().toISOString(),
    app_id: record.app_id,
    size: 0,
    action: 'delete',
  })
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
    console.log('errorDelete from supabase storage', record.bucket_id, errorDelete)
  return sendRes()
}

Deno.serve(async (event: Request) => {
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
    return isDelete(body)
  }
  catch (e) {
    return sendRes({
      status: 'Error unknow',
      error: JSON.stringify(e),
    }, 500)
  }
})
