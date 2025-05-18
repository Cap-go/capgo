import type { Context } from '@hono/hono'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
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
    console.log({ requestId: c.get('requestId'), message: 'V2', r2_path: record.r2_path })
    // set checksum in s3
    const size = await s3.getSize(c, v2Path)
    if (size) {
      // allow to update even without checksum, to prevent bad actor to remove checksum to get free storage
      const { error: errorUpdate } = await supabaseAdmin(c)
        .from('app_versions_meta')
        .upsert({
          id: record.id,
          app_id: record.app_id,
          owner_org: record.owner_org,
          size,
          checksum: record.checksum ?? '',
        }, {
          onConflict: 'id',
        })
        .eq('id', record.id)
      if (errorUpdate)
        console.log({ requestId: c.get('requestId'), message: 'errorUpdate', error: errorUpdate })
      const { error } = await createStatsMeta(c, record.app_id, record.id, size)
      if (error)
        console.log({ requestId: c.get('requestId'), message: 'error createStatsMeta', error })
    }
    else {
      console.log({ requestId: c.get('requestId'), message: 'no size found for r2_path', r2_path: record.r2_path })
    }
  }
  else {
    console.log({ requestId: c.get('requestId'), message: 'no v2 path' })
    const { error: errorUpdate } = await supabaseAdmin(c)
      .from('app_versions_meta')
      .upsert({
        id: record.id,
        app_id: record.app_id,
        owner_org: record.owner_org,
        size: 0,
        checksum: record.checksum ?? '',
      }, {
        onConflict: 'id',
      })
      .eq('id', record.id)
    if (errorUpdate)
      console.log({ requestId: c.get('requestId'), message: 'errorUpdate', error: errorUpdate })
  }

  // Handle manifest entries
  if (record.manifest) {
    console.log({ requestId: c.get('requestId'), message: 'manifest', manifest: record.manifest })
    const manifestEntries = record.manifest as Database['public']['CompositeTypes']['manifest_entry'][]

    // Check if entries exist
    const { data: existingEntries } = await supabaseAdmin(c)
      .from('manifest')
      .select('id')
      .eq('app_version_id', record.id)
      .limit(1)

    // Only create entries if none exist
    if (!existingEntries?.length && manifestEntries.length > 0) {
      const validEntries = manifestEntries
        .filter(entry => entry.file_name && entry.file_hash && entry.s3_path)
        .map(entry => ({
          app_version_id: record.id,
          file_name: entry.file_name!,
          file_hash: entry.file_hash!,
          s3_path: entry.s3_path!,
          file_size: 0,
        }))

      if (validEntries.length > 0) {
        const { error: insertError } = await supabaseAdmin(c)
          .from('manifest')
          .insert(validEntries)
        if (insertError)
          console.log({ requestId: c.get('requestId'), message: 'error insert manifest', error: insertError })
      }
    }
    // delete manifest in app_versions
    const { error: deleteError } = await supabaseAdmin(c)
      .from('app_versions')
      .update({ manifest: null })
      .eq('id', record.id)
    if (deleteError)
      console.log({ requestId: c.get('requestId'), message: 'error delete manifest in app_versions', error: deleteError })
  }

  return c.json(BRES)
}

export async function deleteIt(c: Context, record: Database['public']['Tables']['app_versions']['Row']) {
  console.log({ requestId: c.get('requestId'), message: 'Delete', r2_path: record.r2_path })

  const v2Path = await getPath(c, record)
  if (!v2Path) {
    console.log({ requestId: c.get('requestId'), message: 'No r2 path' })
    return c.json(BRES)
  }

  try {
    await s3.deleteObject(c, v2Path)
  }
  catch (error) {
    console.log({ requestId: c.get('requestId'), message: 'Cannot delete s3 (v2)', error })
    return c.json(BRES)
  }

  const { data, error: dbError } = await supabaseAdmin(c)
    .from('app_versions_meta')
    .select()
    .eq('id', record.id)
    .single()
  if (dbError || !data) {
    console.log({ requestId: c.get('requestId'), message: 'Cannot find version meta', id: record.id })
    return c.json(BRES)
  }
  await createStatsMeta(c, record.app_id, record.id, -data.size)
  // set app_versions_meta versionSize = 0
  const { error: errorUpdate } = await supabaseAdmin(c)
    .from('app_versions_meta')
    .update({ size: 0 })
    .eq('id', record.id)
  if (errorUpdate)
    console.log({ requestId: c.get('requestId'), message: 'error', error: errorUpdate })

  // Delete manifest entries
  const { error: deleteError } = await supabaseAdmin(c)
    .from('manifest')
    .delete()
    .eq('app_version_id', record.id)
  if (deleteError)
    console.log({ requestId: c.get('requestId'), message: 'error delete manifest', error: deleteError })

  return c.json(BRES)
}

export const app = new Hono<MiddlewareKeyVariables>()

app.post('/', middlewareAPISecret, async (c) => {
  try {
    const table: keyof Database['public']['Tables'] = 'app_versions'
    const body = await c.req.json<UpdatePayload<typeof table>>()
    if (body.table !== table) {
      console.log({ requestId: c.get('requestId'), message: `Not ${table}` })
      return c.json({ status: `Not ${table}` }, 200)
    }
    if (body.type !== 'UPDATE') {
      console.log({ requestId: c.get('requestId'), message: 'Not UPDATE' })
      return c.json({ status: 'Not UPDATE' }, 200)
    }
    const record = body.record
    console.log({ requestId: c.get('requestId'), message: 'record', record })

    if (!record.app_id) {
      console.log({ requestId: c.get('requestId'), message: 'no app_id', record })
      return c.json(BRES)
    }
    if (!record.r2_path && !record.manifest) {
      console.log({ requestId: c.get('requestId'), message: 'no r2_path and no manifest, skipping update', record })
      return c.json(BRES)
    }
    // // check if not deleted it's present in s3 storage
    if (record.deleted && record.deleted !== body.old_record.deleted)
      return deleteIt(c as any, body.record as any)

    console.log({ requestId: c.get('requestId'), message: 'Update but not deleted' })
    return updateIt(c as any, body)
  }
  catch (e) {
    return c.json({ status: 'Cannot update version', error: JSON.stringify(e) }, 500)
  }
})
