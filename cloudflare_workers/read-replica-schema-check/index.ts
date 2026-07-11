import type { PoolClient } from 'pg'
import { timingSafeEqual } from 'node:crypto'
import { Pool } from 'pg'
import {
  applyReadReplicaSchemaSync,
  reconcileReadReplicaSchema,
} from '../../read_replicate/schema_additive_sync.ts'
import {
  readReplicaSchemaCatalog,
  stableStringify,
} from '../../read_replicate/schema_catalog.ts'
import { readReplicaSchemaCompatibilityIssues } from '../../read_replicate/schema_compatibility.ts'
import committedCatalog from '../../read_replicate/schema_replicate.catalog.json'

interface Env {
  HYPERDRIVE_CAPGO_DIRECT_EU?: Hyperdrive
  HYPERDRIVE_CAPGO_READ_EU?: Hyperdrive
  READ_REPLICA_SCHEMA_CHECK_TOKEN?: string
}

interface SchemaCheckSetup {
  masterConnectionString: string
  replicaConnectionString: string
}

const textEncoder = new TextEncoder()
const SCHEMA_SYNC_STATEMENT_TIMEOUT_MS = 550_000
const SCHEMA_SYNC_MAX_DURATION_HEADER = 'x-schema-sync-max-duration-ms'
const SCHEMA_SYNC_LOCK_KEY = '735252313759174011'
const SCHEMA_SYNC_LOCK_WAIT_MS = 60_000
const SCHEMA_SYNC_LOCK_RETRY_MS = 1_000
const SCHEMA_SYNC_LOCK_BUFFER_MS = 5_000

type SchemaRoute
  = | 'catalog'
    | 'source-catalog'
    | 'sync-from-catalog'
    | 'sync-from-master'

export default {
  async fetch(request: Request, env: Env) {
    const { pathname } = new URL(request.url)
    const route = schemaRoute(pathname, request.method)

    if (route instanceof Response)
      return route

    if (route === 'ok')
      return Response.json({ status: 'ok' })

    const setup = schemaCheckSetup(request, env)
    if (setup instanceof Response)
      return setup

    try {
      if (route === 'source-catalog')
        return schemaCatalogResponse(setup.masterConnectionString)
      if (route === 'catalog')
        return schemaCatalogResponse(setup.replicaConnectionString)
      if (route === 'sync-from-catalog')
        return syncFromCatalog(request, setup)

      return syncFromMaster(request, setup)
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const code
        = route === 'sync-from-master' || route === 'sync-from-catalog'
          ? 'schema_sync_failed'
          : route === 'source-catalog'
            ? 'source_catalog_query_failed'
            : 'replica_catalog_query_failed'
      return Response.json({ error: code, message }, { status: 500 })
    }
  },
}

function schemaRoute(
  pathname: string,
  method: string,
): SchemaRoute | 'ok' | Response {
  if (pathname === '/ok')
    return 'ok'
  if (pathname === '/source-catalog') {
    return method === 'GET'
      ? 'source-catalog'
      : Response.json({ error: 'method_not_allowed' }, { status: 405 })
  }
  if (pathname === '/catalog') {
    return method === 'GET'
      ? 'catalog'
      : Response.json({ error: 'method_not_allowed' }, { status: 405 })
  }
  if (pathname === '/sync-from-catalog') {
    return method === 'POST'
      ? 'sync-from-catalog'
      : Response.json({ error: 'method_not_allowed' }, { status: 405 })
  }
  if (pathname === '/sync-from-master') {
    return method === 'POST'
      ? 'sync-from-master'
      : Response.json({ error: 'method_not_allowed' }, { status: 405 })
  }

  return Response.json({ error: 'not_found' }, { status: 404 })
}

function schemaCheckSetup(
  request: Request,
  env: Env,
): SchemaCheckSetup | Response {
  const expectedToken = env.READ_REPLICA_SCHEMA_CHECK_TOKEN
  if (!expectedToken) {
    return Response.json(
      { error: 'missing_schema_check_token' },
      { status: 500 },
    )
  }
  if (!hasExpectedAuthorization(request, expectedToken))
    return Response.json({ error: 'unauthorized' }, { status: 401 })

  const masterConnectionString
    = env.HYPERDRIVE_CAPGO_DIRECT_EU?.connectionString
  if (!masterConnectionString) {
    return Response.json(
      { error: 'missing_master_hyperdrive_binding' },
      { status: 500 },
    )
  }

  const replicaConnectionString
    = env.HYPERDRIVE_CAPGO_READ_EU?.connectionString
  if (!replicaConnectionString) {
    return Response.json(
      { error: 'missing_replica_hyperdrive_binding' },
      { status: 500 },
    )
  }

  return { masterConnectionString, replicaConnectionString }
}

async function schemaCatalogResponse(
  connectionString: string,
): Promise<Response> {
  const catalog = await withPgClient(
    connectionString,
    readReplicaSchemaCatalog,
  )
  return new Response(`${stableStringify(catalog)}\n`, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
  })
}

async function syncFromCatalog(
  request: Request,
  setup: SchemaCheckSetup,
): Promise<Response> {
  const maxDurationMs = schemaSyncMaxDurationMs(request)
  if (maxDurationMs instanceof Response)
    return maxDurationMs

  const result = await withPgClient(setup.replicaConnectionString, replica =>
    withReplicaSchemaLock(replica, maxDurationMs, async (remainingDurationMs) => {
      const syncResult = await applyReadReplicaSchemaSync(
        replica,
        committedCatalog,
        schemaSyncOptions(remainingDurationMs),
      )
      const actual = await readReplicaSchemaCatalog(replica)
      return {
        ...syncResult,
        issues: readReplicaSchemaCompatibilityIssues(committedCatalog, actual),
      }
    }))

  return schemaSyncResponse(result)
}

async function syncFromMaster(
  request: Request,
  setup: SchemaCheckSetup,
): Promise<Response> {
  const maxDurationMs = schemaSyncMaxDurationMs(request)
  if (maxDurationMs instanceof Response)
    return maxDurationMs

  const result = await withPgClient(setup.replicaConnectionString, replica =>
    withReplicaSchemaLock(replica, maxDurationMs, remainingDurationMs =>
      withPgClient(setup.masterConnectionString, master =>
        reconcileReadReplicaSchema(
          master,
          replica,
          schemaSyncOptions(remainingDurationMs),
        ))))

  return schemaSyncResponse(result)
}

function schemaSyncOptions(maxDurationMs: number) {
  return {
    maxDurationMs,
    statementTimeoutMs: SCHEMA_SYNC_STATEMENT_TIMEOUT_MS,
  }
}

function schemaSyncResponse(result: {
  applied: unknown
  skipped: unknown
  issues: unknown[]
}): Response {
  if (result.issues.length) {
    return Response.json(
      {
        error: 'schema_not_converged',
        ...result,
      },
      { status: 409 },
    )
  }

  return Response.json(result)
}

async function withReplicaSchemaLock<T>(
  replica: PoolClient,
  maxDurationMs: number,
  callback: (remainingDurationMs: number) => Promise<T>,
): Promise<T> {
  const startedAt = Date.now()
  const lockDeadline = startedAt
    + Math.max(
      0,
      Math.min(
        maxDurationMs - SCHEMA_SYNC_LOCK_BUFFER_MS,
        SCHEMA_SYNC_LOCK_WAIT_MS,
      ),
    )
  let locked = false

  try {
    while (Date.now() <= lockDeadline) {
      const result = await replica.query(
        'SELECT pg_try_advisory_lock($1::bigint) AS locked',
        [SCHEMA_SYNC_LOCK_KEY],
      )
      if (result.rows[0]?.locked === true) {
        locked = true
        break
      }
      await waitForSchemaLock()
    }

    if (!locked) {
      throw new Error(
        'Timed out waiting for another read-replica schema reconciliation to finish',
      )
    }

    const remainingDurationMs = maxDurationMs - (Date.now() - startedAt)
    if (remainingDurationMs <= SCHEMA_SYNC_LOCK_BUFFER_MS) {
      throw new Error(
        'Read-replica schema reconciliation lock left no time for DDL',
      )
    }

    return await callback(remainingDurationMs)
  }
  finally {
    if (locked) {
      await replica
        .query('SELECT pg_advisory_unlock($1::bigint)', [SCHEMA_SYNC_LOCK_KEY])
        .catch(() => undefined)
    }
  }
}

async function waitForSchemaLock(): Promise<void> {
  await new Promise<void>(resolve =>
    setTimeout(resolve, SCHEMA_SYNC_LOCK_RETRY_MS))
}

async function withPgClient<T>(
  connectionString: string,
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const pool = new Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 10000,
  })
  let client: PoolClient | undefined

  try {
    client = await pool.connect()
    return await callback(client)
  }
  finally {
    client?.release()
    await pool.end()
  }
}

function schemaSyncMaxDurationMs(request: Request): number | Response {
  const value = request.headers.get(SCHEMA_SYNC_MAX_DURATION_HEADER)
  if (!value)
    return SCHEMA_SYNC_STATEMENT_TIMEOUT_MS

  const durationMs = Number(value)
  if (!Number.isSafeInteger(durationMs) || durationMs <= 0) {
    return Response.json(
      { error: 'invalid_schema_sync_max_duration' },
      { status: 400 },
    )
  }

  return durationMs
}

function hasExpectedAuthorization(
  request: Request,
  expectedToken: string,
): boolean {
  const actual = request.headers.get('authorization') ?? ''
  const expected = `Bearer ${expectedToken}`
  const actualBytes = textEncoder.encode(actual)
  const expectedBytes = textEncoder.encode(expected)

  return (
    actualBytes.length === expectedBytes.length
    && timingSafeEqual(actualBytes, expectedBytes)
  )
}
