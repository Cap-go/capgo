import type { Context } from '@hono/hono'
import type { UpdatePayload } from '../utils/supabase.ts'
import type { Database } from '../utils/supabase.types.ts'
import { Hono } from 'hono/tiny'
import { BRES, middlewareAPISecret } from '../utils/hono.ts'
import { getPath, s3 } from '../utils/s3.ts'
import { createStatsMeta } from '../utils/stats.ts'
import { supabaseAdmin } from '../utils/supabase.ts'

// Generate a v4 UUID. For this we use the browser standard `crypto.randomUUID`
async function updateIt(c: Context, body: UpdatePayload<'app_versions'>) {
  const record = body.record as Database['public']['Tables']['app_versions']['Row']

  const v2Path = await getPath(c, record)

  if (v2Path && record.storage_provider === 'r2') {
    // pdate size and checksum
    console.log({ requestId: c.get('requestId'), context: 'V2', bucket_id: record.bucket_id, r2_path: record.r2_path })
    // set checksum in s3
    const size = await s3.getSize(c, v2Path)
    if (size) {
      // allow to update even without checksum, to prevent bad actor to remove checksum to get free storage
      const { error: errorUpdate } = await supabaseAdmin(c)
        .from('app_versions_meta')
        .update({
          size,
          checksum: record.checksum ?? '',
        })
        .eq('id', record.id)
      if (errorUpdate)
        console.log({ requestId: c.get('requestId'), context: 'errorUpdate', error: errorUpdate })
      const { error } = await createStatsMeta(c, record.app_id, record.id, size)
      if (error)
        console.log({ requestId: c.get('requestId'), context: 'error createStatsMeta', error })
    }
  }
  else {
    console.log({ requestId: c.get('requestId'), context: 'no v2 path' })
  }
  return c.json(BRES)
}

export async function deleteIt(c: Context, record: Database['public']['Tables']['app_versions']['Row']) {
  console.log({ requestId: c.get('requestId'), context: 'Delete', bucket_id: record.bucket_id, r2_path: record.r2_path })

  const v2Path = await getPath(c, record)
  if (!v2Path) {
    console.log({ requestId: c.get('requestId'), context: 'No r2 path' })
    return c.json(BRES)
  }

  try {
    await s3.deleteObject(c, v2Path)
  }
  catch (error) {
    console.log({ requestId: c.get('requestId'), context: 'Cannot delete s3 (v2)', bucket_id: record.bucket_id, error })
    return c.json(BRES)
  }

  const { data, error: dbError } = await supabaseAdmin(c)
    .from('app_versions_meta')
    .select()
    .eq('id', record.id)
    .single()
  if (dbError || !data) {
    console.log({ requestId: c.get('requestId'), context: 'Cannot find version meta', id: record.id })
    return c.json(BRES)
  }
  await createStatsMeta(c, record.app_id, record.id, -data.size)
  // set app_versions_meta versionSize = 0
  const { error: errorUpdate } = await supabaseAdmin(c)
    .from('app_versions_meta')
    .update({ size: 0 })
    .eq('id', record.id)
  if (errorUpdate)
    console.log({ requestId: c.get('requestId'), context: 'error', error: errorUpdate })

  if (record.bucket_id) {
    const { error: errorDelete } = await supabaseAdmin(c)
      .storage
      .from(`apps/${record.user_id}/${record.app_id}/versions`)
      .remove([record.bucket_id])

    if (errorDelete)
      console.log({ requestId: c.get('requestId'), context: 'errorDelete from supabase storage', bucket_id: record.bucket_id, error: errorDelete })
  }

  return c.json(BRES)
}

export const app = new Hono()

app.post('/', middlewareAPISecret, async (c: Context) => {
  try {
    const table: keyof Database['public']['Tables'] = 'app_versions'
    const body = await c.req.json<UpdatePayload<typeof table>>()
    if (body.table !== table) {
      console.log({ requestId: c.get('requestId'), context: `Not ${table}` })
      return c.json({ status: `Not ${table}` }, 200)
    }
    if (body.type !== 'UPDATE') {
      console.log({ requestId: c.get('requestId'), context: 'Not UPDATE' })
      return c.json({ status: 'Not UPDATE' }, 200)
    }
    const record = body.record
    console.log({ requestId: c.get('requestId'), context: 'record', record })

    if (!record.app_id || !record.user_id) {
      console.log({ requestId: c.get('requestId'), context: 'no app_id or user_id' })
      return c.json(BRES)
    }
    if (!record.bucket_id && !record.r2_path) {
      console.log({ requestId: c.get('requestId'), context: 'no bucket_id' })
      return c.json(BRES)
    }
    // // check if not deleted it's present in s3 storage
    if (record.deleted && record.deleted !== body.old_record.deleted)
      return deleteIt(c, body.record as any)

    console.log({ requestId: c.get('requestId'), context: 'Update but not deleted' })
    return updateIt(c, body)
  }
  catch (e) {
    return c.json({ status: 'Cannot update version', error: JSON.stringify(e) }, 500)
  }
})
