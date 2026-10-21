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

  it('keeps the full TTL only for a replica measured within the edge cache bound', () => {
    const c = contextFrom('HYPERDRIVE_CAPGO_READ_HK')
    expect(capEdgeCacheTtlForReplicaLag(c, 3600)).toBe(30)
    setReplicationLagMemoryEntry('HYPERDRIVE_CAPGO_READ_HK', { status: 'unknown', max_lag_seconds: null })
    expect(capEdgeCacheTtlForReplicaLag(c, 3600)).toBe(30)
    setReplicationLagMemoryEntry('HYPERDRIVE_CAPGO_READ_HK', { status: 'ok', max_lag_seconds: 61 })
    expect(capEdgeCacheTtlForReplicaLag(c, 3600)).toBe(30)
    setReplicationLagMemoryEntry('HYPERDRIVE_CAPGO_READ_HK', { status: 'ok', max_lag_seconds: 60 })
    expect(capEdgeCacheTtlForReplicaLag(c, 3600)).toBe(3600)
    // Never raises a shorter TTL.
    expect(capEdgeCacheTtlForReplicaLag(c, 10)).toBe(10)
    setReplicationLagMemoryEntry('HYPERDRIVE_CAPGO_READ_HK', { status: 'ok', max_lag_seconds: 0 }, Date.now() - 1)
    expect(capEdgeCacheTtlForReplicaLag(c, 3600)).toBe(30)
  })

  it('measures physical standbys, not only the logical subscriber', () => {
    expect(REPLICA_LAG_QUERY).toContain('pg_is_in_recovery()')
    expect(REPLICA_LAG_QUERY).toContain('pg_last_xact_replay_timestamp()')
    expect(REPLICA_LAG_QUERY).toContain('pg_stat_subscription')
  })
})
