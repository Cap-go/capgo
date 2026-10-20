import type { ReadOnlyContext, TaskEvaluation } from '../../contracts.ts'
import { refreshLifecycleJourneys } from './refresh.ts'
import { lifecycleReady, lifecycleSettings } from './rollout.ts'

export const lifecyclePreparation: TaskEvaluation = {
  kind: 'task',
  key: 'lifecycle:v2:prepare',
  everyMinutes: 1,
  execute: ctx => ctx.run(async (db) => {
    const read: ReadOnlyContext = { query: async (sql, values) => (await db.query(sql, values)).rows as never }
    if (!await lifecycleReady(read, ctx.settings))
      return { ready: false, claimed: 0, processed: 0, deferred: 0, oldestDueAt: null, saturated: false }
    const analytics = await lifecycleSettings(read, ctx.settings, ['CF_ACCOUNT_ANALYTICS_ID', 'CF_ANALYTICS_TOKEN'])
    const reader = /^[a-f\d]{32}$/i.test(analytics.CF_ACCOUNT_ANALYTICS_ID ?? '') && analytics.CF_ANALYTICS_TOKEN
      ? async (query: string) => {
        const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${analytics.CF_ACCOUNT_ANALYTICS_ID}/analytics_engine/sql`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${analytics.CF_ANALYTICS_TOKEN}`, 'Content-Type': 'text/plain; charset=utf-8' },
          body: query,
          signal: AbortSignal.timeout(5_000),
        })
        if (!response.ok)
          throw new Error('Lifecycle evidence unavailable')
        const result = await response.json() as { data?: Array<Record<string, string>> }
        if (!Array.isArray(result.data))
          throw new Error('Invalid lifecycle evidence')
        return result.data
      }
      : null
    const result = await refreshLifecycleJourneys(db, reader)
    console.log(JSON.stringify({ event: 'bento_lifecycle_batch', ...result }))
    return { ready: true, ...result }
  }),
}
