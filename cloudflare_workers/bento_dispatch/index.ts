import type { Context as HonoContext } from 'hono'
import type { PostHogQueueEnv } from '../../supabase/functions/_backend/utils/posthog_queue.ts'
import type { DispatchQueueJob } from './contracts.ts'
import { Context } from 'hono'
import { Client } from 'pg'
import { isBentoConfigured, trackBentoEvent } from '../../supabase/functions/_backend/utils/bento.ts'
import { bentoFlows } from './bentoFlows.ts'
import { processDispatchJob } from './consumer.ts'
import { LIFECYCLE_ROLLOUT_KEYS } from './flows/lifecycle/rollout.ts'
import { createMutationContext, createTaskContext } from './helpers.ts'
import { parseDispatchQueueJob } from './operations.ts'
import { publishDispatchJobs } from './scheduler.ts'
import { DispatchStore } from './store.ts'

export interface DispatchEnv extends PostHogQueueEnv {
  HYPERDRIVE_CAPGO_DIRECT_EU: Hyperdrive
  DISPATCH_QUEUE: Queue<DispatchQueueJob>
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
const lifecycleSettings = [...LIFECYCLE_ROLLOUT_KEYS, 'CF_ACCOUNT_ANALYTICS_ID', 'CF_ANALYTICS_TOKEN'] as const

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
  let failed = false
  try {
    await withDatabase(env, async (db) => {
      senderContext(env, 'bento-dispatch-scheduler')
      await publishDispatchJobs(env.DISPATCH_QUEUE, new DispatchStore(db), bentoFlows, controller.scheduledTime)
    })
  }
  catch { failed = true }
  try {
    // This delivery owns no invocation row or audit intent. Recovery must stay
    // live when completed evaluations cannot roll over their pending telemetry.
    await env.DISPATCH_QUEUE.send({ version: 1, operation: 'audit_recovery' })
  }
  catch { failed = true }
  if (failed) {
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
  let job: DispatchQueueJob
  try {
    job = parseDispatchQueueJob(message.body, bentoFlows)
  }
  catch {
    console.error(JSON.stringify({ event: 'bento_dispatch_invalid_job' }))
    message.ack()
    return
  }
  const logIdentity = 'operation' in job ? { operation: job.operation } : { runId: job.runId, evaluationKey: job.evaluationKey }
  // Keep the global ceiling if a replay or queue reconfiguration exceeds
  // the normal five configured deliveries; never open the database on six.
  if (message.attempts > 5) {
    console.error(JSON.stringify({ event: 'bento_dispatch_delivery_exhausted', ...logIdentity }))
    message.ack()
    return
  }
  try {
    const counts = await withDatabase(env, async (db) => {
      const store = new DispatchStore(db)
      if ('operation' in job) {
        await store.relayPendingAudit(env.POSTHOG_QUEUE)
        return { recovered: true }
      }
      const c = senderContext(env, job.runId)
      const result = await processDispatchJob(job, store, run => createMutationContext(store, run, async (event) => {
        return await trackBentoEvent(c, event.email, event.data, event.event, AbortSignal.timeout(10_000)) === true
      }, { WEBAPP_URL: c.env.WEBAPP_URL, ...Object.fromEntries(LIFECYCLE_ROLLOUT_KEYS.filter(key => env[key] !== undefined).map(key => [key, env[key]!])) }, Date.now, env.POSTHOG_QUEUE), bentoFlows[job.evaluationKey], env.POSTHOG_QUEUE, run => createTaskContext(store, run, Object.fromEntries(lifecycleSettings.flatMap((key) => {
        const value = env[key]
        return value === undefined ? [] : [[key, value]]
      }))))
      try {
        await store.relayPendingAudit(env.POSTHOG_QUEUE)
      }
      catch { console.error(JSON.stringify({ event: 'bento_dispatch_audit_pending', runId: job.runId })) }
      return result
    })
    console.log(JSON.stringify({ event: 'bento_dispatch_job', ...logIdentity, ...counts }))
    message.ack()
  }
  catch {
    console.error(JSON.stringify({ event: 'bento_dispatch_job_failed', ...logIdentity }))
    if (message.attempts < 5)
      message.retry({ delaySeconds: 60 })
    else
      message.ack()
  }
}

export default { scheduled: scheduleDispatch, queue: consumeDispatch }
