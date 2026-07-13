import process from 'node:process'
import { Client } from 'pg'
import { reconcileDirectReadReplicaSchema } from '../read_replicate/direct_schema_sync.ts'
import {
  READ_REPLICA_SCHEMA_CATALOG_SQL,
  type Queryable,
  stableStringify,
} from '../read_replicate/schema_catalog.ts'

const DEFAULT_SYNC_MAX_SECONDS = 30 * 60
const DEFAULT_LOCK_WAIT_SECONDS = 2 * 60
const CATALOG_QUERY_BUFFER_MS = 5000

interface PrimaryConnection {
  client: Queryable
  connect: () => Promise<void>
  close: () => Promise<void>
}

async function main(): Promise<void> {
  const maxDurationMs = positiveSecondsFromEnv(
    'READ_REPLICA_SCHEMA_SYNC_MAX_TIME',
    DEFAULT_SYNC_MAX_SECONDS,
  ) * 1000
  const deadline = Date.now() + maxDurationMs
  const primary = primaryConnection(deadline)
  const replica = new Client({
    connectionString: replicaConnectionString(),
    connectionTimeoutMillis: 10_000,
  })

  try {
    await Promise.all([primary.connect(), replica.connect()])
    const result = await reconcileDirectReadReplicaSchema(
      primary.client,
      deadlineBoundCatalogClient(replica, deadline),
      {
        deadline,
        maxDurationMs,
        statementTimeoutMs: maxDurationMs,
        lockWaitMs: positiveSecondsFromEnv(
          'READ_REPLICA_SCHEMA_LOCK_WAIT_SECONDS',
          DEFAULT_LOCK_WAIT_SECONDS,
        ) * 1000,
      },
    )

    if (result.issues.length) {
      console.error('::error title=Read-replica schema did not converge::Direct subscriber reconciliation completed with residual drift.')
      console.error(stableStringify({ error: 'schema_not_converged', ...result }))
      process.exitCode = 1
      return
    }

    console.log('Read-replica direct schema sync result:')
    console.log(stableStringify(result))
    console.log('Read replica now matches the live primary schema for the selected tables.')
  }
  finally {
    await Promise.allSettled([primary.close(), replica.end()])
  }
}

function primaryConnection(deadline: number): PrimaryConnection {
  const connectionString = process.env.MAIN_SUPABASE_DB_URL
  if (!connectionString) {
    if (!process.env.SUPABASE_ACCESS_TOKEN) {
      throw new Error(
        'Set MAIN_SUPABASE_DB_URL or SUPABASE_ACCESS_TOKEN after linking the Supabase project for live primary schema reads.',
      )
    }
    return {
      client: linkedPrimaryCatalogClient(deadline),
      connect: async () => {},
      close: async () => {},
    }
  }

  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 10_000,
  })
  return {
    client: deadlineBoundCatalogClient(client, deadline),
    connect: async () => client.connect(),
    close: async () => client.end(),
  }
}

function linkedPrimaryCatalogClient(deadline: number): Queryable {
  return {
    async query(queryText: string, values?: unknown[]) {
      if (queryText !== READ_REPLICA_SCHEMA_CATALOG_SQL) {
        throw new Error(
          'Linked primary access is restricted to the read-replica schema catalog query.',
        )
      }

      return queryLinkedPrimaryCatalog(
        renderCatalogQueryWithStaticValues(queryText, values),
        deadline,
      )
    },
  }
}

function deadlineBoundCatalogClient(
  client: Queryable,
  deadline: number,
): Queryable {
  return {
    async query(queryText: string, values?: unknown[]) {
      if (queryText !== READ_REPLICA_SCHEMA_CATALOG_SQL)
        return client.query(queryText, values)

      const timeoutMs = remainingCatalogBudgetMs(deadline)
      await client.query(`SET statement_timeout = ${timeoutMs}`)
      try {
        return await client.query(queryText, values)
      }
      finally {
        await client.query('RESET statement_timeout')
      }
    },
  }
}

async function queryLinkedPrimaryCatalog(
  sql: string,
  deadline: number,
): Promise<{ rows: Record<string, any>[] }> {
  const timeoutMs = remainingCatalogBudgetMs(deadline)
  const child = Bun.spawn(
    [
      'supabase',
      'db',
      'query',
      '--linked',
      '--agent=no',
      '--output',
      'json',
      sql,
    ],
    {
      stdout: 'pipe',
      stderr: 'pipe',
      env: process.env,
    },
  )
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    child.kill()
  }, timeoutMs)

  try {
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ])
    if (timedOut) {
      throw new Error(
        'Read-replica schema sync exceeded max duration while reading the live primary schema catalog through the Supabase Management API.',
      )
    }
    if (exitCode !== 0) {
      throw new Error(
        `Linked primary schema catalog query failed: ${commandOutput(stderr || stdout)}`,
      )
    }

    const parsed = JSON.parse(stdout) as unknown
    if (
      !Array.isArray(parsed)
      || !parsed.every(
        row => row !== null && typeof row === 'object' && !Array.isArray(row),
      )
    ) {
      throw new Error(
        'Linked primary schema catalog query returned an invalid JSON row array.',
      )
    }

    return { rows: parsed as Record<string, any>[] }
  }
  finally {
    clearTimeout(timeout)
  }
}

function renderCatalogQueryWithStaticValues(
  queryText: string,
  values: unknown[] | undefined,
): string {
  const parameters = values ?? []
  if (parameters.length !== 5) {
    throw new Error(
      'Read-replica schema catalog requires five selected-schema parameter arrays.',
    )
  }

  let sql = queryText
  for (const [index, value] of parameters.entries()) {
    const placeholder = `$${index + 1}::text[]`
    if (!sql.includes(placeholder)) {
      throw new Error(
        'Read-replica schema catalog query did not contain its expected parameter placeholders.',
      )
    }
    sql = sql.replaceAll(placeholder, postgresTextArray(value))
  }

  return sql
}

function postgresTextArray(value: unknown): string {
  if (!Array.isArray(value) || !value.every(entry => typeof entry === 'string')) {
    throw new Error(
      'Read-replica schema catalog parameters must be arrays of selected object names.',
    )
  }

  return `ARRAY[${value.map(quoteSqlText).join(', ')}]::text[]`
}

function quoteSqlText(value: string): string {
  if (value.includes('\0'))
    throw new Error('Read-replica schema catalog parameters cannot contain null bytes.')

  return `'${value.replaceAll("'", "''")}'`
}

function remainingCatalogBudgetMs(deadline: number): number {
  const remainingMs = deadline - Date.now() - CATALOG_QUERY_BUFFER_MS
  if (remainingMs <= 0) {
    throw new Error(
      'Read-replica schema sync exceeded max duration before it could read the schema catalog.',
    )
  }

  return remainingMs
}

function commandOutput(value: string): string {
  const message = value.trim().replaceAll(/\s+/g, ' ')
  return message ? message.slice(0, 4096) : 'no diagnostic output'
}

function replicaConnectionString(): string {
  const connectionString
    = process.env.READ_REPLICA_DB_URL
      ?? process.env.READ_REPLICATE_GOOGLE_EU1
      ?? process.env.GOOGLE_READ_REPLICA_DB_URL
      ?? process.env.GOOGLE_PRIMARY_REPLICA_DB_URL

  if (!connectionString) {
    throw new Error(
      'Set READ_REPLICA_DB_URL (or READ_REPLICATE_GOOGLE_EU1) to the direct Google subscriber PostgreSQL URL in release CI.',
    )
  }

  return connectionString
}

function positiveSecondsFromEnv(name: string, fallback: number): number {
  const value = process.env[name]
  if (value === undefined)
    return fallback

  if (!/^\d+$/.test(value) || Number(value) <= 0) {
    throw new Error(`${name} must be a positive integer number of seconds.`)
  }

  return Number(value)
}

try {
  await main()
}
catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`::error title=Read-replica direct schema sync failed::${message}`)
  process.exitCode = 1
}
