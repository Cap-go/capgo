import { Hono } from 'hono/tiny'
import type { Context } from '@hono/hono'
import { BRES, middlewareAPISecret } from '../utils/hono.ts'
import { supabaseAdmin } from '../utils/supabase.ts'
import type { DeletePayload, InsertPayload, UpdatePayload } from '../utils/supabase.ts'
import type { Database } from '../utils/supabase.types.ts'

export const app = new Hono()

app.post('/', middlewareAPISecret, async (c: Context) => {
  try {
    const body = await c.req.json<InsertPayload<keyof Database['public']['Tables']> | UpdatePayload<keyof Database['public']['Tables']> | DeletePayload<keyof Database['public']['Tables']>>()
    const { table, type, record, old_record } = body

    if (!['INSERT', 'UPDATE', 'DELETE'].includes(type)) {
      console.log('Invalid operation type:', type)
      return c.json({ status: 'Invalid operation type' }, 200)
    }

    if (!c.env.DB_REPLICATE) {
      console.log('DB_REPLICATE is not set')
      return c.json(BRES)
    }

    console.log('replicate_data', table, type, record, old_record)

    const d1 = c.env.DB_REPLICATE as D1Database

    switch (type) {
      case 'INSERT':
        insertRecord(c, d1, table, record, body)
        break
      case 'UPDATE':
        updateRecord(c, d1, table, record, old_record, body)
        break
      case 'DELETE':
        deleteRecord(c, d1, table, old_record, body)
        break
    }

    console.log(`Replicated ${type} operation for table ${table}`)
    return c.json(BRES)
  }
  catch (e) {
    console.error('Error in replicate_data:', e)
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
  }
  if (table === 'channels') {
    delete record.secondVersion
    delete record.secondaryVersionPercentage
    delete record.disableAutoUpdate
  }

  return record
}

// function to c.executionCtx.waitUntil the db operation and catch issue who insert in job_queue as failed job
function asyncWrap(c: Context, promise: Promise<any>, payload: any) {
  c.executionCtx.waitUntil(promise.catch((e) => {
    console.error('Error in replicateData:', e)
    // insert in job_queue as failed job in supabase
    const supabase = supabaseAdmin(c)
    return supabase.from('job_queue')
      .insert({
        job_type: 'TRIGGER',
        status: 'failed' as Database['public']['Enums']['queue_job_status'],
        function_type: 'cloudflare',
        function_name: 'replicate_data',
        payload: JSON.stringify(payload),
        extra_info: { error: e.message },
      })
  }))
}

function insertRecord(c: Context, d1: D1Database, table: string, record: any, payload: any) {
  const columns = Object.keys(cleanFieldsAppVersions(record, table)).join(', ')
  const placeholders = Object.keys(record).map(() => '?').join(', ')
  const values = Object.values(cleanFieldsAppVersions(record, table))

  const query = `INSERT INTO ${table} (${columns}) VALUES (${placeholders})`
  console.log('insertRecord', query, values)
  asyncWrap(c, d1.prepare(query).bind(...values).run(), payload)
}

function updateRecord(c: Context, d1: D1Database, table: string, record: any, old_record: any, payload: any) {
  const setClause = Object.keys(cleanFieldsAppVersions(record, table)).map(key => `${key} = ?`).join(', ')
  const values = [...Object.values(cleanFieldsAppVersions(record, table)), old_record.id]

  const query = `UPDATE ${table} SET ${setClause} WHERE id = ?`
  console.log('updateRecord', query, values)
  asyncWrap(c, d1.prepare(query).bind(...values).run(), payload)
}

function deleteRecord(c: Context, d1: D1Database, table: string, old_record: any, payload: any) {
  const query = `DELETE FROM ${table} WHERE id = ?`
  console.log('deleteRecord', query, old_record.id)
  asyncWrap(c, d1.prepare(query).bind(old_record.id).run(), payload)
}
