import type { D1Database } from '@cloudflare/workers-types'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { BRES, middlewareAPISecret } from '../utils/hono.ts'

function isValidValue(value: any): boolean {
  if (value === undefined || value === null || value === '')
    return false
  if (typeof value === 'string' && value.trim() === '')
    return false
  if (Array.isArray(value) && value.length === 0)
    return false
  if (typeof value === 'object' && Object.keys(value || {}).length === 0)
    return false
  return true
}

export const app = new Hono<MiddlewareKeyVariables>()

app.post('/', middlewareAPISecret, async (c) => {
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

    // console.log({ requestId: c.get('requestId'), context: 'replicate_data', operations: JSON.stringify(operations) })

    const d1 = c.env.DB_REPLICATE as D1Database
    const statements = []

    for (const op of operations) {
      const { table, type, record, old_record } = op
      const cleanRecord = cleanFieldsAppVersions(record, table as TableNames)

      switch (type) {
        case 'INSERT':
        case 'UPDATE': {
          const entries = Object.entries(cleanRecord)
          const preparedEntries = entries.map(([key, value]) => [
            key,
            value,
          ])
          const cleanEntries = preparedEntries.filter(([_, value]) => isValidValue(value))

          if (cleanEntries.length === 0) {
            console.error({ requestId: c.get('requestId'), context: 'No valid fields to write', record: JSON.stringify(record), cleanRecord: JSON.stringify(cleanRecord) })
            break
          }

          // Check if data is different before writing
          if (type === 'UPDATE') {
            const oldEntries = Object.entries(old_record)
              .filter(([key]) => cleanEntries.some(([k]) => k === key))
              .map(([key, value]) => [key, value])

            const isDifferent = cleanEntries.some(([key, value]) => {
              const oldValue = oldEntries.find(([k]) => k === key)?.[1]
              return oldValue !== value
            })

            if (!isDifferent) {
              console.log({ requestId: c.get('requestId'), context: 'Skip identical update', table, id: old_record.id })
              break
            }
          }

          const columns = cleanEntries.map(([key]) => key)
          const placeholders = cleanEntries.map(() => '?')
          const values = cleanEntries.map(([_, value]) => value)

          // Use INSERT OR REPLACE and check if we can insert first
          const stmt = d1.prepare(`INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) 
            SELECT ${placeholders.join(', ')} 
            WHERE NOT EXISTS (
              SELECT 1 FROM ${table} 
              WHERE id = ? AND ${columns.map(col => `${col} = ?`).join(' AND ')}
            )`)
          statements.push(stmt.bind(...values, cleanRecord.id, ...values))
          break
        }
        case 'DELETE': {
          // Use DELETE IGNORE to prevent failure if row doesn't exist
          const stmt = d1.prepare(`DELETE FROM ${table} WHERE id = ? AND EXISTS (SELECT 1 FROM ${table} WHERE id = ?)`)
          statements.push(stmt.bind(old_record.id, old_record.id))
          break
        }
      }
    }
    // Execute all statements in batch
    if (statements.length > 0) {
      console.log({
        requestId: c.get('requestId'),
        context: 'D1_BATCH',
        statementCount: statements.length,
      })
      try {
        const results = await d1.batch(statements)
        console.log('batch done', results.length)
      }
      catch (e: unknown) {
        console.error({
          requestId: c.get('requestId'),
          context: 'Error exec batch',
          error: e instanceof Error ? e.message : String(e),
        })
      }
    }

    return c.json(BRES)
  }
  catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e)
    console.error({ requestId: c.get('requestId'), context: 'Error in replicate_data', errorMessage, error: JSON.stringify(e),
    })
    return c.json({ status: 'Error in replication', error: errorMessage }, 500)
  }
})

type SQLiteType = 'INTEGER' | 'TEXT' | 'BOOLEAN' | 'JSON'
type TableSchema = Record<string, SQLiteType>
export type TableNames = 'app_versions' | 'channels' | 'channel_devices' | 'apps' | 'orgs' | 'stripe_info'

export const TABLE_SCHEMAS: Record<TableNames, TableSchema> = {
  app_versions: {
    id: 'INTEGER',
    owner_org: 'TEXT',
    app_id: 'TEXT',
    name: 'TEXT',
    r2_path: 'TEXT',
    user_id: 'TEXT',
    deleted: 'BOOLEAN',
    external_url: 'TEXT',
    checksum: 'TEXT',
    session_key: 'TEXT',
    storage_provider: 'TEXT',
    min_update_version: 'TEXT',
    manifest: 'JSON',
  },
  channels: {
    id: 'INTEGER',
    name: 'TEXT',
    app_id: 'TEXT',
    version: 'INTEGER',
    created_by: 'TEXT',
    owner_org: 'TEXT',
    public: 'BOOLEAN',
    disable_auto_update_under_native: 'BOOLEAN',
    disable_auto_update: 'TEXT',
    ios: 'BOOLEAN',
    android: 'BOOLEAN',
    allow_device_self_set: 'BOOLEAN',
    allow_emulator: 'BOOLEAN',
    allow_dev: 'BOOLEAN',
  },
  channel_devices: {
    id: 'INTEGER',
    channel_id: 'INTEGER',
    app_id: 'TEXT',
    device_id: 'TEXT',
    owner_org: 'TEXT',
  },
  apps: {
    id: 'TEXT',
    app_id: 'TEXT',
    icon_url: 'TEXT',
    user_id: 'TEXT',
    name: 'TEXT',
    last_version: 'TEXT',
    retention: 'INTEGER',
    owner_org: 'TEXT',
    default_upload_channel: 'TEXT',
    transfer_history: 'JSON',
  },
  orgs: {
    id: 'TEXT',
    created_by: 'TEXT',
    logo: 'TEXT',
    name: 'TEXT',
    management_email: 'TEXT',
    customer_id: 'TEXT',
  },
  stripe_info: {
    id: 'INTEGER',
    customer_id: 'TEXT',
    status: 'TEXT',
    trial_at: 'TEXT',
    is_good_plan: 'BOOLEAN',
    mau_exceeded: 'BOOLEAN',
    storage_exceeded: 'BOOLEAN',
    bandwidth_exceeded: 'BOOLEAN',
  },
}

function convertValue(value: any, type: string): any {
  if (value === null || value === undefined)
    return null

  switch (type) {
    case 'INTEGER':
    case 'TIMESTAMP':
      // Convert timestamp to unix timestamp if it's a date string
      if (typeof value === 'string' && value.includes('T')) {
        return Math.floor(new Date(value).getTime() / 1000)
      }
      return Number.parseInt(value)
    case 'BOOLEAN':
      return value ? 1 : 0
    case 'JSON':
      if (Array.isArray(value) && value.length > 0 && 's3_path' in value[0]) {
        // Store as [prefix, [file_name, file_hash], [file_name, file_hash], ...]
        const prefix = value[0].s3_path.slice(0, -value[0].file_name.length)
        return JSON.stringify([
          prefix,
          ...value.map(v => [v.file_name, v.file_hash]),
        ])
      }
      return typeof value !== 'string' ? JSON.stringify(value) : value
    default:
      return value
  }
}

// Add UUID columns list
const UUID_COLUMNS = new Set([
  'id',
  'owner_org',
  'user_id',
  'created_by',
  'device_id',
])

// clean fields that are not in the d1 table
export function cleanFieldsAppVersions(record: any, table: TableNames) {
  if (!record)
    return record

  const schema = TABLE_SCHEMAS[table]
  if (!schema) {
    console.error(`Unknown table: ${table}`)
    return record
  }

  // Only keep columns that exist in schema
  const cleanRecord: Record<string, any> = {}
  for (const [key, value] of Object.entries(record)) {
    // Skip if column not in schema
    if (!(key in schema)) {
      continue
    }

    const type = schema[key]
    const convertedValue = convertValue(value, type)
    if (convertedValue !== null && convertedValue !== undefined) {
      // Make UUIDs lowercase
      if (UUID_COLUMNS.has(key) && typeof convertedValue === 'string') {
        cleanRecord[key] = convertedValue.toLowerCase()
      }
      else {
        cleanRecord[key] = convertedValue
      }
    }
  }

  return cleanRecord
}
