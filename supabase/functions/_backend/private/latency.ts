import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { getRuntimeKey } from 'hono/adapter'
import { Hono } from 'hono/tiny'
import { BRES, simpleError } from '../utils/hono.ts'
import { cloudlog } from '../utils/loggin.ts'
import { closeClient, getPgClient } from '../utils/pg.ts'
import { getPgClientD1 } from '../utils/pg_d1.ts'
import { existInEnv } from '../utils/utils.ts'

export const app = new Hono<MiddlewareKeyVariables>()

app.get('/', async (c) => {
  cloudlog({ requestId: c.get('requestId'), message: 'Latency check' })
  if (getRuntimeKey() === 'workerd' && existInEnv(c, 'DB_REPLICATE')) {
    cloudlog({ requestId: c.get('requestId'), message: 'Using D1 for workerd runtime' })
    const pgClient = getPgClientD1(c)
    const res = await pgClient`select 1`

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
  const res = await pgClient`select 1`

  closeClient(c, pgClient)
  if (!res)
    throw simpleError('cannot_get_apps', 'Cannot get apps')
  return c.json(BRES)
})
