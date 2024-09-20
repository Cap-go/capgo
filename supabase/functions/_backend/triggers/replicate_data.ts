import { Hono } from 'hono/tiny'
import type { Context } from '@hono/hono'
import { BRES, middlewareAPISecret } from '../utils/hono.ts'
import { getDrizzleClientD1 } from '../utils/pg.ts'
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
    // Check if we're in production environment
    if (!c.env.DB_REPLICATE) {
      console.log('DB_REPLICATE is not set')
      return c.json(BRES)
    }

    const drizzleClient = getDrizzleClientD1(c)
    // Perform the replication
    switch (type) {
      case 'INSERT':
        await insertRecord(drizzleClient, table, record)
        break
      case 'UPDATE':
        await updateRecord(drizzleClient, table, record, old_record)
        break
      case 'DELETE':
        await deleteRecord(drizzleClient, table, old_record)
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

async function insertRecord(drizzleClient: any, table: string, record: any) {
  // Implement insert logic here
  await drizzleClient.insert(table).values(record).execute()
}

async function updateRecord(drizzleClient: any, table: string, record: any, old_record: any) {
  // Implement update logic here
  await drizzleClient.update(table).set(record).where({ id: old_record.id }).execute()
}

async function deleteRecord(drizzleClient: any, table: string, old_record: any) {
  // Implement delete logic here
  await drizzleClient.delete(table).where({ id: old_record.id }).execute()
}
