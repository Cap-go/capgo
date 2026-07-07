import { Pool } from 'pg'
import { readReplicaSchemaCatalog, stableStringify } from '../../read_replicate/schema_catalog.ts'

interface Env {
  HYPERDRIVE_CAPGO_READ_EU: Hyperdrive
}

export default {
  async fetch(request: Request, env: Env) {
    const { pathname } = new URL(request.url)

    if (pathname === '/ok')
      return Response.json({ status: 'ok' })

    if (pathname !== '/catalog')
      return Response.json({ error: 'not_found' }, { status: 404 })

    const pool = new Pool({
      connectionString: env.HYPERDRIVE_CAPGO_READ_EU.connectionString,
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
