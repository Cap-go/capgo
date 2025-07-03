import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { BRES, simpleError } from '../utils/hono.ts'
import { closeClient, getPgClient } from '../utils/pg.ts'

export const app = new Hono<MiddlewareKeyVariables>()

app.get('/', async (c) => {
  const pgClient = getPgClient(c)
  const res = await pgClient`select 1`

  closeClient(c, pgClient)
  if (!res)
    throw simpleError('cannot_get_apps', 'Cannot get apps')
  return c.json(BRES)
})
