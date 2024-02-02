// @transform node import 'crc-32' to deno 'npm:crc-32/crc32c'
import { buf as crc32 } from "crc-32/crc32c";
// @transform node import 'hono' to deno 'npm:hono'
import { Hono } from 'hono'
import type { Context } from 'hono'
import { BRES, middlewareAPISecret } from '../../_utils/hono.ts';
import { InsertPayload, supabaseAdmin } from '../../_utils/supabase.ts';
import { Database } from '../../_utils/supabase.types.ts';
import { r2 } from '../../_utils/r2.ts';
import { sendMetaToClickHouse } from '../../_utils/clickhouse.ts';

export const app = new Hono()

app.post('/', middlewareAPISecret, async (c: Context) => {
  try {
    const table: keyof Database['public']['Tables'] = 'app_versions'
    const body = await c.req.json<InsertPayload<typeof table>>()
    if (body.table !== table) {
      console.log(`Not ${table}`)
      return c.json({ status: `Not ${table}` }, 200)
    }
    if (body.type !== 'INSERT') {
      console.log('Not INSERT')
      return c.json({ status: 'Not INSERT' }, 200)
    }
    const record = body.record
    console.log('record', record)

    if (!record.id) {
      console.log('No id')
      return c.json(BRES)
    }

    const { error: errorUpdate } = await supabaseAdmin(c)
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
      const { error: dbError } = await supabaseAdmin(c)
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
      return c.json(BRES)
    }

    // Invalidate cache
    if (!record.app_id) {
      return c.json({
        status: 'error app_id',
        error: 'Np app id included the request',
      }, 500)
    }

    let checksum = ''
    let size = 0
    if (record.storage_provider === 'r2-direct') {
      // skip checksum and size for r2-direct
      console.log('r2-direct skip checksum and size')
    }
    else {
      const { data, error } = await supabaseAdmin(c)
        .storage
        .from(`apps/${record.user_id}/${record.app_id}/versions`)
        .download(record.bucket_id)
      if (error || !data) {
        console.log('Error', record.bucket_id, error)
        return c.json(BRES)
      }
      const u = await data.arrayBuffer()
      // get the size of the Uint8Array
      size = u.byteLength
      const unit8 = new Uint8Array(u)
      // cr32 hash the file
      checksum = crc32(unit8).toString(16)
      await r2.upload(c, record.bucket_id, unit8)
    }

    // create app version meta
    const { error: dbError } = await supabaseAdmin(c)
      .from('app_versions_meta')
      .insert({
        id: record.id,
        app_id: record.app_id,
        user_id: record.user_id,
        checksum,
        size,
      })
    await sendMetaToClickHouse(c, [{

      id: record.id,
      created_at: new Date().toISOString(),
      app_id: record.app_id,
      size,
      action: 'add',
    }])
    if (dbError)
      console.error('Cannot create app version meta', dbError)
    if (record.storage_provider === 'r2-direct')
      return c.json(BRES) // skip delete s3 and increment size in new upload

    // `apps/${record.user_id}/${record.app_id}/versions/${record.bucket_id}`
    // modify app_versions to set storage to r2
    const { error: errorUpdateStorage } = await supabaseAdmin(c)
      .from('app_versions')
      .update({
        storage_provider: 'r2',
      })
      .eq('id', record.id)
    if (errorUpdateStorage)
      console.log('errorUpdateStorage', errorUpdateStorage)
    // remove from supabase storage after r2 upload
    const { error: errorDelete } = await supabaseAdmin(c)
      .storage
      .from(`apps/${record.user_id}/${record.app_id}/versions`)
      .remove([record.bucket_id])
    if (errorDelete)
      console.log('errorDelete', errorDelete)
    return c.json(BRES)
  } catch (e) {
    return c.json({ status: 'Cannot process version', error: JSON.stringify(e) }, 500)
  }
})
