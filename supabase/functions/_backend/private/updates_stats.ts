import type { Context } from '@hono/hono'
import { Hono } from 'hono/tiny'
import { useCors } from '../utils/hono.ts'
import { logsnag } from '../utils/logsnag.ts'
import { getUpdateStats } from '../utils/stats.ts'

export const app = new Hono()

app.use('/', useCors)

app.get('/', async (c: Context) => {
  try {
    const updateStats = await getUpdateStats(c)
    const LogSnag = logsnag(c)
    await LogSnag.track({
      channel: 'updates-stats',
      event: 'Updates Stats',
      icon: '📈',
      user_id: 'admin',
      tags: {
        success_rate: updateStats.total.success_rate,
      },
    }).catch()
    return c.json(updateStats)
  }
  catch (e) {
    return c.json({ status: 'Cannot get stats', error: JSON.stringify(e) }, 500)
  }
})
