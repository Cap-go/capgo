// ReplicaRouter: the single Durable Object that links Supabase to the fleet
// of per-app replica DOs (see app_replica.ts).
//
// 1. Postgres triggers append every committed write on the replicated tables
//    to public.replicate_outbox with routing keys (app_id / owner_org).
// 2. This DO polls the outbox with DELETE ... FOR UPDATE SKIP LOCKED inside a
//    transaction and copies the rows into its own SQLite journal before
//    committing the delete — exactly-once into the journal, strictly ordered
//    by outbox id, resumable after any downtime.
// 3. The journal fans out to every registered AppReplica: app-scoped rows to
//    that app's replicas in each region, org-scoped rows to every replica of
//    the org. The per-target cursor only advances on a successful push, so a
//    flaky replica is retried and, after repeated failures, invalidated so
//    it reseeds itself on its next read.
//
// This is "one replica linked to Supabase, as many as needed inside
// Cloudflare": the router is the single consumer Postgres sees; replicas are
// created lazily per app per region by read traffic.

import type { DurableObjectNamespace, Hyperdrive, Request as WorkersRequest, Response as WorkersResponse } from '@cloudflare/workers-types'
import type { EdgeApplyEntry } from '../utils/edge_replica_schema.ts'
import { DurableObject } from 'cloudflare:workers'
// @ts-types="npm:@types/pg"
import { Client } from 'pg'
import { cloudlogErr, serializeError } from '../utils/logging.ts'

export interface ReplicatorEnv {
  REPLICA_ROUTER: DurableObjectNamespace
  APP_REPLICA: DurableObjectNamespace
  // Source used to drain the outbox (main database, direct so the
  // DELETE ... FOR UPDATE transaction stays on one session).
  HYPERDRIVE_OUTBOX?: Hyperdrive
  OUTBOX_DB_URL?: string
  // Source used by AppReplica seeds. Point it at a read replica (or the
  // pooler) so seeds never compete with the main hot path.
  HYPERDRIVE_SEED?: Hyperdrive
  SEED_DB_URL?: string
  REPLICATOR_SECRET?: string
  EDGE_REPLICA_POLL_SECONDS?: string
  EDGE_REPLICA_LEASE_SECONDS?: string
}

const OUTBOX_BATCH_SIZE = 500
const MAX_BATCHES_PER_ALARM = 10
const PUSH_CONCURRENCY = 10
const MAX_PUSH_FAILURES = 3
const JOURNAL_RETENTION_MS = 60 * 60 * 1000
const ERROR_RETRY_MS = 10_000
const BACKLOG_RETRY_MS = 250
const DEFAULT_POLL_SECONDS = 5
const DEFAULT_LEASE_SECONDS = 900

const DRAIN_OUTBOX_SQL = `
  WITH batch AS (
    SELECT id FROM public.replicate_outbox
    ORDER BY id
    LIMIT $1
    FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.replicate_outbox o
  USING batch
  WHERE o.id = batch.id
  RETURNING o.id, o.table_name, o.op, o.app_id, o.owner_org::text AS owner_org, o.row_data
`

interface OutboxRow {
  id: string
  table_name: string
  op: 'INSERT' | 'UPDATE' | 'DELETE'
  app_id: string | null
  owner_org: string | null
  row_data: Record<string, unknown>
}

interface TargetRow {
  name: string
  app_id: string
  owner_org: string | null
  cursor: number
  fail_count: number
  lease_refreshed_at: number
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export class ReplicaRouter extends DurableObject<ReplicatorEnv> {
  constructor(ctx: DurableObjectState, env: ReplicatorEnv) {
    super(ctx, env)
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS router_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`)
      this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS journal (
        id INTEGER PRIMARY KEY,
        table_name TEXT NOT NULL,
        op TEXT NOT NULL,
        app_id TEXT,
        owner_org TEXT,
        row_data TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )`)
      this.ctx.storage.sql.exec(`CREATE INDEX IF NOT EXISTS idx_journal_app ON journal (app_id, id)`)
      this.ctx.storage.sql.exec(`CREATE INDEX IF NOT EXISTS idx_journal_org ON journal (owner_org, id)`)
      this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS targets (
        name TEXT PRIMARY KEY,
        app_id TEXT NOT NULL,
        owner_org TEXT,
        cursor INTEGER NOT NULL,
        fail_count INTEGER NOT NULL DEFAULT 0,
        lease_refreshed_at INTEGER NOT NULL
      )`)
      this.ctx.storage.sql.exec(`CREATE INDEX IF NOT EXISTS idx_targets_app ON targets (app_id)`)
      this.ctx.storage.sql.exec(`CREATE INDEX IF NOT EXISTS idx_targets_org ON targets (owner_org)`)
    })
  }

  private getMeta(key: string): string | null {
    const row = this.ctx.storage.sql
      .exec('SELECT value FROM router_meta WHERE key = ?', key)
      .toArray()
      .at(0) as { value: string } | undefined
    return row?.value ?? null
  }

  private setMeta(key: string, value: string) {
    this.ctx.storage.sql.exec('INSERT OR REPLACE INTO router_meta (key, value) VALUES (?, ?)', key, value)
  }

  private pollMs(): number {
    const raw = Number(this.env.EDGE_REPLICA_POLL_SECONDS)
    const seconds = Number.isFinite(raw) && raw >= 1 ? raw : DEFAULT_POLL_SECONDS
    return seconds * 1000
  }

  private leaseMs(): number {
    const raw = Number(this.env.EDGE_REPLICA_LEASE_SECONDS)
    const seconds = Number.isFinite(raw) && raw >= 60 ? raw : DEFAULT_LEASE_SECONDS
    return seconds * 1000
  }

  private journalHead(): number {
    return Number(this.getMeta('journal_head') ?? 0)
  }

  private replicaStub(name: string) {
    return this.env.APP_REPLICA.get(this.env.APP_REPLICA.idFromName(name)) as any
  }

  private async scheduleAlarm(delayMs: number) {
    await this.ctx.storage.setAlarm(Date.now() + delayMs)
  }

  private connectionString(): string {
    const outbox = this.env.HYPERDRIVE_OUTBOX?.connectionString ?? this.env.OUTBOX_DB_URL
    if (!outbox)
      throw new Error('replicator: no Postgres source configured (HYPERDRIVE_OUTBOX or OUTBOX_DB_URL)')
    return outbox
  }

  private async withPg<T>(fn: (client: Client) => Promise<T>): Promise<T> {
    const client = new Client({
      connectionString: this.connectionString(),
      application_name: 'capgo_replica_router',
      connectionTimeoutMillis: 10_000,
    })
    await client.connect()
    try {
      return await fn(client)
    }
    finally {
      await client.end().catch(() => undefined)
    }
  }

  // ------------------------------------------------------------------
  // RPCs (called by AppReplica DOs)
  // ------------------------------------------------------------------

  async register(input: { name: string, appId: string, ownerOrg: string | null }): Promise<{ leaseMs: number }> {
    this.ctx.storage.sql.exec(
      `INSERT OR REPLACE INTO targets (name, app_id, owner_org, cursor, fail_count, lease_refreshed_at)
       VALUES (?, ?, ?, ?, 0, ?)`,
      input.name,
      input.appId,
      input.ownerOrg,
      this.journalHead(),
      Date.now(),
    )
    // Make sure the stream is running as soon as the first replica exists.
    if ((await this.ctx.storage.getAlarm()) === null)
      await this.scheduleAlarm(0)
    return { leaseMs: this.leaseMs() }
  }

  async unregister(name: string): Promise<{ ok: boolean }> {
    this.ctx.storage.sql.exec('DELETE FROM targets WHERE name = ?', name)
    return { ok: true }
  }


  // ------------------------------------------------------------------
  // Admin endpoints (Bearer REPLICATOR_SECRET)
  // ------------------------------------------------------------------

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const secret = this.env.REPLICATOR_SECRET
    if (!secret)
      return jsonResponse({ error: 'REPLICATOR_SECRET is not configured' }, 503)
    if (request.headers.get('Authorization') !== `Bearer ${secret}`)
      return jsonResponse({ error: 'unauthorized' }, 401)

    try {
      switch (`${request.method} ${url.pathname}`) {
        case 'POST /pause': {
          this.setMeta('paused', '1')
          await this.ctx.storage.deleteAlarm()
          return jsonResponse({ ok: true, paused: true })
        }
        case 'POST /resume': {
          this.setMeta('paused', '0')
          await this.scheduleAlarm(0)
          return jsonResponse({ ok: true, paused: false })
        }
        case 'POST /ensure': {
          // Called by the cron trigger: re-arm the alarm if it was lost.
          if (this.getMeta('paused') !== '1' && (await this.ctx.storage.getAlarm()) === null)
            await this.scheduleAlarm(0)
          return jsonResponse({ ok: true })
        }
        case 'POST /invalidate-all': {
          // Force every replica to reseed (e.g. after a schema change).
          const targets = this.ctx.storage.sql.exec('SELECT name FROM targets').toArray() as { name: string }[]
          for (const target of targets)
            await this.replicaStub(target.name).invalidate().catch(() => undefined)
          this.ctx.storage.sql.exec('DELETE FROM targets')
          return jsonResponse({ ok: true, invalidated: targets.length })
        }
        case 'GET /status':
          return jsonResponse(await this.status())
        default:
          return jsonResponse({ error: 'not found' }, 404)
      }
    }
    catch (e) {
      cloudlogErr({ message: 'replica router fetch error', error: serializeError(e) })
      return jsonResponse({ error: 'internal error' }, 500)
    }
  }

  private async status() {
    const targetCount = (this.ctx.storage.sql.exec('SELECT count(*) AS c FROM targets').toArray().at(0) as { c: number }).c
    const journal = this.ctx.storage.sql
      .exec('SELECT count(*) AS c, min(id) AS min_id, max(id) AS max_id FROM journal')
      .toArray()
      .at(0)
    const lagging = this.ctx.storage.sql
      .exec('SELECT count(*) AS c FROM targets WHERE cursor < ?', this.journalHead())
      .toArray()
      .at(0) as { c: number }
    const outbox = await this.withPg(async client => (await client.query(
      'SELECT count(*)::bigint AS depth, min(created_at) AS oldest FROM public.replicate_outbox',
    )).rows[0]).catch((e: unknown) => ({ error: e instanceof Error ? e.message : String(e) }))
    return {
      paused: this.getMeta('paused') === '1',
      alarm: await this.ctx.storage.getAlarm(),
      journal_head: this.journalHead(),
      last_drain_at: this.getMeta('last_drain_at'),
      targets: targetCount,
      targets_lagging: lagging.c,
      journal,
      outbox,
    }
  }

  // ------------------------------------------------------------------
  // Stream loop
  // ------------------------------------------------------------------

  async alarm(): Promise<void> {
    if (this.getMeta('paused') === '1')
      return
    try {
      const drained = await this.drainOutbox()
      await this.fanOut(drained)
      this.maintain(drained)
      // While a backlog remains, loop immediately and keep leases frozen so
      // replicas expire (and answer "no update") instead of serving data
      // that silently lags the outbox.
      await this.scheduleAlarm(drained ? this.pollMs() : BACKLOG_RETRY_MS)
    }
    catch (e) {
      cloudlogErr({ message: 'replica router alarm error', error: serializeError(e) })
      await this.scheduleAlarm(ERROR_RETRY_MS)
    }
  }

  // Move outbox rows into the local journal. The journal write happens
  // before the Postgres COMMIT: if the DO dies in between, Postgres rolls
  // back and the same rows are re-inserted next run (INSERT OR REPLACE by
  // outbox id), so the journal never misses or duplicates a change.
  private async drainOutbox(): Promise<boolean> {
    return await this.withPg(async (client) => {
      for (let i = 0; i < MAX_BATCHES_PER_ALARM; i++) {
        await client.query('BEGIN')
        try {
          const result = await client.query(DRAIN_OUTBOX_SQL, [OUTBOX_BATCH_SIZE])
          const rows = (result.rows as OutboxRow[]).sort((a, b) => Number(a.id) - Number(b.id))
          if (rows.length > 0) {
            const now = Date.now()
            this.ctx.storage.transactionSync(() => {
              for (const row of rows) {
                this.ctx.storage.sql.exec(
                  'INSERT OR REPLACE INTO journal (id, table_name, op, app_id, owner_org, row_data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
                  Number(row.id),
                  row.table_name,
                  row.op,
                  row.app_id,
                  row.owner_org,
                  JSON.stringify(row.row_data),
                  now,
                )
              }
              this.setMeta('journal_head', String(Number(rows.at(-1)!.id)))
            })
          }
          await client.query('COMMIT')
          this.setMeta('last_drain_at', new Date().toISOString())
          if (rows.length < OUTBOX_BATCH_SIZE)
            return true
        }
        catch (e) {
          await client.query('ROLLBACK').catch(() => undefined)
          throw e
        }
      }
      // Every batch came back full: there is more outbox behind us.
      return false
    })
  }

  // Push pending journal rows to every registered replica. The cursor is a
  // journal watermark per target and only advances on success (or when the
  // target has nothing relevant in the window), so delivery per replica is
  // ordered and at-least-once; replicas apply idempotently.
  private async fanOut(drained: boolean): Promise<void> {
    const head = this.journalHead()
    const pending = this.ctx.storage.sql
      .exec('SELECT name, app_id, owner_org, cursor, fail_count, lease_refreshed_at FROM targets WHERE cursor < ?', head)
      .toArray() as unknown as TargetRow[]
    for (let i = 0; i < pending.length; i += PUSH_CONCURRENCY) {
      await Promise.all(pending.slice(i, i + PUSH_CONCURRENCY).map(target => this.pushTarget(target, head, drained)))
    }
  }

  private relevantRows(target: TargetRow, head: number): EdgeApplyEntry[] {
    const rows = this.ctx.storage.sql
      .exec(
        `SELECT table_name, op, row_data FROM journal
         WHERE id > ? AND id <= ? AND (app_id = ? OR (app_id IS NULL AND owner_org = ?))
         ORDER BY id`,
        target.cursor,
        head,
        target.app_id,
        target.owner_org,
      )
      .toArray() as { table_name: string, op: EdgeApplyEntry['op'], row_data: string }[]
    return rows.map(row => ({ table: row.table_name, op: row.op, row: JSON.parse(row.row_data) }))
  }

  private async pushTarget(target: TargetRow, head: number, drained: boolean): Promise<void> {
    const entries = this.relevantRows(target, head)
    if (entries.length === 0) {
      // Nothing relevant in the window: advance the watermark locally.
      this.ctx.storage.sql.exec('UPDATE targets SET cursor = ? WHERE name = ?', head, target.name)
      return
    }
    try {
      const result = await this.replicaStub(target.name).applyBatch({ entries, leaseMs: this.leaseMs(), extendLease: drained })
      if (result?.unregister) {
        this.ctx.storage.sql.exec('DELETE FROM targets WHERE name = ?', target.name)
        return
      }
      this.ctx.storage.sql.exec(
        'UPDATE targets SET cursor = ?, fail_count = 0, lease_refreshed_at = ? WHERE name = ?',
        head,
        Date.now(),
        target.name,
      )
    }
    catch (e) {
      const failCount = target.fail_count + 1
      cloudlogErr({ message: 'replica push failed', target: target.name, failCount, error: serializeError(e) })
      if (failCount >= MAX_PUSH_FAILURES) {
        // Give up: drop the registration and force a reseed on next read.
        this.ctx.storage.sql.exec('DELETE FROM targets WHERE name = ?', target.name)
        await this.replicaStub(target.name).invalidate().catch(() => undefined)
      }
      else {
        this.ctx.storage.sql.exec('UPDATE targets SET fail_count = ? WHERE name = ?', failCount, target.name)
      }
    }
  }

  // Lease refresh for idle targets + journal pruning. Runs inline with the
  // poll; the refresh set is small (only leases past 1/3 of their life).
  // Heartbeats are skipped while the outbox has a backlog: leases must only
  // ever assert "this replica is caught up as of now".
  private maintain(drained: boolean): void {
    const now = Date.now()
    const leaseMs = this.leaseMs()
    // Only targets that are fully caught up with the journal may have their
    // lease refreshed without a data push: a lease asserts "caught up".
    const stale = drained
      ? this.ctx.storage.sql
          .exec(
            'SELECT name, app_id, owner_org, cursor, fail_count, lease_refreshed_at FROM targets WHERE lease_refreshed_at < ? AND cursor >= ? LIMIT 200',
            now - leaseMs / 3,
            this.journalHead(),
          )
          .toArray() as unknown as TargetRow[]
      : []
    for (const target of stale) {
      this.ctx.waitUntil((async () => {
        try {
          const result = await this.replicaStub(target.name).applyBatch({ entries: [], leaseMs, extendLease: true })
          if (result?.unregister)
            this.ctx.storage.sql.exec('DELETE FROM targets WHERE name = ?', target.name)
          else
            this.ctx.storage.sql.exec('UPDATE targets SET lease_refreshed_at = ? WHERE name = ?', now, target.name)
        }
        catch {
          // Push path handles persistent failures.
        }
      })())
    }
    // Prune everything all targets have consumed, and cap retention by age.
    // Age-pruning may drop rows a lagging target has not consumed yet, so
    // any target still behind the aged window is invalidated first — it
    // reseeds on its next read instead of silently missing changes forever.
    const agedMax = this.ctx.storage.sql
      .exec('SELECT max(id) AS m FROM journal WHERE created_at < ?', now - JOURNAL_RETENTION_MS)
      .toArray()
      .at(0) as { m: number | null }
    if (agedMax.m !== null) {
      const stranded = this.ctx.storage.sql
        .exec('SELECT name FROM targets WHERE cursor < ?', agedMax.m)
        .toArray() as { name: string }[]
      for (const target of stranded) {
        this.ctx.storage.sql.exec('DELETE FROM targets WHERE name = ?', target.name)
        this.ctx.waitUntil(this.replicaStub(target.name).invalidate().catch(() => undefined))
      }
    }
    const minCursor = this.ctx.storage.sql
      .exec('SELECT coalesce(min(cursor), ?) AS m FROM targets', this.journalHead())
      .toArray()
      .at(0) as { m: number }
    this.ctx.storage.sql.exec(
      'DELETE FROM journal WHERE id <= ? OR created_at < ?',
      minCursor.m,
      now - JOURNAL_RETENTION_MS,
    )
  }
}

export function getRouterStub(env: ReplicatorEnv) {
  return env.REPLICA_ROUTER.get(env.REPLICA_ROUTER.idFromName('main'))
}

// The worker in front of the DOs: forwards management calls to the router
// and keeps its alarm alive from a cron trigger.
export const replicatorWorker = {
  async fetch(request: WorkersRequest, env: ReplicatorEnv): Promise<WorkersResponse> {
    return getRouterStub(env).fetch(request)
  },
  async scheduled(_event: unknown, env: ReplicatorEnv): Promise<void> {
    const secret = env.REPLICATOR_SECRET
    if (!secret)
      return
    await getRouterStub(env).fetch('https://replicator.internal/ensure', {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}` },
    })
  },
}
