import type { Bindings } from '../supabase/functions/_backend/utils/cloudflare.ts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { inventoryIngestionHealthy, runScheduledManifestPlaceholderExpiry } from '../supabase/functions/_backend/utils/manifest_placeholder_expiry.ts'

const mocks = vi.hoisted(() => ({ clients: vi.fn(), connect: vi.fn(), query: vi.fn(), end: vi.fn() }))
vi.mock('pg', async importOriginal => ({ ...await importOriginal<object>(), Client: class {
  constructor(options: unknown) {
    mocks.clients(options)
  }

  connect = mocks.connect; query = mocks.query; end = mocks.end
} }))
vi.mock('../supabase/functions/_backend/utils/r2_inventory.ts', async importOriginal => ({ ...await importOriginal<object>(), inventoryTransaction: async (_db: unknown, run: () => Promise<unknown>) => run() }))
const health = (backlog = 0) => ({ metrics: vi.fn().mockResolvedValue({ backlogCount: backlog, backlogBytes: backlog }) })
function env(backlog = 0): Bindings {
  return { ENV_NAME: 'capgo_api-prod', HYPERDRIVE_R2_INVENTORY: { connectionString: 'isolated-inventory' }, INVENTORY_EVENT_QUEUE: health(backlog), INVENTORY_REPAIR_QUEUE: health(), INVENTORY_EVENT_DLQ: health(), INVENTORY_REPAIR_DLQ: health() } as unknown as Bindings
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.query.mockResolvedValue({ rows: [{ removed: 1000 }] })
})

describe('production scheduled placeholder expiry', () => {
  afterEach(() => vi.restoreAllMocks())
  it.each(['capgo_api-alpha', 'capgo_api-preprod', 'capgo_api-local'])('does no work in %s', async (name) => {
    await runScheduledManifestPlaceholderExpiry({ ...env(), ENV_NAME: name })
    expect(mocks.clients).not.toHaveBeenCalled()
  })
  it('uses fresh health across all four queues and skips busy or unavailable health', async () => {
    const healthy = env()
    expect(await inventoryIngestionHealthy(healthy)).toBe(true)
    expect(await inventoryIngestionHealthy({ ...healthy, INVENTORY_REPAIR_DLQ: health(1) as unknown as Queue })).toBe(false)
    expect(await inventoryIngestionHealthy({ ...healthy, INVENTORY_EVENT_QUEUE: {} as Queue })).toBe(false)
    await runScheduledManifestPlaceholderExpiry(env(1))
    expect(mocks.clients).not.toHaveBeenCalled()
  })
  it('bounds expiry to ten batches and one connection and reliably releases it on failure', async () => {
    await runScheduledManifestPlaceholderExpiry(env())
    expect(mocks.clients).toHaveBeenCalledTimes(1)
    expect(mocks.query).toHaveBeenCalledTimes(30)
    expect(mocks.query.mock.calls.filter(([query]) => query.startsWith('SELECT')).every(([, args]) => args[1] <= 1000)).toBe(true)
    expect(mocks.end).toHaveBeenCalledTimes(1)
    mocks.query.mockRejectedValueOnce(new Error('DB unavailable'))
    await expect(runScheduledManifestPlaceholderExpiry(env())).rejects.toThrow('DB unavailable')
    expect(mocks.end).toHaveBeenCalledTimes(2)
  })
  it.each([16_000, 21_000])('stops expired health/runtime work after an in-flight batch at %i ms', async (elapsed) => {
    let now = 1_790_000_000_000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    mocks.query.mockImplementation(async (query: string) => {
      if (query.startsWith('SELECT'))
        now += elapsed
      return { rows: [{ removed: 1000 }] }
    })
    await runScheduledManifestPlaceholderExpiry(env())
    expect(mocks.query).toHaveBeenCalledTimes(3)
    expect(mocks.end).toHaveBeenCalledTimes(1)
  })

  it('keeps string database counts numeric within the fixed row budget', async () => {
    mocks.query.mockResolvedValue({ rows: [{ removed: '1000' }] })
    await runScheduledManifestPlaceholderExpiry(env())
    expect(mocks.query).toHaveBeenCalledTimes(30)
    expect(mocks.end).toHaveBeenCalledTimes(1)
  })

  it('stops when a bounded batch is drained', async () => {
    mocks.query.mockResolvedValue({ rows: [{ removed: 1 }] })
    await runScheduledManifestPlaceholderExpiry(env())
    expect(mocks.query).toHaveBeenCalledTimes(3)
  })
})
