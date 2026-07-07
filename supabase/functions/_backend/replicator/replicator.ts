// Durable Object that keeps the Cloudflare-embedded read replica (D1) in
// sync with the Supabase main database.
//
// Flow:
// 1. Postgres triggers append every committed write on the replicated tables
//    to public.replicate_outbox (see the edge_replica_outbox migration).
// 2. This DO polls the outbox with DELETE ... FOR UPDATE SKIP LOCKED inside a
//    transaction, applies the batch to D1, then commits the delete. If the D1
//    write fails the transaction rolls back and the rows are retried, so
//    delivery is exactly-once and strictly ordered by outbox id.
// 3. Initial data comes from a resumable, keyset-paginated seed that reads
//    from a read replica (never the main database). Outbox rows accumulated
//    while seeding are replayed afterwards; upserts are idempotent so the
//    replica converges to a consistent snapshot.
//
// D1 read replication (Sessions API) then distributes the database to every
// D1 region automatically — that is the fan-out the regional Cloud SQL
// replicas used to provide.

import type { D1Database, D1PreparedStatement, DurableObjectNamespace, Hyperdrive, Request as WorkersRequest, Response as WorkersResponse } from '@cloudflare/workers-types'
import { DurableObject } from 'cloudflare:workers'
// @ts-types="npm:@types/pg"
import { Client } from 'pg'
import {
  buildDeleteStatement,
  buildEdgeReplicaDDL,
  buildUpsertStatement,
  EDGE_REPLICA_SCHEMA_VERSION,
  EDGE_REPLICA_TABLES,
  pgJsonRowToPkValues,
  pgJsonRowToSqliteValues,
} from '../utils/edge_replica_schema.ts'

export interface ReplicatorEnv {
  DB_REPLICA: D1Database
  REPLICATOR: DurableObjectNamespace
  // Source used to drain the outbox (main database or its pooler).
  HYPERDRIVE_OUTBOX?: Hyperdrive
  OUTBOX_DB_URL?: string
  // Source used for the initial snapshot. Point it at a read replica so the
  // seed never scans the main database. Falls back to the outbox source.
  HYPERDRIVE_SEED?: Hyperdrive
  SEED_DB_URL?: string
  REPLICATOR_SECRET?: string
  EDGE_REPLICA_POLL_SECONDS?: string
}

type ReplicatorMode = 'idle' | 'seeding' | 'streaming'

const OUTBOX_BATCH_SIZE = 200
const MAX_BATCHES_PER_ALARM = 10
const SEED_PAGE_SIZE = 2000
const SEED_PAGES_PER_ALARM = 5
const ERROR_RETRY_MS = 10_000
const DEFAULT_POLL_SECONDS = 5

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
  RETURNING o.id, o.table_name, o.op, o.row_data
`

interface OutboxRow {
  id: string
  table_name: string
  op: 'INSERT' | 'UPDATE' | 'DELETE'
  row_data: Record<string, unknown>
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export class Replicator extends DurableObject<ReplicatorEnv> {
  private upserts = new Map<string, D1PreparedStatement>()
  private deletes = new Map<string, D1PreparedStatement>()

  private get db(): D1Database {
    return this.env.DB_REPLICA
  }

  private pollMs(): number {
    const raw = Number(this.env.EDGE_REPLICA_POLL_SECONDS)
    const seconds = Number.isFinite(raw) && raw >= 1 ? raw : DEFAULT_POLL_SECONDS
    return seconds * 1000
  }

  private connectionString(kind: 'outbox' | 'seed'): string {
    if (kind === 'seed') {
      const seed = this.env.HYPERDRIVE_SEED?.connectionString ?? this.env.SEED_DB_URL
      if (seed)
        return seed
    }
    const outbox = this.env.HYPERDRIVE_OUTBOX?.connectionString ?? this.env.OUTBOX_DB_URL
    if (!outbox)
      throw new Error('replicator: no Postgres source configured (HYPERDRIVE_OUTBOX or OUTBOX_DB_URL)')
    return outbox
  }

  private async withPg<T>(kind: 'outbox' | 'seed', fn: (client: Client) => Promise<T>): Promise<T> {
    const client = new Client({
      connectionString: this.connectionString(kind),
      application_name: `capgo_replicator_${kind}`,
      connectionTimeoutMillis: 10_000,
    })
    await client.connect()
    try {
      return await fn(client)
    }
    finally {
      await client.end().catch(() => {})
    }
  }

  private upsertFor(table: string): D1PreparedStatement {
    let statement = this.upserts.get(table)
    if (!statement) {
      statement = this.db.prepare(buildUpsertStatement(table))
      this.upserts.set(table, statement)
    }
    return statement
  }

  private deleteFor(table: string): D1PreparedStatement {
    let statement = this.deletes.get(table)
    if (!statement) {
      statement = this.db.prepare(buildDeleteStatement(table))
      this.deletes.set(table, statement)
    }
    return statement
  }

  private stateStatement(key: string, value: string): D1PreparedStatement {
    return this.db
      .prepare('INSERT OR REPLACE INTO replication_state (key, value) VALUES (?1, ?2)')
      .bind(key, value)
  }

  private async ensureSchema() {
    await this.db.batch(buildEdgeReplicaDDL().map(sql => this.db.prepare(sql)))
    await this.stateStatement('schema_version', String(EDGE_REPLICA_SCHEMA_VERSION)).run()
  }

  private async setMode(mode: ReplicatorMode) {
    await this.ctx.storage.put('mode', mode)
  }

  private async getMode(): Promise<ReplicatorMode> {
    return (await this.ctx.storage.get<ReplicatorMode>('mode')) ?? 'idle'
  }

  private async scheduleAlarm(delayMs: number) {
    await this.ctx.storage.setAlarm(Date.now() + delayMs)
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const secret = this.env.REPLICATOR_SECRET
    if (!secret)
      return jsonResponse({ error: 'REPLICATOR_SECRET is not configured' }, 503)
    if (request.headers.get('Authorization') !== `Bearer ${secret}`)
      return jsonResponse({ error: 'unauthorized' }, 401)

    try {
      switch (`${request.method} ${url.pathname}`) {
        case 'POST /init': {
          await this.ensureSchema()
          return jsonResponse({ ok: true })
        }
        case 'POST /seed': {
          await this.ensureSchema()
          await this.ctx.storage.put('seed_tables', Object.keys(EDGE_REPLICA_TABLES))
          await this.ctx.storage.delete('seed_cursor')
          await this.db.prepare(`DELETE FROM replication_state WHERE key IN ('seeded_at', 'last_applied_at')`).run()
          await this.stateStatement('seeding_started_at', new Date().toISOString()).run()
          await this.setMode('seeding')
          await this.scheduleAlarm(0)
          return jsonResponse({ ok: true, mode: 'seeding' })
        }
        case 'POST /pause': {
          await this.setMode('idle')
          await this.ctx.storage.deleteAlarm()
          return jsonResponse({ ok: true, mode: 'idle' })
        }
        case 'POST /resume': {
          await this.setMode('streaming')
          await this.scheduleAlarm(0)
          return jsonResponse({ ok: true, mode: 'streaming' })
        }
        case 'POST /ensure': {
          // Called by the cron trigger: re-arm the alarm if it was lost.
          const mode = await this.getMode()
          if (mode !== 'idle' && (await this.ctx.storage.getAlarm()) === null)
            await this.scheduleAlarm(0)
          return jsonResponse({ ok: true, mode })
        }
        case 'GET /status':
          return jsonResponse(await this.status())
        default:
          return jsonResponse({ error: 'not found' }, 404)
      }
    }
    catch (e) {
      console.error('replicator fetch error', e)
      return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 500)
    }
  }

  private async status() {
    const mode = await this.getMode()
    const seedTables = await this.ctx.storage.get<string[]>('seed_tables')
    const stateResult = await this.db.prepare('SELECT key, value FROM replication_state').all()
    const state = Object.fromEntries((stateResult.results as { key: string, value: string }[]).map(row => [row.key, row.value]))
    const outbox = await this.withPg('outbox', async client => (await client.query(
      'SELECT count(*)::bigint AS depth, min(created_at) AS oldest FROM public.replicate_outbox',
    )).rows[0]).catch((e: unknown) => ({ error: e instanceof Error ? e.message : String(e) }))
    const counts: Record<string, number> = {}
    for (const table of Object.keys(EDGE_REPLICA_TABLES)) {
      const row = await this.db.prepare(`SELECT count(*) AS c FROM "${table}"`).first<{ c: number }>()
      counts[table] = row?.c ?? 0
    }
    return {
      mode,
      alarm: await this.ctx.storage.getAlarm(),
      pending_seed_tables: seedTables ?? [],
      replication_state: state,
      outbox,
      d1_row_counts: counts,
    }
  }

  async alarm(): Promise<void> {
    const mode = await this.getMode()
    try {
      if (mode === 'seeding') {
        const done = await this.seedStep()
        await this.scheduleAlarm(done ? this.pollMs() : 250)
      }
      else if (mode === 'streaming') {
        await this.drainOutbox()
        await this.scheduleAlarm(this.pollMs())
      }
    }
    catch (e) {
      console.error('replicator alarm error', mode, e)
      await this.scheduleAlarm(ERROR_RETRY_MS)
    }
  }

  // Consume up to MAX_BATCHES_PER_ALARM batches from the outbox and apply
  // them to D1. The heartbeat write happens every run, even when the outbox
  // is empty: readers use it as the liveness/staleness signal.
  private async drainOutbox(): Promise<void> {
    await this.withPg('outbox', async (client) => {
      for (let i = 0; i < MAX_BATCHES_PER_ALARM; i++) {
        await client.query('BEGIN')
        try {
          const result = await client.query(DRAIN_OUTBOX_SQL, [OUTBOX_BATCH_SIZE])
          const rows = (result.rows as OutboxRow[]).sort((a, b) => Number(a.id) - Number(b.id))
          const statements = this.buildApplyStatements(rows)
          statements.push(this.stateStatement('last_applied_at', new Date().toISOString()))
          if (rows.length > 0)
            statements.push(this.stateStatement('last_outbox_id', String(rows[rows.length - 1].id)))
          await this.db.batch(statements)
          await client.query('COMMIT')
          if (rows.length < OUTBOX_BATCH_SIZE)
            return
        }
        catch (e) {
          await client.query('ROLLBACK').catch(() => {})
          throw e
        }
      }
    })
  }

  private buildApplyStatements(rows: OutboxRow[]): D1PreparedStatement[] {
    const statements: D1PreparedStatement[] = []
    for (const row of rows) {
      if (!EDGE_REPLICA_TABLES[row.table_name]) {
        console.warn('replicator: skipping unknown table', row.table_name)
        continue
      }
      if (row.op === 'DELETE')
        statements.push(this.deleteFor(row.table_name).bind(...pgJsonRowToPkValues(row.table_name, row.row_data)))
      else
        statements.push(this.upsertFor(row.table_name).bind(...pgJsonRowToSqliteValues(row.table_name, row.row_data)))
    }
    return statements
  }

  // One resumable seed step: copies up to SEED_PAGES_PER_ALARM pages of the
  // current table from the seed source into D1. Returns true when the whole
  // seed is finished.
  private async seedStep(): Promise<boolean> {
    const tables = (await this.ctx.storage.get<string[]>('seed_tables')) ?? []
    if (tables.length === 0) {
      await this.stateStatement('seeded_at', new Date().toISOString()).run()
      await this.stateStatement('last_applied_at', new Date().toISOString()).run()
      await this.setMode('streaming')
      console.warn('replicator: seed complete, streaming outbox')
      return true
    }

    const table = tables[0]
    const spec = EDGE_REPLICA_TABLES[table]
    const pkList = spec.pk.map(col => `t."${col}"`).join(', ')

    await this.withPg('seed', async (client) => {
      for (let page = 0; page < SEED_PAGES_PER_ALARM; page++) {
        const cursor = await this.ctx.storage.get<unknown[]>('seed_cursor')
        if (!cursor) {
          // First page of this table: reset the D1 copy so reseeding is safe.
          await this.db.prepare(`DELETE FROM "${table}"`).run()
        }
        const where = cursor
          ? `WHERE (${pkList}) > (${spec.pk.map((_, index) => `$${index + 1}`).join(', ')})`
          : ''
        const result = await client.query(
          `SELECT row_to_json(t) AS r, ${pkList} FROM public."${table}" t ${where} ORDER BY ${pkList} LIMIT ${SEED_PAGE_SIZE}`,
          (cursor ?? []) as unknown[],
        )
        const rows = result.rows as ({ r: Record<string, unknown> } & Record<string, unknown>)[]
        if (rows.length > 0) {
          const statements = rows.map(row =>
            this.upsertFor(table).bind(...pgJsonRowToSqliteValues(table, row.r)))
          await this.db.batch(statements)
          const last = rows[rows.length - 1]
          await this.ctx.storage.put('seed_cursor', spec.pk.map(col => last[col]))
        }
        if (rows.length < SEED_PAGE_SIZE) {
          await this.ctx.storage.put('seed_tables', tables.slice(1))
          await this.ctx.storage.delete('seed_cursor')
          console.warn('replicator: seeded table', table)
          return
        }
      }
    })
    return false
  }
}

export function getReplicatorStub(env: ReplicatorEnv) {
  return env.REPLICATOR.get(env.REPLICATOR.idFromName('main'))
}

// The worker in front of the DO: forwards management calls to the singleton
// and keeps its alarm alive from a cron trigger.
export const replicatorWorker = {
  async fetch(request: WorkersRequest, env: ReplicatorEnv): Promise<WorkersResponse> {
    return getReplicatorStub(env).fetch(request)
  },
  async scheduled(_event: unknown, env: ReplicatorEnv): Promise<void> {
    const secret = env.REPLICATOR_SECRET
    if (!secret)
      return
    await getReplicatorStub(env).fetch('https://replicator.internal/ensure', {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}` },
    })
  },
}
