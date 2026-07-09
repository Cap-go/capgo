import { Pool } from 'pg'
import { timingSafeEqual } from 'node:crypto'
import { applyReadReplicaAdditiveSchemaSync } from '../../read_replicate/schema_additive_sync.ts'
import { readReplicaSchemaCatalog, stableStringify } from '../../read_replicate/schema_catalog.ts'

interface Env {
  HYPERDRIVE_CAPGO_READ_EU?: Hyperdrive
  READ_REPLICA_SCHEMA_CHECK_TOKEN?: string
}

const textEncoder = new TextEncoder()

export default {
  async fetch(request: Request, env: Env) {
    const { pathname } = new URL(request.url)

    if (pathname === '/ok')
      return Response.json({ status: 'ok' })

    if (pathname !== '/catalog' && pathname !== '/sync-additive')
      return Response.json({ error: 'not_found' }, { status: 404 })

    if (pathname === '/catalog' && request.method !== 'GET')
      return Response.json({ error: 'method_not_allowed' }, { status: 405 })

    if (pathname === '/sync-additive' && request.method !== 'POST')
      return Response.json({ error: 'method_not_allowed' }, { status: 405 })

    const expectedToken = env.READ_REPLICA_SCHEMA_CHECK_TOKEN
    if (!expectedToken)
      return Response.json({ error: 'missing_schema_check_token' }, { status: 500 })
    if (!hasExpectedAuthorization(request, expectedToken))
      return Response.json({ error: 'unauthorized' }, { status: 401 })
    const hyperdrive = env.HYPERDRIVE_CAPGO_READ_EU
    if (!hyperdrive?.connectionString)
      return Response.json({ error: 'missing_hyperdrive_binding' }, { status: 500 })

    const pool = new Pool({
      connectionString: hyperdrive.connectionString,
      max: 1,
      connectionTimeoutMillis: 10000,
    })

    try {
      if (pathname === '/sync-additive') {
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

      const catalog = await readReplicaSchemaCatalog(pool)
      return new Response(`${stableStringify(catalog)}\n`, {
        headers: {
          'content-type': 'application/json; charset=utf-8',
        },
      })
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const code = pathname === '/sync-additive' ? 'schema_sync_failed' : 'catalog_query_failed'
      return Response.json({ error: code, message }, { status: 500 })
    }
    finally {
      await pool.end()
    }
  },
}

function hasExpectedAuthorization(request: Request, expectedToken: string): boolean {
  const actual = request.headers.get('authorization') ?? ''
  const expected = `Bearer ${expectedToken}`
  const actualBytes = textEncoder.encode(actual)
  const expectedBytes = textEncoder.encode(expected)

  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes)
}
