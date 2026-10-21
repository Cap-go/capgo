import type { Context } from 'hono'
import { CacheHelper } from './cache.ts'

/**
 * Replica lag known to this isolate / data center, per database source, and
 * the edge cache rule built on it.
 *
 * Plugin edge cache entries (worker Cache API and snippet answers) are filled
 * from the local read replica. A purge re-runs up to 180s after a write; a
 * refill after that from a replica still behind would keep the pre-change
 * answer for the whole TTL. Refills from a replica measured behind are
 * therefore cached briefly only.
 *
 * Load: the rule fails open. Without a lag figure (cold isolate, probe error,
 * unreadable stats) the TTL is unchanged, so the refill rate only rises while
 * a replica is measured lagging, and only in its region. It never queries
 * the database itself: figures come from the existing background probe.
 */

export type ReplicationStatus = 'ok' | 'lagging' | 'unknown'

export interface ReplicationLagStatus {
  status: ReplicationStatus
  max_lag_seconds: number | null
}

interface ReplicationLagCacheEntry extends ReplicationLagStatus {
  expiresAt: number
}

export const REPLICATION_LAG_CACHE_TTL_SECONDS = 60
const REPLICATION_LAG_CACHE_TTL_MS = REPLICATION_LAG_CACHE_TTL_SECONDS * 1000

/**
 * Largest replica lag at which a refill keeps its full TTL. The lag figure can
 * be REPLICATION_LAG_CACHE_TTL_SECONDS old, so the replica is at most 120s
 * behind at refill time: under the last re-purge (+180s), which then evicts
 * any refill that missed the write.
 */
export const EDGE_CACHE_MAX_REPLICA_LAG_SECONDS = 60
/** TTL of an edge cache refill from a replica measured lagging. */
export const EDGE_CACHE_UNVERIFIED_REPLICA_TTL_SECONDS = 30

/**
 * Replica lag SQL. The EU replica is the logical subscriber of the primary
 * (pg_stat_subscription); the regional replicas are physical standbys of that
 * subscriber, where pg_stat_subscription is empty, so their lag is the age of
 * the last replayed transaction. A standby whose WAL receiver runs and that
 * replayed everything it received is current: no writes is not lag. Roles
 * without pg_read_all_stats see the receiver pid but a NULL status, which
 * still counts as running.
 */
export const REPLICA_LAG_QUERY = `
  SELECT CASE
    WHEN pg_is_in_recovery() THEN
      CASE
        WHEN pg_last_wal_receive_lsn() IS NOT NULL
          AND pg_last_wal_receive_lsn() = pg_last_wal_replay_lsn()
          AND EXISTS (SELECT 1 FROM pg_stat_wal_receiver WHERE pid IS NOT NULL AND (status IS NULL OR status = 'streaming'))
          THEN 0
        ELSE EXTRACT(EPOCH FROM (now() - pg_last_xact_replay_timestamp()))
      END
    ELSE (
      SELECT MAX(EXTRACT(EPOCH FROM (now() - last_msg_receipt_time)))
      FROM pg_stat_subscription
      WHERE last_msg_receipt_time IS NOT NULL
    )
  END AS lag_seconds
`

const REPLICATION_LAG_CACHE_PATH = '/cache/replication-lag'

const replicationLagMemoryCache = new Map<string, ReplicationLagCacheEntry>()

/** Data center (Cache API) copy of a source's lag figure, shared by its isolates. */
export function replicationLagCacheRequest(helper: CacheHelper, cacheKey: string) {
  return helper.buildRequest(REPLICATION_LAG_CACHE_PATH, { source: cacheKey })
}

export function getReplicationLagCacheKey(c: Context): string {
  return String(c.get('databaseSource') ?? c.res.headers.get('X-Database-Source') ?? 'unknown')
}

export function getFreshReplicationLagMemoryEntry(cacheKey: string, now = Date.now()): ReplicationLagStatus | null {
  const cached = replicationLagMemoryCache.get(cacheKey)
  if (!cached)
    return null
  if (cached.expiresAt <= now) {
    replicationLagMemoryCache.delete(cacheKey)
    return null
  }
  return {
    status: cached.status,
    max_lag_seconds: cached.max_lag_seconds,
  }
}

export function setReplicationLagMemoryEntry(cacheKey: string, status: ReplicationLagStatus, expiresAt = Date.now() + REPLICATION_LAG_CACHE_TTL_MS) {
  replicationLagMemoryCache.set(cacheKey, {
    ...status,
    expiresAt,
  })
}

/** Test helper: forget every known lag figure. */
export function resetReplicationLagMemory() {
  replicationLagMemoryCache.clear()
}

/** True for a database source that is a read replica (it can be behind the primary). */
export function isReadReplicaSource(source: string) {
  return source.startsWith('HYPERDRIVE_CAPGO_READ_') || source === 'local_read_replica'
}

function isMeasuredBehind(lag: ReplicationLagStatus | null) {
  if (!lag || lag.status === 'unknown' || lag.max_lag_seconds === null)
    return false
  return lag.status === 'lagging' || lag.max_lag_seconds > EDGE_CACHE_MAX_REPLICA_LAG_SECONDS
}

function capTtl(lag: ReplicationLagStatus | null, ttlSeconds: number) {
  return isMeasuredBehind(lag) ? Math.min(ttlSeconds, EDGE_CACHE_UNVERIFIED_REPLICA_TTL_SECONDS) : ttlSeconds
}

/**
 * TTL for an edge cache entry filled during this request, from this
 * isolate's lag figure only (synchronous: snippet fill headers). Capped to
 * EDGE_CACHE_UNVERIFIED_REPLICA_TTL_SECONDS when the replica is measured more
 * than EDGE_CACHE_MAX_REPLICA_LAG_SECONDS behind; unchanged otherwise.
 */
export function capEdgeCacheTtlForReplicaLag(c: Context, ttlSeconds: number) {
  const source = getReplicationLagCacheKey(c)
  if (!isReadReplicaSource(source))
    return ttlSeconds
  return capTtl(getFreshReplicationLagMemoryEntry(source), ttlSeconds)
}

/**
 * Same rule, falling back to the data center's lag figure when this isolate
 * has none (one Cache API read, no database query). For refills written in
 * the background.
 */
export async function edgeCacheTtlForReplicaLag(c: Context, ttlSeconds: number) {
  const source = getReplicationLagCacheKey(c)
  if (!isReadReplicaSource(source))
    return ttlSeconds
  const memory = getFreshReplicationLagMemoryEntry(source)
  if (memory)
    return capTtl(memory, ttlSeconds)
  try {
    const helper = new CacheHelper(c)
    const cached = await helper.matchJson<ReplicationLagCacheEntry>(replicationLagCacheRequest(helper, source))
    return capTtl(cached && cached.expiresAt > Date.now() ? cached : null, ttlSeconds)
  }
  catch {
    return ttlSeconds
  }
}
