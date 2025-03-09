import { honoFactory, useCors } from '../utils/hono.ts'
import { logsnag } from '../utils/logsnag.ts'
import { getUpdateStats } from '../utils/stats.ts'

export const app = honoFactory.createApp()

app.use('/', useCors)

app.get('/', async (c) => {
  try {
    const updateStats = await getUpdateStats(c as any)
    const LogSnag = logsnag(c as any)
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
    console.error({ requestId: c.get('requestId'), context: 'error', error: e })
    return c.json({ status: 'Cannot get stats', error: JSON.stringify(e) }, 500)
  }
})
