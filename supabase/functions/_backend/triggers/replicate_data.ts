import type { Context } from '@hono/hono'
import type { DeletePayload, InsertPayload, UpdatePayload } from '../utils/supabase.ts'
import type { Database } from '../utils/supabase.types.ts'
import { Hono } from 'hono/tiny'
import { BRES, middlewareAPISecret } from '../utils/hono.ts'
import { supabaseAdmin } from '../utils/supabase.ts'

export const app = new Hono()

app.post('/', middlewareAPISecret, async (c: Context) => {
  try {
    const body = await c.req.json<(InsertPayload<keyof Database['public']['Tables']> | UpdatePayload<keyof Database['public']['Tables']> | DeletePayload<keyof Database['public']['Tables']>) & { retry_count: number }>()
    const { table, type, record, old_record, retry_count } = body

    if (!['INSERT', 'UPDATE', 'DELETE'].includes(type)) {
      console.log({ requestId: c.get('requestId'), context: 'Invalid operation type:', type })
      return c.json({ status: 'Invalid operation type' }, 200)
    }

    if (!c.env.DB_REPLICATE) {
      console.log({ requestId: c.get('requestId'), context: 'DB_REPLICATE is not set' })
      return c.json(BRES)
    }

    console.log({ requestId: c.get('requestId'), context: 'replicate_data', table, type, record, old_record })

    const d1 = c.env.DB_REPLICATE as D1Database

    switch (type) {
      case 'INSERT':
        insertRecord(c, retry_count, d1, table, record, body)
        break
      case 'UPDATE':
        updateRecord(c, retry_count, d1, table, record, old_record, body)
        break
      case 'DELETE':
        deleteRecord(c, retry_count, d1, table, old_record, body)
        break
    }

    console.log({ requestId: c.get('requestId'), context: `Replicated ${type} operation for table ${table}` })
    return c.json(BRES)
  }
  catch (e) {
    console.error({ requestId: c.get('requestId'), context: 'Error in replicate_data', error: e })
    const errorMessage = e instanceof Error ? e.message : String(e)
    return c.json({ status: 'Error in replication', error: errorMessage }, 500)
  }
})

// clean fields that are not in the d1 table
function cleanFieldsAppVersions(record: any, table: string) {
  // remove minUpdateVersion
  if (table === 'app_versions') {
    delete record.minUpdateVersion
    delete record.native_packages
    // in app_versions there is a colmn named manifest, but in d1 it's a JSON type convert it to make the insert work
    if (record.manifest) {
      record.manifest = JSON.stringify(record.manifest)
    }
  }
  if (table === 'channels') {
    delete record.secondVersion
    delete record.secondaryVersionPercentage
    delete record.disableAutoUpdate
  }
  // device_id_lower when fucked the migration
  if (table === 'channel_devices') {
    delete record.device_id_lower
  }
  if (table === 'devices_override') {
    delete record.device_id_lower
  }

  return record
}

// function to c.executionCtx.waitUntil the db operation and catch issue who insert in job_queue as failed job
function asyncWrap(c: Context, promise: Promise<any>, payload: any, retry_count: number) {
  c.executionCtx.waitUntil(promise.catch((e) => {
    console.error({ requestId: c.get('requestId'), context: 'Error in replicateData', error: e })
    // if error is { "error": "D1_ERROR: UNIQUE constraint failed: apps.name: SQLITE_CONSTRAINT" } or any Unique constraint failed return as success
    if (e.message.includes('UNIQUE constraint failed')) {
      return
    }
    if (payload.retry_count != null) {
      payload.retry_count = retry_count + 1
    }
    // insert in job_queue as failed job in supabase
    const supabase = supabaseAdmin(c)
    return supabase.from('job_queue')
      .insert({
        job_type: 'TRIGGER',
        status: 'failed' as Database['public']['Enums']['queue_job_status'],
        function_type: 'cloudflare',
        function_name: 'replicate_data',
        retry_count: retry_count + 1,
        payload: JSON.stringify(payload),
        extra_info: { error: e.message },
      })
  }))
}

function insertRecord(c: Context, retry_count: number, d1: D1Database, table: string, record: any, payload: any) {
  const columns = Object.keys(cleanFieldsAppVersions(record, table)).join(', ')
  const placeholders = Object.keys(record).map(() => '?').join(', ')
  const values = Object.values(cleanFieldsAppVersions(record, table))

  const query = `INSERT INTO ${table} (${columns}) VALUES (${placeholders})`
  console.log({ requestId: c.get('requestId'), context: 'insertRecord', query, values })
  asyncWrap(c, d1.prepare(query).bind(...values).run(), payload, retry_count)
}

function updateRecord(c: Context, retry_count: number, d1: D1Database, table: string, record: any, old_record: any, payload: any) {
  const setClause = Object.keys(cleanFieldsAppVersions(record, table)).map(key => `${key} = ?`).join(', ')
  const values = [...Object.values(cleanFieldsAppVersions(record, table)), old_record.id]

  const query = `UPDATE ${table} SET ${setClause} WHERE id = ?`
  console.log({ requestId: c.get('requestId'), context: 'updateRecord', query, values })
  asyncWrap(c, Promise.reject(new Error('rejected :)')), payload, retry_count)
}

function deleteRecord(c: Context, retry_count: number, d1: D1Database, table: string, old_record: any, payload: any) {
  const query = `DELETE FROM ${table} WHERE id = ?`
  console.log({ requestId: c.get('requestId'), context: 'deleteRecord', query, old_record: old_record.id })
  asyncWrap(c, d1.prepare(query).bind(old_record.id).run(), payload, retry_count)
}
