import type { CleanupMessage } from '../cloudflare_workers/r2_inventory/cleanup.ts'
import { describe, expect, it, vi } from 'vitest'
import { CLEANUP_ACTIVATED, CLEANUP_CONFIG, cleanupMessageBatches, cleanupRanges, publicationDeadline } from '../cloudflare_workers/r2_inventory/cleanup.ts'
import { scheduleInventoryCleanup } from '../cloudflare_workers/r2_inventory/index.ts'

const message = (key: string): CleanupMessage => ({ schemaVersion: 1, bucket: 'synthetic', key, cleanupRequestedAt: '2026-10-14T01:02:03.123456Z' })

describe('cleanup producer boundaries', () => {
  it('is activated and refuses to schedule without a bucket or queue binding', async () => {
    expect(CLEANUP_ACTIVATED).toBe(true)
    await expect(scheduleInventoryCleanup({} as ScheduledController, {} as Parameters<typeof scheduleInventoryCleanup>[1])).rejects.toThrow('bucket or queue')
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
