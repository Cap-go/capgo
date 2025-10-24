import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { getRuntimeKey } from 'hono/adapter'
import { Hono } from 'hono/tiny'
import { BRES, simpleError } from '../utils/hono.ts'
import { cloudlog } from '../utils/loggin.ts'
import { closeClient, getPgClient, selectOne } from '../utils/pg.ts'
import { getDrizzleClientD1, selectOneD1 } from '../utils/pg_d1.ts'
import { existInEnv } from '../utils/utils.ts'

export const app = new Hono<MiddlewareKeyVariables>()

app.get('/', async (c) => {
  cloudlog({ requestId: c.get('requestId'), message: 'Latency check' })
  if (getRuntimeKey() === 'workerd' && existInEnv(c, 'DB_REPLICATE')) {
    cloudlog({ requestId: c.get('requestId'), message: 'Using D1 for workerd runtime' })
    const pgClient = getDrizzleClientD1(c)
    const res = await selectOneD1(pgClient)

    if (!res)
      throw simpleError('cannot_get_apps', 'Cannot get apps')
    return c.json(BRES)
  }
  if (existInEnv(c, 'CUSTOM_SUPABASE_DB_URL')) {
    cloudlog({ requestId: c.get('requestId'), message: 'Using Hyperdrive Supabase DB URL' })
  }
  else {
    cloudlog({ requestId: c.get('requestId'), message: 'Using Supabase DB URL' })
  }
  const pgClient = getPgClient(c)
  const res = await selectOne(pgClient as any)

  closeClient(c, pgClient)
  if (!res)
    throw simpleError('cannot_get_apps', 'Cannot get apps')
  return c.json(BRES)
})
