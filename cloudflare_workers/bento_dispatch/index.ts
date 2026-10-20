import type { Context as HonoContext } from 'hono'
import type { PostHogQueueEnv } from '../../supabase/functions/_backend/utils/posthog_queue.ts'
import type { DispatchJob } from './contracts.ts'
import { Context } from 'hono'
import { Client } from 'pg'
import { isBentoConfigured, trackBentoEvent } from '../../supabase/functions/_backend/utils/bento.ts'
import { bentoFlows } from './bentoFlows.ts'
import { processDispatchJob } from './consumer.ts'
import { refreshLifecycleJourneys } from './flows/lifecycle/refresh.ts'
import { LIFECYCLE_ROLLOUT_KEYS, lifecycleReady, lifecycleSettings } from './flows/lifecycle/rollout.ts'
import { createMutationContext } from './helpers.ts'
import { parseDispatchJob } from './operations.ts'
import { publishDispatchJobs } from './scheduler.ts'
import { DispatchStore } from './store.ts'

export interface DispatchEnv extends PostHogQueueEnv {
  HYPERDRIVE_CAPGO_DIRECT_EU: Hyperdrive
  DISPATCH_QUEUE: Queue<DispatchJob>
  // Lifecycle-only opt-in; ordinary reminders use Worker configuration.
  BENTO_EVENT_DISPATCH_ENABLED?: string
  BENTO_LIFECYCLE_V2_SENDER_CONTRACT?: string
  BENTO_LIFECYCLE_V2_LEGACY_HANDOFF?: string
  CF_ACCOUNT_ANALYTICS_ID?: string
  CF_ANALYTICS_TOKEN?: string
  BENTO_PUBLISHABLE_KEY?: string
  BENTO_SECRET_KEY?: string
  BENTO_SITE_UUID?: string
  WEBAPP_URL?: string
}

const settings = ['BENTO_PUBLISHABLE_KEY', 'BENTO_SECRET_KEY', 'BENTO_SITE_UUID', 'WEBAPP_URL'] as const

function senderContext(env: DispatchEnv, runId: string): HonoContext {
  const values: Record<string, string> = {}
  for (const key of settings) {
    const value = env[key]?.trim()
    if (!value)
      throw new Error('Missing dispatch configuration')
    values[key] = value
  }
  const c = new Context(new Request('https://bento-dispatch.internal'), { env: values })
  c.set('requestId', runId)
  if (!isBentoConfigured(c))
    throw new Error('Missing dispatch configuration')
  // Validate the destination before claiming any events or consuming attempts.
  const url = new URL(values.WEBAPP_URL)
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/')
    throw new Error('Invalid dispatch configuration')
  return c
}

async function withDatabase<T>(env: DispatchEnv, operation: (db: Client) => Promise<T>): Promise<T> {
  if (!env.HYPERDRIVE_CAPGO_DIRECT_EU?.connectionString)
    throw new Error('Missing dispatch database')
  const db = new Client({
    connectionString: env.HYPERDRIVE_CAPGO_DIRECT_EU.connectionString,
    connectionTimeoutMillis: 5_000,
    query_timeout: 5_000,
    statement_timeout: 5_000,
  })
  // Connection errors may contain addresses or credentials; logs below expose
  // fixed event names and counts instead of raw exceptions or message bodies.
  db.on('error', () => {})
  try {
    await db.connect()
    return await operation(db)
  }
  finally {
    await db.end()
  }
}

export async function scheduleDispatch(controller: ScheduledController, env: DispatchEnv) {
  try {
    await withDatabase(env, async (db) => {
      const store = new DispatchStore(db)
      try {
        await store.relayPendingAudit(env.POSTHOG_QUEUE)
      }
      catch { console.error(JSON.stringify({ event: 'bento_dispatch_audit_pending' })) }
      senderContext(env, 'bento-dispatch-scheduler')
      try {
        const read = { query: async <T extends import('pg').QueryResultRow>(sql: string, values?: unknown[]) => (await db.query<T>(sql, values)).rows }
        if (await lifecycleReady(read, env as unknown as Record<string, string>)) {
          const analytics = await lifecycleSettings(read, env as unknown as Record<string, string>, ['CF_ACCOUNT_ANALYTICS_ID', 'CF_ANALYTICS_TOKEN'])
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
          await refreshLifecycleJourneys(db, reader)
        }
      }
      catch { console.error(JSON.stringify({ event: 'bento_lifecycle_refresh_failed' })) }
      await publishDispatchJobs(env.DISPATCH_QUEUE, store, bentoFlows, controller.scheduledTime)
    })
  }
  catch {
    console.error(JSON.stringify({ event: 'bento_dispatch_schedule_failed' }))
    throw new Error('Bento dispatch scheduling failed')
  }
}

export async function consumeDispatch(batch: MessageBatch<unknown>, env: DispatchEnv) {
  if (batch.messages.length !== 1) {
    console.error(JSON.stringify({ event: 'bento_dispatch_invalid_batch', count: batch.messages.length }))
    for (const message of batch.messages) {
      if (message.attempts < 5)
        message.retry({ delaySeconds: 60 })
      else
        message.ack()
    }
    return
  }
  const [message] = batch.messages
  let job: DispatchJob
  try {
    job = parseDispatchJob(message.body, bentoFlows)
  }
  catch {
    console.error(JSON.stringify({ event: 'bento_dispatch_invalid_job' }))
    message.ack()
    return
  }
  // Keep the global ceiling if a replay or queue reconfiguration exceeds
  // the normal five configured deliveries; never open the database on six.
  if (message.attempts > 5) {
    console.error(JSON.stringify({ event: 'bento_dispatch_delivery_exhausted', runId: job.runId, evaluationKey: job.evaluationKey }))
    message.ack()
    return
  }
  try {
    const counts = await withDatabase(env, async (db) => {
      const c = senderContext(env, job.runId)
      const store = new DispatchStore(db)
      const result = await processDispatchJob(job, store, run => createMutationContext(store, run, async (event) => {
        return await trackBentoEvent(c, event.email, event.data, event.event, AbortSignal.timeout(10_000)) === true
      }, { WEBAPP_URL: c.env.WEBAPP_URL, ...Object.fromEntries(LIFECYCLE_ROLLOUT_KEYS.filter(key => env[key] !== undefined).map(key => [key, env[key]!])) }, Date.now, env.POSTHOG_QUEUE), bentoFlows[job.evaluationKey], env.POSTHOG_QUEUE)
      try {
        await store.relayPendingAudit(env.POSTHOG_QUEUE)
      }
      catch { console.error(JSON.stringify({ event: 'bento_dispatch_audit_pending', runId: job.runId })) }
      return result
    })
    console.log(JSON.stringify({ event: 'bento_dispatch_job', runId: job.runId, evaluationKey: job.evaluationKey, ...counts }))
    message.ack()
  }
  catch {
    console.error(JSON.stringify({ event: 'bento_dispatch_job_failed', runId: job.runId, evaluationKey: job.evaluationKey }))
    if (message.attempts < 5)
      message.retry({ delaySeconds: 60 })
    else
      message.ack()
  }
}

export default { scheduled: scheduleDispatch, queue: consumeDispatch }
