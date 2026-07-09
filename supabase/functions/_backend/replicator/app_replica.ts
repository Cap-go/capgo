// Per-app, per-region embedded read replica (Durable Object + SQLite).
//
// One instance exists per `${region}:${app_id}` that actually receives
// traffic. It holds the app's slice of the replicated tables (channels,
// versions, manifest, device overrides) plus its owning org's rows, seeds
// itself lazily from Postgres on first read in a region, registers with the
// ReplicaRouter, and then receives ordered pushes from the outbox journal.
//
// Seed protocol (safe against every known race):
// 1. unregister from the router — no pushes can arrive under a stale cursor
// 2. clear the pending-push buffer (leftovers from a previous attempt)
// 3. if the seed source is an async replica, wait until it has replayed
//    past the outbox source's current WAL position (or fall back to
//    snapshotting from the outbox source) so the snapshot can never miss
//    rows the outbox already skipped
// 4. register (router cursor = journal head) — pushes from here on are
//    buffered by applyBatch while the snapshot runs
// 5. wipe + keyset-paginated snapshot
// 6. replay the buffered pushes (idempotent upserts) and mark seeded
//
// Freshness is a lease: the router only extends it when it is fully caught
// up with the outbox. Reads past the lease answer `unavailable` and
// /updates_v2 turns that into a plain "no update" — never stale data, never
// Postgres.

import type { EdgeApplyBatch, EdgeApplyResult, EdgeInfosArgs, EdgeQueryResult, EdgeReplicaRow, PlanLimitAction } from '../utils/edge_replica_schema.ts'
import type { ReplicatorEnv } from './replicator.ts'
import { DurableObject } from 'cloudflare:workers'
// @ts-types="npm:@types/pg"
import { Client } from 'pg'
import { cloudlog, cloudlogErr, serializeError } from '../utils/logging.ts'
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

type SqliteParams = (string | number | null)[]

const SEED_PAGE_SIZE = 5000
const IDLE_EVICT_MS = 7 * 24 * 3600 * 1000
const SEED_CATCHUP_TRIES = 20
const SEED_FAILURE_BACKOFF_MS = 60_000
const SEED_CATCHUP_WAIT_MS = 500

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

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
    return this.ctx.storage.sql.exec(sql, ...params as SqliteParams).toArray() as EdgeReplicaRow[]
  }

  private unavailable(appId: string): EdgeQueryResult {
    // Kick the seed in the background; the caller answers "no update" for
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
      // Registered but not seeded and no seed running (e.g. the DO restarted
      // mid-seed or the seed failed): acking would let the router advance
      // its cursor past rows we never stored. Drop the registration instead;
      // the next read reseeds and re-registers from the journal head.
      return { unregister: true }
    }
    let movedToOrgApp: string | null = null
    this.ctx.storage.transactionSync(() => {
      movedToOrgApp = this.applyEntries(batch.entries)
      if (batch.extendLease)
        this.setMeta('lease_until', String(Date.now() + batch.leaseMs))
    })
    if (movedToOrgApp) {
      // The app changed org: the journal window we were pushed was filtered
      // by the old owner_org and the new org's rows may never appear in the
      // journal at all. A reseed (snapshot + re-register with the new org)
      // is the only consistent way forward; reads answer "no update" until
      // it lands. Org moves are rare, seeds are small.
      this.ctx.storage.sql.exec(`DELETE FROM replica_meta WHERE key IN ('seeded', 'lease_until')`)
      this.scheduleSeed(movedToOrgApp)
      return { unregister: true }
    }
    return { ok: true }
  }

  async invalidate(): Promise<EdgeApplyResult> {
    await this.wipe()
    return { ok: true }
  }

  // ------------------------------------------------------------------

  // Applies entries and returns the app_id when an apps row moved to a new
  // org (the caller must trigger a reseed), null otherwise.
  private applyEntries(entries: EdgeApplyBatch['entries']): string | null {
    let movedToOrgApp: string | null = null
    for (const entry of entries) {
      if (!EDGE_REPLICA_TABLES[entry.table])
        continue
      if (entry.op === 'DELETE') {
        this.ctx.storage.sql.exec(buildDeleteStatement(entry.table), ...pgJsonRowToPkValues(entry.table, entry.row) as SqliteParams)
        continue
      }
      this.ctx.storage.sql.exec(buildUpsertStatement(entry.table), ...pgJsonRowToSqliteValues(entry.table, entry.row) as SqliteParams)
      const ownerOrg = typeof entry.row.owner_org === 'string' ? entry.row.owner_org : null
      const storedOrg = this.getMeta('owner_org')
      if (entry.table === 'apps' && ownerOrg && storedOrg && ownerOrg !== storedOrg && typeof entry.row.app_id === 'string')
        movedToOrgApp = entry.row.app_id
    }
    return movedToOrgApp
  }

  private routerStub() {
    return this.env.REPLICA_ROUTER.get(this.env.REPLICA_ROUTER.idFromName('main')) as any
  }

  private async wipe() {
    this.ctx.storage.transactionSync(() => {
      for (const table of Object.keys(EDGE_REPLICA_TABLES))
        this.ctx.storage.sql.exec(`DELETE FROM "${table}"`)
      this.ctx.storage.sql.exec('DELETE FROM pending_batches')
      this.ctx.storage.sql.exec(`DELETE FROM replica_meta WHERE key IN ('seeded', 'lease_until', 'owner_org')`)
    })
    const name = this.ctx.id.name
    if (name)
      await this.routerStub().unregister(name).catch(() => undefined)
  }

  private scheduleSeed(appId: string) {
    if (this.seedingPromise)
      return
    // Backoff after a failed seed: reads keep answering "no update" without
    // driving back-to-back Postgres connection attempts.
    if (Date.now() < Number(this.getMeta('seed_backoff_until') ?? 0))
      return
    this.seedingPromise = this.seed(appId)
      .catch(async (e: unknown) => {
        cloudlogErr({ message: 'app replica seed failed', replica: this.ctx.id.name, error: serializeError(e) })
        this.setMeta('seed_backoff_until', String(Date.now() + SEED_FAILURE_BACKOFF_MS))
        // Stay unregistered on failure so the router never acks rows into
        // the void; the next read past the backoff retries from scratch.
        const name = this.ctx.id.name
        if (name)
          await this.routerStub().unregister(name).catch(() => undefined)
      })
      .finally(() => {
        this.seedingPromise = null
      })
    this.ctx.waitUntil(this.seedingPromise)
  }

  private connectPg(url: string, purpose: string): Promise<Client> {
    const client = new Client({
      connectionString: url,
      application_name: `capgo_app_replica_${purpose}`,
      connectionTimeoutMillis: 10_000,
    })
    return client.connect().then(() => client)
  }

  private outboxSourceUrl(): string | null {
    return this.env.HYPERDRIVE_OUTBOX?.connectionString ?? this.env.OUTBOX_DB_URL ?? null
  }

  private seedSourceUrl(): string {
    const url = this.env.HYPERDRIVE_SEED?.connectionString ?? this.env.SEED_DB_URL ?? this.outboxSourceUrl()
    if (!url)
      throw new Error('app replica: no Postgres seed source configured')
    return url
  }

  // The outbox only captures writes made after its triggers were installed
  // and after this replica registered. If the snapshot is read from an async
  // replica that lags the outbox source, rows committed just before
  // registration could be missing from BOTH the snapshot and the pushes.
  // Guard: wait until the seed replica's subscription has replayed past the
  // outbox source's current WAL position; if it does not catch up in time,
  // snapshot from the outbox source instead.
  private async openSeedClient(): Promise<Client> {
    const seedUrl = this.seedSourceUrl()
    const outboxUrl = this.outboxSourceUrl()
    if (!outboxUrl || seedUrl === outboxUrl)
      return this.connectPg(seedUrl, 'seed')

    const outboxClient = await this.connectPg(outboxUrl, 'seed_watermark')
    let seedClient: Client | null = null
    try {
      const watermark = (await outboxClient.query('SELECT pg_current_wal_lsn()::text AS lsn')).rows.at(0)?.lsn as string | undefined
      if (!watermark) {
        // Cannot establish a watermark: the outbox source is authoritative.
        return outboxClient
      }
      seedClient = await this.connectPg(seedUrl, 'seed')
      for (let attempt = 0; attempt < SEED_CATCHUP_TRIES; attempt++) {
        // No subscription rows means the seed source is not an async
        // subscriber (e.g. the pooler in front of main): trivially caught up.
        const pending = (await seedClient.query(
          'SELECT count(*)::int AS pending FROM pg_stat_subscription WHERE latest_end_lsn IS NULL OR latest_end_lsn < $1::pg_lsn',
          [watermark],
        )).rows.at(0)?.pending as number
        if (pending === 0) {
          await outboxClient.end().catch(() => undefined)
          return seedClient
        }
        await sleep(SEED_CATCHUP_WAIT_MS)
      }
      cloudlog({ message: 'app replica seed source lagging, snapshotting from outbox source', replica: this.ctx.id.name })
      await seedClient.end().catch(() => undefined)
      return outboxClient
    }
    catch (e) {
      await seedClient?.end().catch(() => undefined)
      await outboxClient.end().catch(() => undefined)
      throw e
    }
  }

  private async snapshotTable(client: Client, spec: ReturnType<typeof buildAppSeedQueries>[number], bind: string) {
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
            this.ctx.storage.sql.exec(buildUpsertStatement(spec.table), ...pgJsonRowToSqliteValues(spec.table, row.r) as SqliteParams)
        })
        cursor = rows.at(-1)!.k1
      }
      if (rows.length < SEED_PAGE_SIZE)
        return
    }
  }

  private async seed(appId: string) {
    // An org move detected while replaying the seed-window pushes means the
    // snapshot was taken against the old org: redo the seed once with the
    // fresh owner. A second consecutive move fails the seed (backoff+retry).
    for (let attempt = 0; attempt < 2; attempt++) {
      if (!(await this.seedOnce(appId)))
        return
    }
    throw new Error('app replica seed: org moved during two consecutive seeds')
  }

  // Returns true when the seed must be re-run because the app moved org
  // while the snapshot was being taken.
  private async seedOnce(appId: string): Promise<boolean> {
    const name = this.ctx.id.name ?? appId
    const router = this.routerStub()

    // Step 1-2: no pushes can arrive while unregistered, so the buffer we
    // clear here can only contain leftovers from a previous failed attempt.
    await router.unregister(name)
    this.ctx.storage.sql.exec('DELETE FROM pending_batches')

    const client = await this.openSeedClient()
    try {
      const appResult = await client.query('SELECT owner_org::text AS owner_org FROM public.apps WHERE app_id = $1', [appId])
      const ownerOrg: string | null = appResult.rows.at(0)?.owner_org ?? null

      // Step 4: register, then snapshot. Every change committed after this
      // point is pushed and buffered by applyBatch while the snapshot runs.
      const { leaseMs } = await router.register({ name, appId, ownerOrg }) as { leaseMs: number }
      this.ctx.storage.transactionSync(() => {
        for (const table of Object.keys(EDGE_REPLICA_TABLES))
          this.ctx.storage.sql.exec(`DELETE FROM "${table}"`)
      })

      for (const spec of buildAppSeedQueries()) {
        const bind = spec.binds === 'app' ? appId : ownerOrg
        if (bind !== null)
          await this.snapshotTable(client, spec, bind)
      }

      // Step 6: replay pushes buffered during the snapshot; upserts are
      // idempotent so replay over the snapshot converges. owner_org is set
      // first so a mid-seed org move is detected by the replay itself.
      let movedDuringReplay = false
      this.ctx.storage.transactionSync(() => {
        if (ownerOrg)
          this.setMeta('owner_org', ownerOrg)
        const pending = this.ctx.storage.sql
          .exec('SELECT seq, payload FROM pending_batches ORDER BY seq')
          .toArray() as { seq: number, payload: string }[]
        for (const batch of pending) {
          if (this.applyEntries(JSON.parse(batch.payload)))
            movedDuringReplay = true
        }
        this.ctx.storage.sql.exec('DELETE FROM pending_batches')
        if (!movedDuringReplay) {
          this.setMeta('seeded', '1')
          this.setMeta('lease_until', String(Date.now() + leaseMs))
          this.setMeta('seeded_at', new Date().toISOString())
        }
      })
      if (movedDuringReplay)
        return true
      cloudlog({ message: 'app replica seeded', replica: name, appId })
      return false
    }
    finally {
      await client.end().catch(() => undefined)
    }
  }
}
