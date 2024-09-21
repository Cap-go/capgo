import { Hono } from 'hono/tiny'
import type { Context } from '@hono/hono'
import { BRES, middlewareAPISecret } from '../utils/hono.ts'
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
        await insertRecord(d1, table, record)
        break
      case 'UPDATE':
        await updateRecord(d1, table, record, old_record)
        break
      case 'DELETE':
        await deleteRecord(d1, table, old_record)
        break
    }

    console.log(`Replicated ${type} operation for table ${table}`)
    return c.json(BRES)
  }
  catch (e) {
    console.error('Error in replicate_data:', e)
    return c.json({ status: 'Error in replication', error: JSON.stringify(e) }, 500)
  }
})

async function insertRecord(d1: D1Database, table: string, record: any) {
  const columns = Object.keys(record).join(', ')
  const placeholders = Object.keys(record).map(() => '?').join(', ')
  const values = Object.values(record)

  const query = `INSERT INTO ${table} (${columns}) VALUES (${placeholders})`
  console.log('insertRecord', query, values)
  await d1.prepare(query).bind(...values).run()
}

async function updateRecord(d1: D1Database, table: string, record: any, old_record: any) {
  const setClause = Object.keys(record).map(key => `${key} = ?`).join(', ')
  const values = [...Object.values(record), old_record.id]

  const query = `UPDATE ${table} SET ${setClause} WHERE id = ?`
  console.log('updateRecord', query, values)
  await d1.prepare(query).bind(...values).run()
}

async function deleteRecord(d1: D1Database, table: string, old_record: any) {
  const query = `DELETE FROM ${table} WHERE id = ?`
  console.log('deleteRecord', query, old_record.id)
  await d1.prepare(query).bind(old_record.id).run()
}
