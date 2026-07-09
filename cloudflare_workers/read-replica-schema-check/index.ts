import { Pool } from 'pg'
import { timingSafeEqual } from 'node:crypto'
import { applyReadReplicaAdditiveSchemaSync } from '../../read_replicate/schema_additive_sync.ts'
import { readReplicaSchemaCatalog, stableStringify } from '../../read_replicate/schema_catalog.ts'

interface Env {
  HYPERDRIVE_CAPGO_READ_EU?: Hyperdrive
  READ_REPLICA_SCHEMA_CHECK_TOKEN?: string
}

const textEncoder = new TextEncoder()

type SchemaRoute = 'catalog' | 'sync-additive'

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

    const pool = new Pool({
      connectionString: setup.connectionString,
      max: 1,
      connectionTimeoutMillis: 10000,
    })

    try {
      return await handleSchemaRoute(route, request, pool)
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const code = route === 'sync-additive' ? 'schema_sync_failed' : 'catalog_query_failed'
      return Response.json({ error: code, message }, { status: 500 })
    }
    finally {
      await pool.end()
    }
  },
}

function schemaRoute(pathname: string, method: string): SchemaRoute | 'ok' | Response {
  if (pathname === '/ok')
    return 'ok'
  if (pathname === '/catalog')
    return method === 'GET' ? 'catalog' : Response.json({ error: 'method_not_allowed' }, { status: 405 })
  if (pathname === '/sync-additive')
    return method === 'POST' ? 'sync-additive' : Response.json({ error: 'method_not_allowed' }, { status: 405 })

  return Response.json({ error: 'not_found' }, { status: 404 })
}

function schemaCheckSetup(request: Request, env: Env): { connectionString: string } | Response {
  const expectedToken = env.READ_REPLICA_SCHEMA_CHECK_TOKEN
  if (!expectedToken)
    return Response.json({ error: 'missing_schema_check_token' }, { status: 500 })
  if (!hasExpectedAuthorization(request, expectedToken))
    return Response.json({ error: 'unauthorized' }, { status: 401 })

  const connectionString = env.HYPERDRIVE_CAPGO_READ_EU?.connectionString
  if (!connectionString)
    return Response.json({ error: 'missing_hyperdrive_binding' }, { status: 500 })

  return { connectionString }
}

async function handleSchemaRoute(route: SchemaRoute, request: Request, pool: Pool): Promise<Response> {
  if (route === 'sync-additive')
    return handleAdditiveSync(request, pool)

  const catalog = await readReplicaSchemaCatalog(pool)
  return new Response(`${stableStringify(catalog)}\n`, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
  })
}

async function handleAdditiveSync(request: Request, pool: Pool): Promise<Response> {
  let expectedCatalog: unknown
  try {
    expectedCatalog = await request.json()
  }
  catch {
    return Response.json({ error: 'invalid_schema_catalog_json' }, { status: 400 })
  }

  const result = await applyReadReplicaAdditiveSchemaSync(pool, expectedCatalog)
  return Response.json(result)
}

function hasExpectedAuthorization(request: Request, expectedToken: string): boolean {
  const actual = request.headers.get('authorization') ?? ''
  const expected = `Bearer ${expectedToken}`
  const actualBytes = textEncoder.encode(actual)
  const expectedBytes = textEncoder.encode(expected)

  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes)
}
