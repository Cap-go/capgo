// Per-app, per-region embedded read replica (Durable Object + SQLite).
//
// One instance exists per `${region}:${app_id}` that actually receives
// traffic. It holds the app's slice of the replicated tables (channels,
// versions, manifest, device overrides) plus its owning org's rows, seeds
// itself lazily from Postgres on first read in a region, registers with the
// ReplicaRouter, and then receives ordered pushes from the outbox journal.
//
// Freshness is a lease: every push or heartbeat from the router extends
// `lease_until`. Reads past the lease answer `unavailable` and the caller
// falls back to Postgres, so a dead router degrades to today's behavior
// instead of serving stale data. Replicas idle for a week ask the router to
// unregister them and wipe their storage.

import type { EdgeApplyBatch, EdgeApplyResult, EdgeInfosArgs, EdgeQueryResult, EdgeReplicaRow, PlanLimitAction } from '../utils/edge_replica_schema.ts'
import type { ReplicatorEnv } from './replicator.ts'
import { DurableObject } from 'cloudflare:workers'
// @ts-types="npm:@types/pg"
import { Client } from 'pg'
import {
  buildAppOwnerQuery,
  buildAppSeedQueries,
  buildBlockProviderQuery,
  buildChannelByIdQuery,
  buildChannelDeviceQuery,
  buildChannelQuery,
  buildDeleteStatement,
  buildEdgeReplicaDDL,
  buildManifestQuery,
  buildUpsertStatement,
  EDGE_REPLICA_TABLES,
  pgJsonRowToPkValues,
  pgJsonRowToSqliteValues,
} from '../utils/edge_replica_schema.ts'

const SEED_PAGE_SIZE = 5000
const IDLE_EVICT_MS = 7 * 24 * 3600 * 1000

export class AppReplica extends DurableObject<ReplicatorEnv> {
  private seedingPromise: Promise<void> | null = null

  constructor(ctx: DurableObjectState, env: ReplicatorEnv) {
    super(ctx, env)
    ctx.blockConcurrencyWhile(async () => {
      for (const ddl of buildEdgeReplicaDDL())
        this.ctx.storage.sql.exec(ddl)
      this.ctx.storage.sql.exec(
        'CREATE TABLE IF NOT EXISTS pending_batches (seq INTEGER PRIMARY KEY AUTOINCREMENT, payload TEXT NOT NULL)',
      )
    })
  }

  private getMeta(key: string): string | null {
    const row = this.ctx.storage.sql
      .exec('SELECT value FROM replica_meta WHERE key = ?', key)
      .toArray()
      .at(0) as { value: string } | undefined
    return row?.value ?? null
  }

  private setMeta(key: string, value: string) {
    this.ctx.storage.sql.exec('INSERT OR REPLACE INTO replica_meta (key, value) VALUES (?, ?)', key, value)
  }

  private isFresh(): boolean {
    if (this.getMeta('seeded') !== '1')
      return false
    return Date.now() < Number(this.getMeta('lease_until') ?? 0)
  }

  private touchRead() {
    this.setMeta('last_read_at', String(Date.now()))
  }

  private rows(sql: string, params: unknown[]): EdgeReplicaRow[] {
    return this.ctx.storage.sql.exec(sql, ...params as (string | number | null)[]).toArray() as EdgeReplicaRow[]
  }

  private unavailable(appId: string): EdgeQueryResult {
    // Kick the seed in the background; the caller falls back to Postgres for
    // this request so no device ever waits on a seed.
    this.scheduleSeed(appId)
    return { status: 'unavailable' }
  }

  // ------------------------------------------------------------------
  // Read RPCs (called by the plugin workers)
  // ------------------------------------------------------------------

  async queryAppOwner(appId: string, actions: PlanLimitAction[]): Promise<EdgeQueryResult> {
    this.touchRead()
    if (!this.isFresh())
      return this.unavailable(appId)
    const query = buildAppOwnerQuery(appId, actions)
    return { status: 'ok', rows: this.rows(query.sql, query.params) }
  }

  async queryBlockProvider(appId: string): Promise<EdgeQueryResult> {
    this.touchRead()
    if (!this.isFresh())
      return this.unavailable(appId)
    const query = buildBlockProviderQuery(appId)
    return { status: 'ok', rows: this.rows(query.sql, query.params) }
  }

  async queryInfos(appId: string, args: EdgeInfosArgs): Promise<EdgeQueryResult> {
    this.touchRead()
    if (!this.isFresh())
      return this.unavailable(appId)
    const options = { includeManifest: args.includeManifest, includeMetadata: args.includeMetadata, rollout: args.rollout }
    let override: EdgeReplicaRow[] = []
    if (typeof args.channelSelfOverrideChannelId === 'number') {
      const query = buildChannelByIdQuery(appId, args.channelSelfOverrideChannelId, options)
      override = this.rows(query.sql, query.params)
    }
    else if (args.queryOverride) {
      const query = buildChannelDeviceQuery(appId, args.deviceId, options)
      override = this.rows(query.sql, query.params)
    }
    const channelQuery = buildChannelQuery(args.platform, appId, args.defaultChannel, options)
    return { status: 'ok', override, rows: this.rows(channelQuery.sql, channelQuery.params) }
  }

  async queryManifest(appId: string, versionId: number): Promise<EdgeQueryResult> {
    this.touchRead()
    if (!this.isFresh())
      return this.unavailable(appId)
    const query = buildManifestQuery(versionId)
    return { status: 'ok', rows: this.rows(query.sql, query.params) }
  }

  // ------------------------------------------------------------------
  // Replication RPCs (called by the ReplicaRouter)
  // ------------------------------------------------------------------

  async applyBatch(batch: EdgeApplyBatch): Promise<EdgeApplyResult> {
    const lastRead = Number(this.getMeta('last_read_at') ?? 0)
    if (lastRead > 0 && Date.now() - lastRead > IDLE_EVICT_MS) {
      await this.wipe()
      return { unregister: true }
    }
    if (this.seedingPromise) {
      // Seed in progress: buffer, replayed in order right after the snapshot.
      this.ctx.storage.sql.exec('INSERT INTO pending_batches (payload) VALUES (?)', JSON.stringify(batch.entries))
      return { ok: true }
    }
    if (this.getMeta('seeded') !== '1') {
      // Not seeded: the future seed snapshot subsumes these rows.
      return { ok: true }
    }
    this.ctx.storage.transactionSync(() => {
      this.applyEntries(batch.entries)
      this.setMeta('lease_until', String(Date.now() + batch.leaseMs))
    })
    return { ok: true }
  }

  async invalidate(): Promise<EdgeApplyResult> {
    await this.wipe()
    return { ok: true }
  }

  // ------------------------------------------------------------------

  private applyEntries(entries: EdgeApplyBatch['entries']) {
    for (const entry of entries) {
      if (!EDGE_REPLICA_TABLES[entry.table])
        continue
      if (entry.op === 'DELETE') {
        this.ctx.storage.sql.exec(buildDeleteStatement(entry.table), ...pgJsonRowToPkValues(entry.table, entry.row) as (string | number | null)[])
      }
      else {
        this.ctx.storage.sql.exec(buildUpsertStatement(entry.table), ...pgJsonRowToSqliteValues(entry.table, entry.row) as (string | number | null)[])
        // If the app moved to another org, re-register so org-scoped rows
        // (orgs, stripe_info) keep routing to this replica.
        if (entry.table === 'apps' && entry.row.owner_org && entry.row.owner_org !== this.getMeta('owner_org')) {
          this.setMeta('owner_org', String(entry.row.owner_org))
          this.ctx.waitUntil(this.register(String(entry.row.app_id), String(entry.row.owner_org)).then(() => undefined).catch(() => undefined))
        }
      }
    }
  }

  private async wipe() {
    this.ctx.storage.transactionSync(() => {
      for (const table of Object.keys(EDGE_REPLICA_TABLES))
        this.ctx.storage.sql.exec(`DELETE FROM "${table}"`)
      this.ctx.storage.sql.exec('DELETE FROM pending_batches')
      this.ctx.storage.sql.exec(`DELETE FROM replica_meta WHERE key IN ('seeded', 'lease_until', 'owner_org')`)
    })
    const name = this.ctx.id.name
    if (name) {
      const router = this.env.REPLICA_ROUTER.get(this.env.REPLICA_ROUTER.idFromName('main')) as any
      await router.unregister(name).catch(() => undefined)
    }
  }

  private scheduleSeed(appId: string) {
    if (this.seedingPromise)
      return
    this.seedingPromise = this.seed(appId)
      .catch((e: unknown) => console.error('app replica seed failed', this.ctx.id.name, e))
      .finally(() => {
        this.seedingPromise = null
      })
    this.ctx.waitUntil(this.seedingPromise)
  }

  private async register(appId: string, ownerOrg: string | null) {
    const name = this.ctx.id.name ?? appId
    const router = this.env.REPLICA_ROUTER.get(this.env.REPLICA_ROUTER.idFromName('main')) as any
    return await router.register({ name, appId, ownerOrg }) as { leaseMs: number }
  }

  private seedSource(): string {
    const url = this.env.HYPERDRIVE_SEED?.connectionString
      ?? this.env.SEED_DB_URL
      ?? this.env.HYPERDRIVE_OUTBOX?.connectionString
      ?? this.env.OUTBOX_DB_URL
    if (!url)
      throw new Error('app replica: no Postgres seed source configured')
    return url
  }

  private async seed(appId: string) {
    const client = new Client({
      connectionString: this.seedSource(),
      application_name: 'capgo_app_replica_seed',
      connectionTimeoutMillis: 10_000,
    })
    await client.connect()
    try {
      const appResult = await client.query('SELECT owner_org::text AS owner_org FROM public.apps WHERE app_id = $1', [appId])
      const ownerOrg: string | null = appResult.rows.at(0)?.owner_org ?? null

      // Register first so the router pushes every change committed after this
      // point; pushes arriving during the seed are buffered and replayed.
      const { leaseMs } = await this.register(appId, ownerOrg)
      this.ctx.storage.transactionSync(() => {
        this.ctx.storage.sql.exec('DELETE FROM pending_batches')
        for (const table of Object.keys(EDGE_REPLICA_TABLES))
          this.ctx.storage.sql.exec(`DELETE FROM "${table}"`)
      })

      for (const spec of buildAppSeedQueries()) {
        const bind = spec.binds === 'app' ? appId : ownerOrg
        if (bind === null)
          continue
        let cursor: unknown = null
        while (true) {
          const pageSql = cursor === null
            ? `${spec.sql} ORDER BY k1 LIMIT ${SEED_PAGE_SIZE}`
            : `${spec.sql} AND ${spec.keyset} > $2 ORDER BY k1 LIMIT ${SEED_PAGE_SIZE}`
          const result = await client.query(pageSql, cursor === null ? [bind] : [bind, cursor])
          const rows = result.rows as { r: Record<string, unknown>, k1: unknown }[]
          if (rows.length > 0) {
            this.ctx.storage.transactionSync(() => {
              for (const row of rows)
                this.ctx.storage.sql.exec(buildUpsertStatement(spec.table), ...pgJsonRowToSqliteValues(spec.table, row.r) as (string | number | null)[])
            })
            cursor = rows[rows.length - 1].k1
          }
          if (rows.length < SEED_PAGE_SIZE)
            break
        }
      }

      // Replay pushes buffered while the snapshot ran; upserts are
      // idempotent so replay over the snapshot converges.
      this.ctx.storage.transactionSync(() => {
        const pending = this.ctx.storage.sql
          .exec('SELECT seq, payload FROM pending_batches ORDER BY seq')
          .toArray() as { seq: number, payload: string }[]
        for (const batch of pending)
          this.applyEntries(JSON.parse(batch.payload))
        this.ctx.storage.sql.exec('DELETE FROM pending_batches')
        if (ownerOrg)
          this.setMeta('owner_org', ownerOrg)
        this.setMeta('seeded', '1')
        this.setMeta('lease_until', String(Date.now() + leaseMs))
        this.setMeta('seeded_at', new Date().toISOString())
      })
      console.warn('app replica seeded', this.ctx.id.name, appId)
    }
    finally {
      await client.end().catch(() => undefined)
    }
  }
}
