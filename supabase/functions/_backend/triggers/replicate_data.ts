import type { Context } from '@hono/hono'
import { Hono } from 'hono/tiny'
import { BRES, middlewareAPISecret } from '../utils/hono.ts'
import { backgroundTask } from '../utils/utils.ts'

export const app = new Hono()

app.post('/', middlewareAPISecret, async (c: Context) => {
  try {
    const body = await c.req.json<{ operations: Array<{
      table: string
      type: 'INSERT' | 'UPDATE' | 'DELETE'
      record: any
      old_record: any
      retry_count: number
    }> }>()
    const { operations } = body

    if (!c.env.DB_REPLICATE) {
      console.log({ requestId: c.get('requestId'), context: 'DB_REPLICATE is not set' })
      return c.json(BRES)
    }

    console.log({ requestId: c.get('requestId'), context: 'replicate_data' })

    const d1 = c.env.DB_REPLICATE as D1Database
    const queries: string[] = []

    for (const op of operations) {
      const { table, type, record, old_record } = op
      const cleanRecord = cleanFieldsAppVersions(record, table)

      switch (type) {
        case 'INSERT': {
          const columns = Object.keys(cleanRecord)
          const values = Object.values(cleanRecord).map(v =>
            v === null ? 'NULL' : typeof v === 'string' ? `'${v}'` : v,
          )
          queries.push(`BEGIN; INSERT INTO ${table} (${columns.join(', ')}) VALUES (${values.join(', ')}); COMMIT;`)
          break
        }
        case 'UPDATE': {
          const setClause = Object.entries(cleanRecord)
            .map(([key, value]) =>
              `${key} = ${value === null ? 'NULL' : typeof value === 'string' ? `'${value}'` : value}`,
            )
            .join(', ')
          queries.push(`BEGIN; UPDATE ${table} SET ${setClause} WHERE id = '${old_record.id}'; COMMIT;`)
          break
        }
        case 'DELETE':
          queries.push(`BEGIN; DELETE FROM ${table} WHERE id = '${old_record.id}'; COMMIT;`)
          break
      }
    }
    console.log('operations', operations.length)
    console.log('queries', queries.length, queries[0])
    const all = []

    // Execute batch operations in chunks to stay under 100kb
    const CHUNK_SIZE = Math.max(1, Math.floor(100_000 / queries.reduce((acc, q) => acc + q.length, 0) * queries.length))
    for (let i = 0; i < queries.length; i += CHUNK_SIZE) {
      const chunk = queries.slice(i, i + CHUNK_SIZE)
      const query = chunk.join('\n')
      console.log(`Chunk ${i}, size ${CHUNK_SIZE}`)
      all.push(d1.exec(query))
    }
    await asyncWrap(c, await Promise.all(all))
    return c.json(BRES)
  }
  catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e)
    console.error({ requestId: c.get('requestId'), context: 'Error in replicate_data', errorMessage, error: JSON.stringify(e),
    })
    return c.json({ status: 'Error in replication', error: errorMessage }, 500)
  }
})

// clean fields that are not in the d1 table
export function cleanFieldsAppVersions(record: any, table: string) {
  // remove old fields
  if (table === 'app_versions') {
    // TODO: delete when we migrate to the new schema
    delete record.minUpdateVersion
    delete record.native_packages
    // in app_versions there is a column named manifest, but in d1 it's a JSON type convert it to make the insert work
    if (record.manifest) {
      record.manifest = JSON.stringify(record.manifest)
    }
  }
  if (table === 'channels') {
    // TODO: delete when we migrate to the new schema
    delete record.secondVersion
    delete record.secondaryVersionPercentage
    delete record.disableAutoUpdate
  }
  // device_id_lower when fucked the migration
  if (table === 'channel_devices') {
    record.device_id = record.device_id.toLowerCase()
    delete record.device_id_lower
  }
  if (table === 'devices_override') {
    record.device_id = record.device_id.toLowerCase()
    delete record.device_id_lower
  }

  return record
}

// function to c.executionCtx.waitUntil the db operation and catch issue who insert in job_queue as failed job
function asyncWrap(c: Context, promise: Promise<any>) {
  return backgroundTask(c, promise.catch((e) => {
    const errorMessage = e instanceof Error ? e.message : String(e)
    console.error({ requestId: c.get('requestId'), context: 'Error exec replicateData', error: JSON.stringify(e), errorMessage })
    // if error is { "error": "D1_ERROR: UNIQUE constraint failed: apps.name: SQLITE_CONSTRAINT" } or any Unique constraint failed return as success
    if (e.message.includes('UNIQUE constraint failed')) {
      console.log('Object exist already')
    }
  }))
}
