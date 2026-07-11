import type { PoolClient } from 'pg'
import { timingSafeEqual } from 'node:crypto'
import { Pool } from 'pg'
import { readReplicaSchemaCatalog } from '../../read_replicate/schema_catalog.ts'
import { readReplicaSchemaCompatibilityIssues } from '../../read_replicate/schema_compatibility.ts'

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
const SCHEMA_VERIFICATION_TIMEOUT_MS = 40_000

type SchemaRoute = 'ok' | 'verify-master'

export default {
  async fetch(request: Request, env: Env) {
    const { pathname } = new URL(request.url)
    const route = schemaRoute(pathname, request.method)
    if (route instanceof Response)
      return route

    const setup = schemaCheckSetup(request, env)
    if (setup instanceof Response)
      return setup
    if (route === 'ok')
      return Response.json({ status: 'ok' })

    try {
      return await verifyMasterSchema(setup)
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (isVerificationTimeout(error, message)) {
        return Response.json(
          {
            error: 'schema_verification_timeout',
            maxDurationMs: SCHEMA_VERIFICATION_TIMEOUT_MS,
            message,
          },
          { status: 504 },
        )
      }

      return Response.json(
        { error: 'schema_verification_failed', message },
        { status: 500 },
      )
    }
  },
}

function schemaRoute(pathname: string, method: string): SchemaRoute | Response {
  if (pathname === '/ok') {
    return method === 'GET'
      ? 'ok'
      : Response.json({ error: 'method_not_allowed' }, { status: 405 })
  }
  if (pathname === '/verify-master') {
    return method === 'GET'
      ? 'verify-master'
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

async function verifyMasterSchema(setup: SchemaCheckSetup): Promise<Response> {
  const [expected, actual] = await Promise.all([
    withPgClient(setup.masterConnectionString, readReplicaSchemaCatalog),
    withPgClient(setup.replicaConnectionString, readReplicaSchemaCatalog),
  ])
  const issues = readReplicaSchemaCompatibilityIssues(expected, actual)
  if (issues.length) {
    return Response.json(
      {
        error: 'schema_not_converged',
        issues,
      },
      { status: 409 },
    )
  }

  return Response.json({ status: 'ok', issues: [] })
}

async function withPgClient<T>(
  connectionString: string,
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const pool = new Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 10_000,
    query_timeout: SCHEMA_VERIFICATION_TIMEOUT_MS,
    statement_timeout: SCHEMA_VERIFICATION_TIMEOUT_MS,
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

function isVerificationTimeout(error: unknown, message: string): boolean {
  if (
    error
    && typeof error === 'object'
    && 'code' in error
    && error.code === '57014'
  ) {
    return true
  }

  return /timed? ?out/i.test(message)
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
