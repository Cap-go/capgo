import { describe, expect, it, vi } from 'vitest'
import { createAllCatch, createHono } from '../supabase/functions/_backend/utils/hono.ts'
import { version } from '../supabase/functions/_backend/utils/version.ts'

const eqMock = vi.fn()
const singleMock = vi.fn()
const getBundleUrlMock = vi.fn()

vi.mock('../supabase/functions/_backend/utils/discord.ts', () => ({
  sendDiscordAlert500: () => Promise.resolve(),
  sendDiscordAlert: () => Promise.resolve(),
}))

vi.mock('../supabase/functions/_backend/utils/downloadUrl.ts', () => ({
  getBundleUrl: getBundleUrlMock,
  getManifestUrl: vi.fn(() => []),
}))

vi.mock('../supabase/functions/_backend/utils/rbac.ts', () => ({
  checkPermission: vi.fn(() => Promise.resolve(true)),
}))

vi.mock('../supabase/functions/_backend/utils/supabase.ts', () => ({
  supabaseClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: eqMock,
      })),
    })),
  })),
}))

vi.mock('../supabase/functions/_backend/utils/hono.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../supabase/functions/_backend/utils/hono.ts')>()
  return {
    ...actual,
    middlewareAuth: async (c: any, next: () => Promise<void>) => {
      c.set('authorization', 'Bearer test-token')
      c.set('auth', { userId: 'test-user' })
      await next()
    },
    useCors: async (_c: any, next: () => Promise<void>) => {
      await next()
    },
  }
})

describe('private download_link deleted bundle guard', () => {
  it('filters deleted bundles before creating download URLs', async () => {
    vi.resetModules()
    vi.clearAllMocks()

    const query = {
      eq: eqMock,
      single: singleMock,
    }
    eqMock.mockReturnValue(query)
    singleMock.mockResolvedValue({
      data: null,
      error: { message: 'no rows' },
    })

    const { app: downloadLink } = await import('../supabase/functions/_backend/private/download_link.ts')
    const appGlobal = createHono('private', version)
    appGlobal.route('/download_link', downloadLink)
    createAllCatch(appGlobal, 'private')

    const response = await appGlobal.fetch(
      new Request('http://localhost/download_link', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          app_id: 'test-app',
          id: 123,
          storage_provider: 'r2',
        }),
      }),
    )

    const body = await response.json() as { error: string }

    expect(response.status).toBe(400)
    expect(body.error).toBe('cannot_get_bundle')
    expect(eqMock).toHaveBeenCalledWith('deleted', false)
    expect(getBundleUrlMock).not.toHaveBeenCalled()
  })
})
