import { Hono } from 'hono'
import type { Context } from 'hono'
import { BRES, middlewareAPISecret } from '../../_utils/hono.ts';
import { UpdatePayload, supabaseAdmin } from '../../_utils/supabase.ts';
import { Database } from '../../_utils/supabase.types.ts';
import { sendMetaToClickHouse } from '../../_utils/clickhouse.ts';
import { r2 } from '../../_utils/r2.ts';

// Generate a v4 UUID. For this we use the browser standard `crypto.randomUUID`
async function updateIt(c: Context, body: UpdatePayload<'app_versions'>) {
  const record = body.record

  if (!record.bucket_id) {
    console.log('no bucket_id')
    return c.json(BRES)
  }
  if (!record.app_id) {
    console.log('no app_id')
    return c.json(BRES)
  }
  if (!record.user_id) {
    console.log('no user_id')
    return c.json(BRES)
  }
  if (!record.id) {
    console.log('no id')
    return c.json(BRES)
  }
  const exist = await r2.checkIfExist(c, record.bucket_id)
  console.log('exist ?', record.app_id, record.bucket_id, exist)
  if (!exist && !record.bucket_id.endsWith('.zip')) {
    console.log('upload to r2', record.bucket_id)
    // upload to r2
    const { data, error } = await supabaseAdmin(c)
      .storage
      .from(`apps/${record.user_id}/${record.app_id}/versions`)
      .download(record.bucket_id)
    if (error || !data) {
      console.log('Cannot download', record.bucket_id)
      return c.json(BRES)
    }
    try {
      const u = await data.arrayBuffer()
      const unit8 = new Uint8Array(u)
      await r2.upload(c, record.bucket_id, unit8)
      const { error: errorUpdateStorage } = await supabaseAdmin(c)
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
      return c.json(BRES)
    }
  }
  else {
    const v2Path = `apps/${record.user_id}/${record.app_id}/versions/${record.bucket_id}`
    const existV2 = await r2.checkIfExist(c, v2Path)

    if (existV2 && record.storage_provider === 'r2') {
      // pdate size and checksum
      console.log('V2', record.bucket_id)
      const { size, checksum } = await r2.getSizeChecksum(c, v2Path)
      if (size) {
        // allow to update even without checksum, to prevent bad actor to remove checksum to get free storage
        const { error: errorUpdate } = await supabaseAdmin(c)
          .from('app_versions_meta')
          .update({
            size,
            checksum,
          })
          .eq('id', record.id)
        if (errorUpdate)
          console.log('errorUpdate', errorUpdate)
        await sendMetaToClickHouse(c, {
          id: record.id,
          created_at: new Date().toISOString(),
          app_id: record.app_id,
          size,
          action: 'add',
        })
      }
    }
  }
  return c.json(BRES)
}

export async function deleteIt(c: Context, record: Database['public']['Tables']['app_versions']['Row']) {

  if (!record.bucket_id) {
    console.log('no bucket_id')
    return c.json(BRES)
  }
  if (!record.app_id || !record.user_id || !record.id) {
    console.log('no app_id or user_id')
    return c.json(BRES)
  }
  console.log('Delete', record.bucket_id)

  // check if in r2 storage and delete
  const exist = await r2.checkIfExist(c, record.bucket_id)

  if (exist) {
    // delete in r2
    try {
      await r2.deleteObject(c, record.bucket_id)
    }
    catch (error) {
      console.log('Cannot delete r2', record.bucket_id, error)
      return c.json(BRES)
    }
  }
  else {
    // delete in r2 (V2)
    const v2Path = `apps/${record.user_id}/${record.app_id}/versions/${record.bucket_id}`
    const existV2 = await r2.checkIfExist(c, v2Path)

    if (existV2) {
      try {
        await r2.deleteObject(c, v2Path)
      }
      catch (error) {
        console.log('Cannot delete r2 (v2)', record.bucket_id, error)
        return c.json(BRES)
      }
    }
  }

  const { data, error: dbError } = await supabaseAdmin(c)
    .from('app_versions_meta')
    .select()
    .eq('id', record.id)
    .single()
  if (dbError || !data) {
    console.log('Cannot find version meta', record.id)
    return c.json(BRES)
  }
  await sendMetaToClickHouse(c, {
    id: record.id,
    created_at: new Date().toISOString(),
    app_id: record.app_id,
    size: data.size,
    action: 'delete',
  })
  // set app_versions_meta versionSize = 0
  const { error: errorUpdate } = await supabaseAdmin(c)
    .from('app_versions_meta')
    .update({ size: 0 })
    .eq('id', record.id)
  if (errorUpdate)
    console.log('error', errorUpdate)
  const { error: errorDelete } = await supabaseAdmin(c)
    .storage
    .from(`apps/${record.user_id}/${record.app_id}/versions`)
    .remove([record.bucket_id])
  if (errorDelete)
    console.log('errorDelete from supabase storage', record.bucket_id, errorDelete)
  return c.json(BRES)
}


export const app = new Hono()

app.post('/', middlewareAPISecret, async (c: Context) => {
  try {
    const table: keyof Database['public']['Tables'] = 'app_versions'
    const body = await c.req.json<UpdatePayload<typeof table>>()
    if (body.table !== table) {
      console.log(`Not ${table}`)
      return c.json({ status: `Not ${table}` }, 200)
    }
    if (body.type !== 'UPDATE') {
      console.log('Not UPDATE')
      return c.json({ status: 'Not UPDATE' }, 200)
    }
    const record = body.record
    console.log('record', record)

    if (!record.app_id || !record.user_id) {
      console.log('no app_id or user_id')
      return c.json(BRES)
    }
    if (!record.bucket_id) {
      console.log('no bucket_id')
      return c.json(BRES)
    }
    // // check if not deleted it's present in r2 storage
    if (record.deleted && record.deleted !== body.old_record.deleted)
      return deleteIt(c, body.record as any)

    console.log('Update but not deleted')
    return updateIt(c, body)
  } catch (e) {
    return c.json({ status: 'Cannot process version', error: JSON.stringify(e) }, 500)
  }
})
