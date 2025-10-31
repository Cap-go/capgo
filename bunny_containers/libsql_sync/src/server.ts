import { createClient } from '@libsql/client'
import postgres from 'postgres'

// Environment variables
const LIBSQL_URL = process.env.LIBSQL_URL!
const LIBSQL_AUTH_TOKEN = process.env.LIBSQL_AUTH_TOKEN!
const PGMQ_URL = process.env.PGMQ_URL!
const WEBHOOK_SIGNATURE = process.env.WEBHOOK_SIGNATURE!
const PORT = process.env.PORT || '3000'

const BATCH_SIZE = 998

// Import schema
import { TABLE_SCHEMAS, TABLE_SCHEMAS_TYPES, TABLES, type SQLiteType, type TableSchema } from './schema.ts'

// PostgreSQL to SQLite type conversion
function convertPgValueToSqlite(value: any, sqliteType: SQLiteType): any {
  if (value === null || value === undefined) {
    return null
  }

  switch (sqliteType) {
    case 'INTEGER':
      return Number.parseInt(String(value), 10)
    case 'BOOLEAN':
      return Boolean(value)
    case 'JSON':
      return typeof value === 'string' ? value : JSON.stringify(value)
    case 'TEXT':
    default:
      return String(value)
  }
}

// Constant-time comparison to prevent timing attacks
function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false
  }
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

// Read messages from PostgreSQL PGMQ queue
async function readQueueMessages(limit: number): Promise<any[]> {
  const sql = postgres(PGMQ_URL, { max: 1 })

  try {
    const messages = await sql`
      SELECT msg_id, message
      FROM pgmq.read('replicate_data_libsql', 30, ${limit})
    `
    return messages.map((m: any) => ({ msg_id: m.msg_id, ...m.message }))
  } finally {
    await sql.end()
  }
}

// Archive processed messages from PGMQ queue
async function archiveMessages(msgIds: number[]): Promise<void> {
  if (msgIds.length === 0) return

  const sql = postgres(PGMQ_URL, { max: 1 })

  try {
    await sql`
      SELECT pgmq.archive('replicate_data_libsql', msg_id)
      FROM unnest(${msgIds}::bigint[]) AS msg_id
    `
  } finally {
    await sql.end()
  }
}

// Process queue messages and sync to LibSQL
async function processQueue(): Promise<{ processed: number, queued: number }> {
  console.log('Starting LibSQL sync processing...')

  // Read messages from queue
  const messages = await readQueueMessages(BATCH_SIZE)
  console.log(`Read ${messages.length} messages from queue`)

  if (messages.length === 0) {
    return { processed: 0, queued: 0 }
  }

  // Initialize LibSQL client
  const libsql = createClient({
    url: LIBSQL_URL,
    authToken: LIBSQL_AUTH_TOKEN,
  })

  // Collect all SQL statements for batch execution
  const statements: { sql: string, args: any[] }[] = []
  const msgIds: number[] = []

  for (const msg of messages) {
    const { msg_id, record, old_record, type, table } = msg

    if (!table || !TABLES.find(t => t.name === table)) {
      console.warn(`Skipping unknown table: ${table}`)
      msgIds.push(msg_id)
      continue
    }

    const tableSchema = TABLES.find(t => t.name === table)!
    const tableTypes = TABLE_SCHEMAS_TYPES[table]

    if (type === 'INSERT' || type === 'UPDATE') {
      if (!record) {
        console.warn(`No record data for ${type} on ${table}`)
        msgIds.push(msg_id)
        continue
      }

      // Convert PostgreSQL values to SQLite types
      const convertedRecord: Record<string, any> = {}
      for (const col of tableSchema.columns) {
        if (col in record) {
          convertedRecord[col] = convertPgValueToSqlite(record[col], tableTypes[col])
        }
      }

      // Build INSERT OR REPLACE statement
      const columns = Object.keys(convertedRecord)
      const placeholders = columns.map((_, i) => `?${i + 1}`)
      const values = columns.map(col => convertedRecord[col])

      statements.push({
        sql: `INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`,
        args: values,
      })
      msgIds.push(msg_id)
    } else if (type === 'DELETE') {
      if (!old_record) {
        console.warn(`No old_record data for DELETE on ${table}`)
        msgIds.push(msg_id)
        continue
      }

      const primaryKey = tableSchema.primaryKey
      const pkValue = convertPgValueToSqlite(old_record[primaryKey], tableTypes[primaryKey])

      statements.push({
        sql: `DELETE FROM ${table} WHERE ${primaryKey} = ?1`,
        args: [pkValue],
      })
      msgIds.push(msg_id)
    }
  }

  // Execute batch
  if (statements.length > 0) {
    console.log(`Executing batch of ${statements.length} statements`)
    await libsql.batch(statements, 'write')
    console.log('Batch executed successfully')
  }

  // Archive processed messages
  await archiveMessages(msgIds)
  console.log(`Archived ${msgIds.length} messages`)

  // Check remaining queue size
  const sql = postgres(PGMQ_URL, { max: 1 })
  let queued = 0
  try {
    const result = await sql`SELECT COUNT(*) as count FROM pgmq.q_replicate_data_libsql`
    queued = Number(result[0]?.count || 0)
  } finally {
    await sql.end()
  }

  return { processed: msgIds.length, queued }
}

// Initialize LibSQL schema
async function initializeSchema(): Promise<void> {
  console.log('Initializing LibSQL schema...')

  const libsql = createClient({
    url: LIBSQL_URL,
    authToken: LIBSQL_AUTH_TOKEN,
  })

  for (const table of TABLES) {
    const schema = TABLE_SCHEMAS[table.name]
    if (!schema) {
      console.warn(`No schema found for table: ${table.name}`)
      continue
    }

    // Split schema into individual statements
    const statements = schema
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0)

    for (const stmt of statements) {
      await libsql.execute(stmt)
    }

    console.log(`Initialized table: ${table.name}`)
  }

  console.log('Schema initialization complete')
}

// Nuke all data from LibSQL
async function nukeData(): Promise<void> {
  console.log('Nuking all data from LibSQL...')

  const libsql = createClient({
    url: LIBSQL_URL,
    authToken: LIBSQL_AUTH_TOKEN,
  })

  for (const table of TABLES) {
    await libsql.execute(`DELETE FROM ${table.name}`)
    console.log(`Deleted all data from: ${table.name}`)
  }

  console.log('Nuke complete')
}

// Create Bun HTTP server
const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url)
    console.log(`[${new Date().toISOString()}] ${req.method} ${url.pathname}`)

    // Health check endpoint
    if (url.pathname === '/health' || url.pathname === '/ok') {
      return new Response('OK', { status: 200 })
    }

    // Webhook signature validation
    const signature = req.headers.get('x-webhook-signature')
    if (!signature || !secureCompare(signature, WEBHOOK_SIGNATURE)) {
      return new Response('Unauthorized', { status: 401 })
    }

    try {
      // Sync endpoint - process queue
      if (url.pathname === '/sync' && req.method === 'POST') {
        const result = await processQueue()
        return Response.json({
          success: true,
          processed: result.processed,
          queued: result.queued,
        })
      }

      // Nuke endpoint - delete all data and reinitialize
      if (url.pathname === '/nuke' && req.method === 'POST') {
        await nukeData()
        await initializeSchema()
        return Response.json({ success: true, message: 'Data nuked and schema reinitialized' })
      }

      return new Response('Not Found', { status: 404 })
    } catch (error) {
      console.error('Error processing request:', error)
      return Response.json(
        {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        { status: 500 },
      )
    }
  },
})

console.log(`LibSQL Sync server running on http://localhost:${server.port}`)
