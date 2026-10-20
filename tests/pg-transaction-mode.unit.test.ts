import type { Client, Pool } from 'pg'
import { describe, expect, it, vi } from 'vitest'
import { closePrimaryReadClient, readOnlyStartupOptions, restrictPrimaryReadClient } from '../supabase/functions/_backend/plugin_runtime/utils/pg_transaction_mode.ts'

describe('primary read transaction lifecycle', () => {
  it.each(['HYPERDRIVE_CAPGO_DIRECT_EU', 'sb_pooler_main', 'direct', 'unknown'])('never sends a read-only startup default to shared %s connections', (source) => {
    expect(readOnlyStartupOptions(source, true)).toBeUndefined()
  })

  it('preserves dedicated replica startup protection without extra transaction work', async () => {
    const pool = { connect: vi.fn() } as unknown as Pool
    expect(await restrictPrimaryReadClient(pool, 'HYPERDRIVE_CAPGO_READ_EU', true, false)).toBe(pool)
    expect(pool.connect).not.toHaveBeenCalled()
    expect(readOnlyStartupOptions('HYPERDRIVE_CAPGO_READ_EU', true)).toBe('-c default_transaction_read_only=on')
    expect(readOnlyStartupOptions('HYPERDRIVE_CAPGO_READ_EU', false)).toBeUndefined()
  })

  it('ends the owner pool when checkout fails', async () => {
    const error = new Error('checkout failed')
    const pool = { connect: vi.fn().mockRejectedValue(error), end: vi.fn() } as unknown as Pool
    await expect(restrictPrimaryReadClient(pool, 'sb_pooler_main', true, false)).rejects.toBe(error)
    expect(pool.end).toHaveBeenCalledOnce()
  })

  it('releases a failed BEGIN and ends the owner pool', async () => {
    const error = new Error('begin failed')
    const client = { query: vi.fn().mockRejectedValue(error), release: vi.fn() }
    const pool = { connect: vi.fn().mockResolvedValue(client), end: vi.fn() } as unknown as Pool
    await expect(restrictPrimaryReadClient(pool, 'sb_pooler_main', true, false)).rejects.toBe(error)
    expect(client.release).toHaveBeenCalledWith(true)
    expect(pool.end).toHaveBeenCalledOnce()
  })

  it('releases the pinned connection even if rollback fails, without duplicate cleanup', async () => {
    const error = new Error('rollback failed')
    const rawQuery = vi.fn().mockResolvedValueOnce({}).mockRejectedValue(error)
    const client = { query: rawQuery, release: vi.fn() }
    const pool = { connect: vi.fn().mockResolvedValue(client), end: vi.fn() } as unknown as Pool
    const reader = await restrictPrimaryReadClient(pool, 'sb_pooler_main', true, false)
    const closing = closePrimaryReadClient(reader)
    expect(closePrimaryReadClient(reader)).toBe(closing)
    await expect(closing).rejects.toBe(error)
    expect(client.release).toHaveBeenCalledOnce()
    expect(pool.end).toHaveBeenCalledOnce()
    expect(rawQuery).toHaveBeenCalledTimes(2)
  })

  it('rolls back a Hyperdrive read without ending its connection', async () => {
    const rawQuery = vi.fn().mockResolvedValue({})
    const client = { query: rawQuery, end: vi.fn() } as unknown as Client
    const reader = await restrictPrimaryReadClient(client, 'HYPERDRIVE_CAPGO_DIRECT_EU', true, true)
    await closePrimaryReadClient(reader)
    expect(rawQuery).toHaveBeenLastCalledWith('ROLLBACK')
    expect(client.end).not.toHaveBeenCalled()
  })

  it('rejects reads after cleanup instead of using an unprotected connection', async () => {
    const rawQuery = vi.fn().mockResolvedValue({})
    const client = { query: rawQuery, end: vi.fn() } as unknown as Client
    const reader = await restrictPrimaryReadClient(client, 'HYPERDRIVE_CAPGO_DIRECT_EU', true, true)
    await closePrimaryReadClient(reader)
    await expect(reader.query('SELECT 1')).rejects.toThrow('closed')
    expect(rawQuery).toHaveBeenCalledTimes(2)
  })

  it('fails closed when recovery fails and never replays the failed read', async () => {
    const readError = new Error('read failed')
    const recoveryError = new Error('connection lost')
    const rawQuery = vi.fn().mockResolvedValueOnce({}).mockRejectedValueOnce(readError).mockRejectedValueOnce(recoveryError).mockResolvedValue({})
    const client = { query: rawQuery, release: vi.fn() }
    const pool = { connect: vi.fn().mockResolvedValue(client), end: vi.fn() } as unknown as Pool
    const reader = await restrictPrimaryReadClient(pool, 'sb_pooler_main', true, false)
    try {
      await expect(reader.query('SELECT 1')).rejects.toBe(readError)
      await expect(reader.query('SELECT 2')).rejects.toMatchObject({ cause: recoveryError })
      expect(rawQuery.mock.calls.map(([text]) => text)).toEqual(['BEGIN READ ONLY', 'SELECT 1', 'ROLLBACK'])
    }
    finally {
      await closePrimaryReadClient(reader)
    }
  })
})
