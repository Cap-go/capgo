import type { QueryResultRow } from 'pg'
import type { DispatchJob, DispatchQueueJob, QueryClient } from '../cloudflare_workers/bento_dispatch/contracts.ts'
import type { DispatchEnv } from '../cloudflare_workers/bento_dispatch/index.ts'
import { readFileSync } from 'node:fs'
import { createPgliteEngine, Database } from 'tinbase'
import { expect, it, vi } from 'vitest'
import { bentoFlows } from '../cloudflare_workers/bento_dispatch/bentoFlows.ts'
import { consumeDispatch, scheduleDispatch } from '../cloudflare_workers/bento_dispatch/index.ts'
import { DispatchStore } from '../cloudflare_workers/bento_dispatch/store.ts'

const wire = vi.hoisted(() => ({ db: undefined as QueryClient | undefined, statements: [] as string[] }))
vi.mock('pg', async importOriginal => ({
  ...await importOriginal<typeof import('pg')>(),
  Client: class {
    connect = async () => {}
    end = async () => {}
    on = () => {}
    query = <T extends QueryResultRow>(sql: string, values?: unknown[]) => {
      wire.statements.push(sql)
      return wire.db!.query<T>(sql, values)
    }
  },
}))
vi.mock('hono/adapter', async importOriginal => ({ ...await importOriginal<typeof import('hono/adapter')>(), env: (c: { env: Record<string, string> }) => c.env }))

const delivered = (body: DispatchQueueJob, attempts = 1) => ({ body, attempts, ack: vi.fn(), retry: vi.fn() })
const batch = (message: ReturnType<typeof delivered>) => ({ messages: [message] }) as unknown as MessageBatch<unknown>

it('recovers audits through the real cron/queue/store wiring even when every completed check is blocked by pending telemetry', async () => {
  const db = await Database.create(await createPgliteEngine())
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    await db.exec(readFileSync('supabase/migrations/20261017131933_bento_invitation_dispatches.sql', 'utf8'))
    await db.exec(readFileSync('supabase/migrations/20261019130017_bento_evaluation_state.sql', 'utf8'))
    wire.db = { query: async <T extends QueryResultRow>(sql: string, values?: unknown[]) => {
      const result = await db.query<T>(sql, values)
      return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length, command: '', oid: 0, fields: [] }
    } }
    const published: DispatchQueueJob[] = []
    const send = vi.fn(async (job: DispatchQueueJob) => {
      published.push(job)
    })
    const telemetry = vi.fn(async (_event: unknown) => ({ metadata: { metrics: { backlogCount: 0, backlogBytes: 0 } } }))
    const env: DispatchEnv = {
      HYPERDRIVE_CAPGO_DIRECT_EU: { connectionString: 'postgres://isolated-test' } as Hyperdrive,
      DISPATCH_QUEUE: { send } as never,
      POSTHOG_QUEUE: { send: telemetry },
      BENTO_PUBLISHABLE_KEY: 'configured',
      BENTO_SECRET_KEY: 'configured',
      BENTO_SITE_UUID: 'configured',
      WEBAPP_URL: 'https://console.example.com',
    }
    const scheduledTime = Date.UTC(2026, 0, 1, 10)
    const tick = (offset: number) => scheduleDispatch({ scheduledTime: scheduledTime + offset } as ScheduledController, env)
    await tick(0)
    const jobs = published.filter((job): job is DispatchJob => 'evaluationKey' in job)
    expect(jobs.map(job => job.evaluationKey).sort()).toEqual(Object.keys(bentoFlows).sort())
    expect(published.filter(job => 'operation' in job)).toHaveLength(1)
    await tick(0)
    expect(published.filter(job => 'evaluationKey' in job)).toHaveLength(jobs.length)
    expect(published.filter(job => 'operation' in job)).toHaveLength(2)
    expect(wire.statements.join('\n')).not.toMatch(/vault\.|bento_lifecycle_journeys|public\.(?:orgs|users|apps|stripe_info|build_requests)|SELECT pending_audit/)

    // Simulate the end of every check during a telemetry outage, including the
    // preparation task's own completed invocation. No recipient is ever sent.
    const store = new DispatchStore(wire.db)
    for (const job of jobs) {
      const run = await store.claimRun(job)
      expect(run).not.toBeNull()
      await store.completeRun(run!, {})
    }
    const auditIds = (await db.query(`SELECT audit->>'event_id' AS id FROM public.bento_evaluation_runs,
      LATERAL jsonb_array_elements(pending_audit) audit`)).rows.map(row => row.id)
    expect(auditIds).toHaveLength(jobs.length * 3)
    published.length = 0
    await tick(60_000)
    expect(published).toEqual([{ version: 1, operation: 'audit_recovery' }])
    telemetry.mockRejectedValue(new Error('isolated analytics outage'))
    const failed = delivered(published[0])
    await consumeDispatch(batch(failed), env)
    expect(failed.retry).toHaveBeenCalledOnce()
    expect(failed.ack).not.toHaveBeenCalled()
    const pendingCount = async () => (await db.query(`SELECT sum(jsonb_array_length(pending_audit))::integer AS count FROM public.bento_evaluation_runs`)).rows[0].count
    expect(await pendingCount()).toBe(auditIds.length)

    // Exhausting one transport delivery cannot prevent a later tick from
    // delivering maintenance, and maintenance creates no self-blocking audit.
    const exhausted = delivered(published[0], 5)
    await consumeDispatch(batch(exhausted), env)
    expect(exhausted.ack).toHaveBeenCalledOnce()
    expect(await pendingCount()).toBe(auditIds.length)
    published.length = 0
    await tick(120_000)
    expect(published).toEqual([{ version: 1, operation: 'audit_recovery' }])
    telemetry.mockResolvedValue({ metadata: { metrics: { backlogCount: 0, backlogBytes: 0 } } })
    telemetry.mockClear()
    const recovered = delivered(published[0])
    await consumeDispatch(batch(recovered), { ...env, BENTO_SECRET_KEY: undefined })
    expect(recovered.ack).toHaveBeenCalledOnce()
    expect(await pendingCount()).toBe(0)
    expect(new Set(telemetry.mock.calls.map(([event]) => (event as { event_id: string }).event_id))).toEqual(new Set(auditIds))

    published.length = 0
    await tick(180_000)
    const next = published.filter((job): job is DispatchJob => 'evaluationKey' in job)
    expect(next).toHaveLength(jobs.length)
    expect(next.every(job => jobs.find(old => old.evaluationKey === job.evaluationKey)!.runId !== job.runId)).toBe(true)
    expect((await db.query('SELECT count(*)::integer AS count FROM public.bento_evaluation_runs')).rows).toEqual([{ count: jobs.length }])
    const stale = delivered(jobs.find(job => job.evaluationKey === 'lifecycle:v2:prepare')!)
    wire.statements.length = 0
    await consumeDispatch(batch(stale), env)
    expect(stale.ack).toHaveBeenCalledOnce()
    expect(wire.statements.join('\n')).not.toMatch(/vault\.|bento_lifecycle_journeys|public\.(?:orgs|users|apps|stripe_info|build_requests)/)

    const preparation = next.find(job => job.evaluationKey === 'lifecycle:v2:prepare')!
    wire.statements.length = 0
    const queued = delivered(preparation)
    await consumeDispatch(batch(queued), env)
    expect(queued.ack).toHaveBeenCalledOnce()
    expect(queued.retry).not.toHaveBeenCalled()
    expect(wire.statements.join('\n')).toContain('vault.decrypted_secrets')
    expect((await db.query('SELECT status,result FROM public.bento_evaluation_runs WHERE id=$1', [preparation.runId])).rows).toEqual([
      { status: 'completed', result: { ready: false, claimed: 0, processed: 0, deferred: 0, oldestDueAt: null, saturated: false } },
    ])
  }
  finally {
    await db.close()
    log.mockRestore()
    error.mockRestore()
  }
}, 30_000)
