import { Pool } from 'pg'
import { readReplicaSchemaCatalog, stableStringify } from '../../read_replicate/schema_catalog.ts'

interface Env {
  HYPERDRIVE_CAPGO_READ_EU?: Hyperdrive
  READ_REPLICA_SCHEMA_CHECK_TOKEN?: string
}

export default {
  async fetch(request: Request, env: Env) {
    const { pathname } = new URL(request.url)

    if (pathname === '/ok')
      return Response.json({ status: 'ok' })

    if (pathname !== '/catalog')
      return Response.json({ error: 'not_found' }, { status: 404 })

    const expectedToken = env.READ_REPLICA_SCHEMA_CHECK_TOKEN
    if (!expectedToken)
      return Response.json({ error: 'missing_schema_check_token' }, { status: 500 })

    if (request.headers.get('authorization') !== `Bearer ${expectedToken}`)
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
      const catalog = await readReplicaSchemaCatalog(pool)
      return new Response(`${stableStringify(catalog)}\n`, {
        headers: {
          'content-type': 'application/json; charset=utf-8',
        },
      })
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return Response.json({ error: 'catalog_query_failed', message }, { status: 500 })
    }
    finally {
      await pool.end()
    }
  },
}
