import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { useCors } from '../utils/hono.ts'
import { cloudlogErr } from '../utils/loggin.ts'
import { logsnag } from '../utils/logsnag.ts'
import { getUpdateStats } from '../utils/stats.ts'

export const app = new Hono<MiddlewareKeyVariables>()

app.use('/', useCors)

app.get('/', async (c) => {
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
})
