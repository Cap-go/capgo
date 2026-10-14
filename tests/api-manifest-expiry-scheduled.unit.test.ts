import type { Bindings } from '../supabase/functions/_backend/utils/cloudflare.ts'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import apiWorker from '../cloudflare_workers/api/index.ts'

const mocks = vi.hoisted(() => ({ flush: vi.fn(), expiry: vi.fn() }))
vi.mock('../supabase/functions/_backend/utils/plugin_notification_flush.ts', () => ({ flushQueuedPluginNotifications: mocks.flush }))
vi.mock('../supabase/functions/_backend/utils/manifest_placeholder_expiry.ts', () => ({ runScheduledManifestPlaceholderExpiry: mocks.expiry }))
beforeEach(() => {
  vi.resetAllMocks()
  mocks.flush.mockResolvedValue({ status: 'ok', failed: 0 })
  mocks.expiry.mockResolvedValue(undefined)
})

describe('independent every-minute API tasks', () => {
  it('retains notification flushing when the second task fails', async () => {
    mocks.expiry.mockRejectedValue(new Error('Inventory unavailable'))
    const tasks: Promise<unknown>[] = []
    const ctx = { waitUntil: (task: Promise<unknown>) => tasks.push(task), passThroughOnException: vi.fn() } as unknown as ExecutionContext
    apiWorker.scheduled({} as ScheduledController, { ENV_NAME: 'capgo_api-prod' } as Bindings, ctx)
    await Promise.all(tasks)
    expect(mocks.flush).toHaveBeenCalledTimes(1)
    expect(mocks.expiry).toHaveBeenCalledTimes(1)
  })
  it('does not invoke expiry on ordinary API requests', async () => {
    const response = await apiWorker.fetch(new Request('https://api.example.com/private/request_manifest_upload', { method: 'POST' }))
    expect(response.status).toBe(401)
    expect(mocks.expiry).not.toHaveBeenCalled()
  })
})
