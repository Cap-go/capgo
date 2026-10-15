import type { Context as HonoContext } from 'hono'
import type { DispatchJob } from './operations.ts'
import { Context } from 'hono'
import { Client } from 'pg'
import { isBentoConfigured, trackBentoEvent } from '../../supabase/functions/_backend/utils/bento.ts'
import { processDispatchJob, publishDispatchJobs } from './consumer.ts'
import { buildInvitationEvent, parseDispatchJob } from './operations.ts'
import { DispatchStore } from './store.ts'

export interface DispatchEnv {
  HYPERDRIVE_CAPGO_DIRECT_EU: Hyperdrive
  DISPATCH_QUEUE: Queue<DispatchJob>
  BENTO_EVENT_DISPATCH_ENABLED?: string
  BENTO_PUBLISHABLE_KEY?: string
  BENTO_SECRET_KEY?: string
  BENTO_SITE_UUID?: string
  WEBAPP_URL?: string
}

const settings = ['BENTO_PUBLISHABLE_KEY', 'BENTO_SECRET_KEY', 'BENTO_SITE_UUID', 'WEBAPP_URL'] as const

async function enabled(db: Client, env: DispatchEnv) {
  // Vault owns runtime activation; an environment value is an explicit
  // deployment-time override. An absent setting leaves dispatch inactive.
  if (env.BENTO_EVENT_DISPATCH_ENABLED !== undefined)
    return env.BENTO_EVENT_DISPATCH_ENABLED.trim() === 'true'
  const result = await db.query<{ decrypted_secret: string }>(
    'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = $1 LIMIT 1',
    ['BENTO_EVENT_DISPATCH_ENABLED'],
  )
  return result.rows[0]?.decrypted_secret?.trim() === 'true'
}

async function senderContext(db: Client, env: DispatchEnv, runId: string): Promise<HonoContext> {
  const missing = settings.filter(key => !env[key]?.trim())
  const values: Record<string, string> = {}
  if (missing.length) {
    const result = await db.query<{ name: string, decrypted_secret: string }>(
      'SELECT name, decrypted_secret FROM vault.decrypted_secrets WHERE name = ANY($1::text[])',
      [missing],
    )
    for (const row of result.rows)
      values[row.name] = row.decrypted_secret
  }
  for (const key of settings) {
    if (env[key]?.trim())
      values[key] = env[key]!
  }
  const c = new Context(new Request('https://bento-dispatch.internal'), { env: values })
  c.set('requestId', runId)
  if (!isBentoConfigured(c) || !values.WEBAPP_URL)
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

export async function scheduleDispatch(_controller: ScheduledController, env: DispatchEnv) {
  try {
    await withDatabase(env, async (db) => {
      if (!await enabled(db, env))
        return
      await publishDispatchJobs(env.DISPATCH_QUEUE, crypto.randomUUID())
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
    for (const message of batch.messages)
      message.retry({ delaySeconds: 60 })
    return
  }
  const [message] = batch.messages
  let job: DispatchJob
  try {
    job = parseDispatchJob(message.body)
  }
  catch {
    console.error(JSON.stringify({ event: 'bento_dispatch_invalid_job' }))
    message.ack()
    return
  }
  if (message.attempts > 5) {
    console.error(JSON.stringify({ event: 'bento_dispatch_delivery_exhausted', runId: job.runId, operation: job.operation, partition: job.partition }))
    message.ack()
    return
  }
  try {
    const counts = await withDatabase(env, async (db) => {
      if (!await enabled(db, env))
        return { accepted: 0, cancelled: 0, failed: 0 }
      const c = await senderContext(db, env, job.runId)
      return processDispatchJob(job, new DispatchStore(db), async (record, invitation) => {
        const event = buildInvitationEvent(record, invitation, c.env.WEBAPP_URL)
        return await trackBentoEvent(c, event.email, event.data, event.event, AbortSignal.timeout(10_000)) === true
      })
    })
    console.log(JSON.stringify({ event: 'bento_dispatch_job', runId: job.runId, operation: job.operation, partition: job.partition, ...counts }))
    if (counts.failed > 0 && message.attempts < 5)
      message.retry({ delaySeconds: 60 })
    else
      message.ack()
  }
  catch {
    console.error(JSON.stringify({ event: 'bento_dispatch_job_failed', runId: job.runId, operation: job.operation, partition: job.partition }))
    if (message.attempts < 5)
      message.retry({ delaySeconds: 60 })
    else
      message.ack()
  }
}

export default { scheduled: scheduleDispatch, queue: consumeDispatch }
