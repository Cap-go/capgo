import { BRES, honoFactory } from '../utils/hono.ts'
import { closeClient, getPgClient } from '../utils/pg.ts'

export const app = honoFactory.createApp()

app.get('/', async (c) => {
  try {
    const pgClient = getPgClient(c as any)
    const res = await pgClient`select 1`

    closeClient(c as any, pgClient)
    if (!res)
      return c.json({ status: 'Cannot post ok', error: 'Cannot get apps' }, 400)
    return c.json(BRES)
  }
  catch (e) {
    return c.json({ status: 'Cannot post ok', error: JSON.stringify(e) }, 500)
  }
})
