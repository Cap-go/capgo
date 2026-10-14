import type { CleanupMessage } from '../cloudflare_workers/r2_inventory/cleanup.ts'
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { CLEANUP_ACTIVATED, CLEANUP_CONFIG, cleanupMessageBatches, cleanupRanges, publicationDeadline, requireCleanupHealth } from '../cloudflare_workers/r2_inventory/cleanup.ts'
import { scheduleInventoryCleanup } from '../cloudflare_workers/r2_inventory/index.ts'

const message = (key: string): CleanupMessage => ({ schemaVersion: 1, bucket: 'synthetic', key, cleanupRequestedAt: '2026-10-14T01:02:03.123456Z' })
const healthy = { schemaVersion: 1, observedAt: '2026-10-14T01:02:03.123456Z', notificationsHealthy: true, repairsHealthy: true, manifestReplicationHealthy: true, deletionConsumerHealthy: true, deletionBacklog: 0 }

describe('cleanup producer boundaries', () => {
  it('deploys a production-only minute cron that cannot open a database or publish before activation', async () => {
    expect(CLEANUP_ACTIVATED).toBe(false)
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      await scheduleInventoryCleanup({} as ScheduledController, {} as Parameters<typeof scheduleInventoryCleanup>[1])
      expect(log).toHaveBeenCalledWith(expect.stringContaining('r2_cleanup_disabled'))
    }
    finally { log.mockRestore() }
    const config = JSON.parse(readFileSync(new URL('../cloudflare_workers/r2_inventory/wrangler.jsonc', import.meta.url), 'utf8'))
    expect(Object.keys(config.env)).toEqual(['prod'])
    expect(config.env.prod.triggers.crons).toEqual(['* * * * *'])
    expect(config.triggers).toBeUndefined()
    expect(config.env.prod.queues.producers.some((p: { binding: string }) => p.binding === 'CLEANUP_QUEUE')).toBe(false)
  })

  it('splits by count and encoded bytes including escaped/multibyte keys, preserving exact retirement identity', () => {
    const input = Array.from({ length: 240 }, (_, i) => message(`${i}${'\u0001'.repeat(1024)}🙂`))
    const batches = cleanupMessageBatches(input)
    expect(batches.length).toBeGreaterThan(3)
    for (const batch of batches) {
      expect(batch.length).toBeLessThanOrEqual(100)
      expect(new TextEncoder().encode(JSON.stringify(batch)).length).toBeLessThanOrEqual(CLEANUP_CONFIG.batchBytes)
    }
    expect(batches.flat().map(item => item.body)).toEqual(input)
    expect(cleanupMessageBatches(Array.from({ length: 101 }, (_, i) => message(String(i)))).map(batch => batch.length)).toEqual([100, 1])
    expect(() => cleanupMessageBatches([message('x'.repeat(128_000))])).toThrow('byte limit')
    expect(cleanupMessageBatches([])).toEqual([])
  })

  it('records the last examined key including ineligible gaps and zero-candidate pages', () => {
    const rows = Array.from({ length: 305 }, (_, i) => ({ r2_key: String(i).padStart(4, '0'), eligible: i < 100 || i >= 202 }))
    const ranges = cleanupRanges(rows)
    expect(ranges.map(range => range.keys.length)).toEqual([100, 100, 3])
    expect(ranges.map(range => range.cursor)).toEqual(['0201', '0301', '0304'])
    expect(cleanupRanges([{ r2_key: 'examined', eligible: false }])).toEqual([{ keys: [], cursor: 'examined' }])
    expect(cleanupRanges([])).toEqual([])
  })

  it.each([
    {},
    { schemaVersion: 2 },
    { notificationsHealthy: false },
    { repairsHealthy: false },
    { manifestReplicationHealthy: false },
    { deletionConsumerHealthy: false },
    { deletionBacklog: 10_001 },
    { deletionBacklog: -1 },
    { deletionBacklog: '0' },
    { deletionBacklog: 0.5 },
  ])('fails closed for incomplete or unhealthy evidence %j', async (override) => {
    const checkpoint = Object.keys(override).length ? { ...healthy, ...override } : {}
    const db = { query: vi.fn().mockResolvedValue({ rows: [{ checkpoint, age: 1 }] }) }
    await expect(requireCleanupHealth(db as never, 'synthetic')).rejects.toThrow('health evidence')
  })

  it.each([NaN, -1, 121, null])('rejects missing/future/stale evidence age %s', async (age) => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [{ checkpoint: healthy, age }] }) }
    await expect(requireCleanupHealth(db as never, 'synthetic')).rejects.toThrow('health evidence')
  })

  it('accepts fresh attested health with no traffic; missing evidence never becomes healthy', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [{ checkpoint: healthy, age: 0 }] }) }
    await requireCleanupHealth(db as never, 'synthetic')
    db.query.mockResolvedValue({ rows: [] })
    await expect(requireCleanupHealth(db as never, 'synthetic')).rejects.toThrow('health evidence')
  })

  it('bounds ambiguous publication without assuming it can cancel a late accepted message', async () => {
    vi.useFakeTimers()
    try {
      let accept: () => void = () => {}
      const pending = new Promise<void>((resolve) => {
        accept = resolve
      })
      const publishing = publicationDeadline(() => pending, 2000)
      const assertion = expect(publishing).rejects.toThrow('acceptance is ambiguous')
      await vi.advanceTimersByTimeAsync(2000)
      await assertion
      accept()
      await pending
      expect(vi.getTimerCount()).toBe(0)
    }
    finally { vi.useRealTimers() }
  })
})
