import type { Context } from '@hono/hono'
import { Hono } from 'hono/tiny'
import { BRES } from '../utils/hono.ts'
import { closeClient, getPgClient } from '../utils/pg.ts'

export const app = new Hono()

app.get('/', async (c: Context) => {
  try {
    const pgClient = getPgClient(c)
    const res = await pgClient`select 1`
    closeClient(c, pgClient)
    if (!res)
      return c.json({ status: 'Cannot post ok', error: 'Cannot get apps' }, 400)
    return c.json(BRES)
  }
  catch (e) {
    return c.json({ status: 'Cannot post ok', error: JSON.stringify(e) }, 500)
  }
})
