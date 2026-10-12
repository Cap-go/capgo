import { describe, expect, it, vi } from 'vitest'
import { isRecoveryConflictError, retryOnRecoveryConflict } from '../supabase/functions/_backend/plugin_runtime/utils/pg.ts'

function recoveryConflict() {
  return Object.assign(new Error('Failed query: select "file_name", "file_hash", "s3_path" from "manifest"'), {
    name: 'DrizzleQueryError',
    cause: Object.assign(new Error('canceling statement due to conflict with recovery'), { code: '40001' }),
  })
}

const c = { get: () => 'request-id' } as any

describe('replica recovery conflict retry', () => {
  it.concurrent('detects the conflict through the drizzle cause chain', () => {
    expect(isRecoveryConflictError(recoveryConflict())).toBe(true)
    expect(isRecoveryConflictError(Object.assign(new Error('could not serialize access'), { code: '40001' }))).toBe(false)
    expect(isRecoveryConflictError(new Error('boom'))).toBe(false)
  })

  it.concurrent('retries once after a recovery conflict', async () => {
    const run = vi.fn()
      .mockRejectedValueOnce(recoveryConflict())
      .mockResolvedValueOnce(['row'])

    await expect(retryOnRecoveryConflict(c, 'manifest_entries', run)).resolves.toEqual(['row'])
    expect(run).toHaveBeenCalledTimes(2)
  })

  it.concurrent('does not retry other errors', async () => {
    const run = vi.fn().mockRejectedValue(new Error('boom'))

    await expect(retryOnRecoveryConflict(c, 'manifest_entries', run)).rejects.toThrow('boom')
    expect(run).toHaveBeenCalledTimes(1)
  })
})
