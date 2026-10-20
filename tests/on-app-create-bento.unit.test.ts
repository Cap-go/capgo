import { expect, it, vi } from 'vitest'
import { app } from '../supabase/functions/_backend/triggers/on_app_create.ts'
import { legacyLifecycleContext } from '../supabase/functions/_backend/utils/lifecycle_v2_rollout.ts'

const mocks = vi.hoisted(() => ({
  tracking: vi.fn(),
  record: { id: 'fixture-id', app_id: 'com.example.created', name: 'Example app', onboarding: {}, need_onboarding: false },
}))

vi.mock('../supabase/functions/_backend/utils/hono.ts', async importOriginal => ({
  ...await importOriginal<typeof import('../supabase/functions/_backend/utils/hono.ts')>(),
  middlewareAPISecret: async (_c: unknown, next: () => Promise<void>) => next(),
  triggerValidator: () => async (c: any, next: () => Promise<void>) => {
    c.set('webhookBody', mocks.record)
    await next()
  },
}))
vi.mock('../supabase/functions/_backend/utils/pg.ts', () => ({
  getPgClient: async () => ({}),
  closeClient: vi.fn(),
  getDrizzleClient: () => ({
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ owner_org: 'fixture-org' }] }) }) }),
  }),
}))
vi.mock('../supabase/functions/_backend/utils/supabase.ts', () => ({
  supabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ single: async () => ({ data: { name: 'Example org', website: 'https://example.com', onboarding: { intent: 'ota' } }, error: null }) }),
      }),
    }),
  }),
}))
vi.mock('../supabase/functions/_backend/utils/tracking.ts', () => ({ sendEventToTracking: mocks.tracking }))
vi.mock('../supabase/functions/_backend/utils/cloudflare.ts', () => ({ createIfNotExistStoreInfo: async () => {} }))
vi.mock('../supabase/functions/_backend/utils/cloudflare_cache_purge.ts', () => ({ purgeOnPremCache: async () => {} }))
vi.mock('../supabase/functions/_backend/utils/utils.ts', async importOriginal => ({
  ...await importOriginal<typeof import('../supabase/functions/_backend/utils/utils.ts')>(),
  backgroundTask: async (_c: unknown, task: Promise<unknown>) => task,
}))

it('passes the server-known app identity from the create trigger to lifecycle handoff', async () => {
  const response = await app.request('https://example.com/', { method: 'POST' }, { WEBAPP_URL: 'https://console.example' })
  expect(response.status).toBe(200)
  expect(mocks.tracking).toHaveBeenCalledOnce()
  const event = mocks.tracking.mock.calls[0][1].bento
  expect(event).toMatchObject({ event: 'app:created', data: { app_id: 'com.example.created', app_name: 'Example app' } })
  expect(legacyLifecycleContext(event.event, event.data)).toEqual({ kind: 'app', appId: 'com.example.created' })
})
