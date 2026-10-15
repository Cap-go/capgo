import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkCleanupHealth, CLEANUP_HEALTH, DESTINATION_HEALTH_SQL, REPLICATION, replicationHealthy, requireCleanupHealth, SOURCE_HEALTH_SQL } from '../cloudflare_workers/r2_inventory/health.ts'

const sourceRow = () => ({ active: true, wal_status: 'reserved', state: 'streaming', feedback_age: 1, replay_seconds: null, wal_bytes: '0', publication_ok: true })
const destinationRow = () => ({ subenabled: true, subslotname: REPLICATION.slot, subpublications: [REPLICATION.publication], pid: 42, srsubstate: 'r', receipt_age: 1, observed_at: new Date().toISOString(), apply_error_count: '2', sync_error_count: '1' })
function fixture() {
  const client = (row: object) => ({
    connect: vi.fn().mockResolvedValue(undefined),
    query: vi.fn(async (text: string) => ({ rows: text.startsWith('SELECT') ? [row] : text.startsWith('INSERT') ? [{ published: true }] : [] })),
    end: vi.fn().mockResolvedValue(undefined),
  })
  const source = client(sourceRow())
  const inventory = client(destinationRow())
  const queues = Array.from({ length: 5 }, () => ({ metrics: vi.fn().mockResolvedValue({ backlogCount: 0, backlogBytes: 0 }) }))
  const run = () => checkCleanupHealth(source as never, inventory as never, 'synthetic', queues)
  return { source, inventory, queues, run }
}
afterEach(() => vi.useRealTimers())

describe('direct cleanup health', () => {
  it('starts both connections and all queue reads concurrently, then publishes the direct result', async () => {
    const f = fixture()
    let connect: () => void = () => {}
    f.source.connect.mockImplementation(() => new Promise<void>((resolve) => {
      connect = resolve
    }))
    const checking = f.run()
    await vi.waitFor(() => expect(f.inventory.query).toHaveBeenCalledWith('COMMIT'))
    expect(f.source.connect).toHaveBeenCalledOnce()
    expect(f.inventory.connect).toHaveBeenCalledOnce()
    expect(f.queues.every(queue => queue.metrics.mock.calls.length === 1)).toBe(true)
    expect(f.inventory.query.mock.calls.some(([sql]) => sql.startsWith('INSERT'))).toBe(false)
    connect()
    const result = await checking
    expect(result.healthy).toBe(true)
    requireCleanupHealth(result)
    const publish = f.inventory.query.mock.calls.find(([sql]) => sql.startsWith('INSERT')) as unknown as [string, string[]]
    expect(publish[0]).toContain('\'cleanup_health\'')
    expect(JSON.parse(publish[1][1])).toEqual(result)
    expect(f.source.query).toHaveBeenCalledWith(SOURCE_HEALTH_SQL, [REPLICATION.slot, REPLICATION.publication])
    expect(f.inventory.query).toHaveBeenCalledWith(DESTINATION_HEALTH_SQL, [REPLICATION.subscription])
    expect(f.inventory.query.mock.calls.some(([sql]) => sql.startsWith('SELECT checkpoint'))).toBe(false)
  })

  it.each([
    { active: false },
    { wal_status: 'lost' },
    { state: 'catchup' },
    { publication_ok: false },
    { feedback_age: null },
    { feedback_age: NaN },
    { feedback_age: -1 },
    { feedback_age: 61 },
    { wal_bytes: null },
    { wal_bytes: '-1' },
    { wal_bytes: 'NaN' },
    { wal_bytes: String(CLEANUP_HEALTH.walBytes + 1) },
    { replay_seconds: 31 },
    { replay_seconds: NaN },
    { replay_seconds: -1 },
  ])('rejects source state %j', (override) => {
    expect(replicationHealthy({ ...sourceRow(), ...override }, destinationRow())).toBe(false)
  })

  it.each([
    { subenabled: false },
    { subslotname: 'wrong' },
    { subpublications: ['wrong'] },
    { subpublications: [REPLICATION.publication, 'extra'] },
    { pid: null },
    { pid: 0 },
    { srsubstate: 'd' },
    { receipt_age: null },
    { receipt_age: 61 },
    { receipt_age: -1 },
  ])('rejects destination state %j', (override) => {
    expect(replicationHealthy(sourceRow(), { ...destinationRow(), ...override })).toBe(false)
  })

  it('accepts idle replication, bounded WAL feedback and recovered historical errors', () => {
    expect(replicationHealthy(sourceRow(), destinationRow())).toBe(true)
    expect(replicationHealthy({ ...sourceRow(), wal_bytes: String(CLEANUP_HEALTH.walBytes), replay_seconds: 30 }, destinationRow())).toBe(true)
    expect(replicationHealthy(undefined, destinationRow())).toBe(false)
    expect(replicationHealthy(sourceRow(), undefined)).toBe(false)
  })

  it.each([0, 1, 2, 3, 4])('publishes unhealthy queue evidence %s and returns false', async (index) => {
    const f = fixture()
    f.queues[index].metrics.mockResolvedValue({ backlogCount: index === 4 ? 10_000 : 1, backlogBytes: 10 })
    const result = await f.run()
    expect(result.healthy).toBe(index === 4)
    expect(result.producerReady).toBe(false)
    expect(result.reasons.length).toBeGreaterThan(0)
    expect(f.inventory.query.mock.calls.some(([sql]) => sql.startsWith('INSERT'))).toBe(true)
  })

  it('fails closed for permission failures and writes negative evidence when inventory is available', async () => {
    const f = fixture()
    f.source.query.mockRejectedValue(new Error('permission denied'))
    const result = await f.run()
    expect(result.healthy).toBe(false)
    expect(result.manifestReplicationHealthy).toBe(false)
    expect(f.inventory.query.mock.calls.some(([sql]) => sql.startsWith('INSERT'))).toBe(true)
  })

  it('does not authorize the producer if publication fails', async () => {
    const f = fixture()
    const normal = f.inventory.query.getMockImplementation()!
    f.inventory.query.mockImplementation(async text => text.startsWith('INSERT') ? Promise.reject(new Error('write failed')) : normal(text))
    const result = await f.run()
    expect(result.healthy).toBe(false)
    expect(result.reasons).toContain('health_query_or_write_failed')
    expect(f.source.end).toHaveBeenCalled()
    expect(f.inventory.end).toHaveBeenCalled()
  })

  it('does not overwrite a newer observation or authorize unpublished evidence', async () => {
    const f = fixture()
    const normal = f.inventory.query.getMockImplementation()!
    f.inventory.query.mockImplementation(async text => text.startsWith('INSERT') ? { rows: [] } : normal(text))
    const result = await f.run()
    expect(result.healthy).toBe(false)
    expect(result.reasons).toContain('health_query_or_write_failed')
  })

  it.each(['connection', 'query', 'write', 'queue'])('bounds the entire %s operation to five seconds and prevents late continuation', async (phase) => {
    vi.useFakeTimers()
    const f = fixture()
    let finish: (value: any) => void = () => {}
    const stalled = new Promise<any>((resolve) => {
      finish = resolve
    })
    if (phase === 'connection')
      f.source.connect.mockImplementation(() => stalled)
    if (phase === 'query')
      f.source.query.mockImplementation(() => stalled)
    if (phase === 'queue')
      f.queues[0].metrics.mockImplementation(() => stalled)
    if (phase === 'write') {
      const normal = f.inventory.query.getMockImplementation()!
      f.inventory.query.mockImplementation(text => text.startsWith('INSERT') ? stalled : normal(text))
    }
    const checking = f.run()
    await vi.advanceTimersByTimeAsync(4999)
    const settled = vi.fn()
    void checking.then(settled)
    expect(settled).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    const result = await checking
    expect(result.healthy).toBe(false)
    expect(result.reasons).toContain('health_timeout')
    expect(f.source.end).toHaveBeenCalled()
    expect(f.inventory.end).toHaveBeenCalled()
    const calls = f.inventory.query.mock.calls.length
    finish({ rows: [sourceRow()] })
    await vi.advanceTimersByTimeAsync(0)
    expect(f.inventory.query.mock.calls).toHaveLength(calls)
    expect(result.healthy).toBe(false)
  })

  it('rejects an expired in-memory result without reading a database row', async () => {
    const f = fixture()
    const result = await f.run()
    expect(() => requireCleanupHealth({ ...result, checkedAt: Date.now() - 30_001 })).toThrow('expired')
    expect(() => requireCleanupHealth({ ...result, healthy: false })).toThrow('failed')
    expect(() => requireCleanupHealth({ ...result, checkedAt: Date.now() + 1000 })).toThrow('failed')
  })
})
