import type { Context } from 'hono'

/**
 * Replica lag known to this isolate, per database source, and the edge cache
 * rule built on it.
 *
 * Plugin edge cache entries (worker Cache API and snippet answers) are filled
 * from the local read replica. A purge re-runs up to 180s after a write; a
 * refill after that from a replica still behind would keep the pre-change
 * answer for the whole TTL. Refills from a replica not known to be fresh are
 * therefore cached briefly only.
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
/** TTL of an edge cache refill from a replica that is lagging or of unknown lag. */
export const EDGE_CACHE_UNVERIFIED_REPLICA_TTL_SECONDS = 30

/**
 * Replica lag SQL. The EU replica is the logical subscriber of the primary
 * (pg_stat_subscription); the regional replicas are physical standbys of that
 * subscriber, where pg_stat_subscription is empty, so their lag is the age of
 * the last replayed transaction. A standby that replayed everything it
 * received while still streaming is current (no writes is not lag); without
 * pg_stat_wal_receiver access it falls back to the replay age.
 */
export const REPLICA_LAG_QUERY = `
  SELECT CASE
    WHEN pg_is_in_recovery() THEN
      CASE
        WHEN pg_last_wal_receive_lsn() IS NOT NULL
          AND pg_last_wal_receive_lsn() = pg_last_wal_replay_lsn()
          AND EXISTS (SELECT 1 FROM pg_stat_wal_receiver WHERE status = 'streaming')
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

const replicationLagMemoryCache = new Map<string, ReplicationLagCacheEntry>()

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

/**
 * TTL for an edge cache entry filled during this request: unchanged when the
 * reads came from the primary or from a replica measured fresh, capped to
 * EDGE_CACHE_UNVERIFIED_REPLICA_TTL_SECONDS otherwise (lagging, or no recent
 * lag figure in this isolate).
 */
export function capEdgeCacheTtlForReplicaLag(c: Context, ttlSeconds: number) {
  const source = getReplicationLagCacheKey(c)
  if (!isReadReplicaSource(source))
    return ttlSeconds
  const lag = getFreshReplicationLagMemoryEntry(source)
  const fresh = lag?.status === 'ok'
    && lag.max_lag_seconds !== null
    && lag.max_lag_seconds <= EDGE_CACHE_MAX_REPLICA_LAG_SECONDS
  return fresh ? ttlSeconds : Math.min(ttlSeconds, EDGE_CACHE_UNVERIFIED_REPLICA_TTL_SECONDS)
}
