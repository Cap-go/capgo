import { HTTPException } from 'hono/http-exception'
import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('cron_sync_sub resilience', () => {
  function setupCommonMocks(syncSubscriptionAndEvents: ReturnType<typeof vi.fn>) {
    vi.doMock('../supabase/functions/_backend/utils/hono.ts', () => ({
      BRES: { status: 'ok' },
      middlewareAPISecret: async (_c: unknown, next: () => Promise<void>) => await next(),
      parseBody: async (c: { req: { json: () => Promise<unknown> } }) => await c.req.json(),
      simpleError: (errorCode: string, message: string, moreInfo: Record<string, unknown> = {}) => {
        throw new HTTPException(400, { message, cause: { error: errorCode, ...moreInfo } })
      },
    }))
    vi.doMock('../supabase/functions/_backend/utils/pg.ts', () => ({
      closeClient: vi.fn(),
      getDrizzleClient: vi.fn(() => ({ drizzle: true })),
      getPgClient: vi.fn(() => ({ pg: true })),
    }))
    vi.doMock('../supabase/functions/_backend/utils/plans.ts', () => ({
      syncSubscriptionAndEvents,
    }))
  }

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('retries transient cron_sync_sub failures and succeeds', async () => {
    const syncSubscriptionAndEvents = vi.fn()
      .mockRejectedValueOnce({ status: 502, message: 'error code: 502' })
      .mockResolvedValueOnce(undefined)

    setupCommonMocks(syncSubscriptionAndEvents)

    const { app: cronSyncSub } = await import('../supabase/functions/_backend/triggers/cron_sync_sub.ts')

    const response = await cronSyncSub.request('http://localhost/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ orgId: 'org-retry' }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'ok' })
    expect(syncSubscriptionAndEvents).toHaveBeenCalledTimes(2)
  })

  it('skips stale cron_sync_sub jobs when the org no longer exists', async () => {
    const syncSubscriptionAndEvents = vi.fn().mockRejectedValue(
      new HTTPException(404, { message: 'Org not found', cause: { error: 'org_not_found' } }),
    )

    setupCommonMocks(syncSubscriptionAndEvents)

    const { app: cronSyncSub } = await import('../supabase/functions/_backend/triggers/cron_sync_sub.ts')

    const response = await cronSyncSub.request('http://localhost/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ orgId: 'org-missing' }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'skipped', reason: 'org_not_found' })
    expect(syncSubscriptionAndEvents).toHaveBeenCalledTimes(1)
  })
})
