import { afterEach, describe, expect, it } from 'vitest'
import { capEdgeCacheTtlForReplicaLag, isReadReplicaSource, REPLICA_LAG_QUERY, resetReplicationLagMemory, setReplicationLagMemoryEntry } from '../supabase/functions/_backend/plugin_runtime/utils/replicaFreshness.ts'

function contextFrom(source: string | undefined) {
  return {
    get: (key: string) => key === 'databaseSource' ? source : undefined,
    res: { headers: new Headers() },
  } as any
}

describe('replica freshness', () => {
  afterEach(() => {
    resetReplicationLagMemory()
  })

  it('tells read replicas from primary sources', () => {
    expect(isReadReplicaSource('HYPERDRIVE_CAPGO_READ_OC')).toBe(true)
    expect(isReadReplicaSource('HYPERDRIVE_CAPGO_READ_EU')).toBe(true)
    expect(isReadReplicaSource('local_read_replica')).toBe(true)
    expect(isReadReplicaSource('HYPERDRIVE_CAPGO_DIRECT_EU')).toBe(false)
    expect(isReadReplicaSource('sb_pooler_main')).toBe(false)
    expect(isReadReplicaSource('unknown')).toBe(false)
  })

  it('keeps the full TTL for primary reads', () => {
    expect(capEdgeCacheTtlForReplicaLag(contextFrom('HYPERDRIVE_CAPGO_DIRECT_EU'), 3600)).toBe(3600)
    expect(capEdgeCacheTtlForReplicaLag(contextFrom(undefined), 3600)).toBe(3600)
  })

  it('shortens the TTL only for a replica measured behind (fails open)', () => {
    const c = contextFrom('HYPERDRIVE_CAPGO_READ_HK')
    // No figure, unknown, or within the bound: unchanged TTL, no extra load.
    expect(capEdgeCacheTtlForReplicaLag(c, 3600)).toBe(3600)
    setReplicationLagMemoryEntry('HYPERDRIVE_CAPGO_READ_HK', { status: 'unknown', max_lag_seconds: null })
    expect(capEdgeCacheTtlForReplicaLag(c, 3600)).toBe(3600)
    setReplicationLagMemoryEntry('HYPERDRIVE_CAPGO_READ_HK', { status: 'ok', max_lag_seconds: 60 })
    expect(capEdgeCacheTtlForReplicaLag(c, 3600)).toBe(3600)
    // Measured behind.
    setReplicationLagMemoryEntry('HYPERDRIVE_CAPGO_READ_HK', { status: 'ok', max_lag_seconds: 61 })
    expect(capEdgeCacheTtlForReplicaLag(c, 3600)).toBe(30)
    setReplicationLagMemoryEntry('HYPERDRIVE_CAPGO_READ_HK', { status: 'lagging', max_lag_seconds: 2400 })
    expect(capEdgeCacheTtlForReplicaLag(c, 3600)).toBe(30)
    // Never raises a shorter TTL.
    expect(capEdgeCacheTtlForReplicaLag(c, 10)).toBe(10)
    // An expired figure no longer counts.
    setReplicationLagMemoryEntry('HYPERDRIVE_CAPGO_READ_HK', { status: 'lagging', max_lag_seconds: 2400 }, Date.now() - 1)
    expect(capEdgeCacheTtlForReplicaLag(c, 3600)).toBe(3600)
  })

  it('measures physical standbys, not only the logical subscriber', () => {
    expect(REPLICA_LAG_QUERY).toContain('pg_is_in_recovery()')
    expect(REPLICA_LAG_QUERY).toContain('pg_last_xact_replay_timestamp()')
    expect(REPLICA_LAG_QUERY).toContain('pg_stat_subscription')
    // Readable without pg_read_all_stats (status is NULL then).
    expect(REPLICA_LAG_QUERY).toContain('status IS NULL')
  })
})
