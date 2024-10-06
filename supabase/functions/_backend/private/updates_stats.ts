import { Hono } from 'hono/tiny'
import type { Context } from '@hono/hono'
import { useCors } from '../utils/hono.ts'
import { getUpdateStats } from '../utils/stats.ts'

export const app = new Hono()

app.use('/', useCors)

app.get('/', async (c: Context) => {
  try {
    const updateStats = await getUpdateStats(c)
    return c.json(updateStats)
  }
  catch (e) {
    return c.json({ status: 'Cannot get stats', error: JSON.stringify(e) }, 500)
  }
})
