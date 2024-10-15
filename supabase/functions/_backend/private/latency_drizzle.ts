import type { Context } from '@hono/hono'
import { Hono } from 'hono/tiny'
import { BRES } from '../utils/hono.ts'
import { closeClient, getDrizzleClient, getPgClient } from '../utils/pg.ts'
import * as schema from '../utils/postgress_schema.ts'

export const app = new Hono()

app.get('/', async (c: Context) => {
  try {
    const pgClient = getPgClient(c)
    const drizzleCient = getDrizzleClient(pgClient as any)
    const data = await drizzleCient
      .select({
        id: schema.apps.id,
      })
      .from(schema.apps)
      .limit(1)
      .then(data => data[0])
    closeClient(c, pgClient)
    if (!data)
      return c.json({ status: 'Cannot post ok', error: 'Cannot get apps' }, 400)
    return c.json(BRES)
  }
  catch (e) {
    return c.json({ status: 'Cannot post ok', error: JSON.stringify(e) }, 500)
  }
})
