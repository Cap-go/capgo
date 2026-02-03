import { describe, expect, it, vi } from 'vitest'

vi.mock('hono/adapter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('hono/adapter')>()
  return {
    ...actual,
    getRuntimeKey: () => 'workerd',
  }
})

vi.mock('../supabase/functions/_backend/utils/discord.ts', () => ({
  sendDiscordAlert500: () => Promise.resolve(),
  sendDiscordAlert: () => Promise.resolve(),
}))

vi.mock('../supabase/functions/_backend/files/retry.ts', () => ({
  DEFAULT_RETRY_PARAMS: {},
  RetryBucket: class RetryBucketMock {
    constructor() {}
    get() {
      throw new Error('r2 unavailable')
    }
    head() {
      return null
    }
  },
}))

describe('files R2 error handling', () => {
  it('should return 503 when R2 get fails', async () => {
    globalThis.caches = {
      default: {
        match: async () => null,
        put: async () => {},
      },
    } as any

    const { app: files } = await import('../supabase/functions/_backend/files/files.ts')
    const { createAllCatch, createHono } = await import('../supabase/functions/_backend/utils/hono.ts')
    const { version } = await import('../supabase/functions/_backend/utils/version.ts')

    const appGlobal = createHono('files', version)
    appGlobal.route('/', files)
    createAllCatch(appGlobal, 'files')

    const request = new Request('http://localhost/read/attachments/test.zip')
    const response = await appGlobal.fetch(
      request,
      { ATTACHMENT_BUCKET: {} },
      { waitUntil: () => {} } as any,
    )

    expect(response.status).toBe(503)
    const data = await response.json() as { error: string }
    expect(data.error).toBe('upstream_unavailable')
  })
})
