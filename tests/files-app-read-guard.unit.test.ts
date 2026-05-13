import { beforeEach, describe, expect, it, vi } from 'vitest'

const getAppByAppIdPgMock = vi.fn()
const getPgClientMock = vi.fn(() => ({}))

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

vi.mock('../supabase/functions/_backend/utils/pg.ts', () => ({
  closeClient: () => Promise.resolve(),
  getAppOwnerPostgres: vi.fn(),
  getDrizzleClient: vi.fn(() => ({})),
  getPgClient: getPgClientMock,
}))

vi.mock('../supabase/functions/_backend/utils/pg_files.ts', () => ({
  getAppByAppIdPg: getAppByAppIdPgMock,
  getUserIdFromApikey: vi.fn(),
}))

describe('files app-scoped read guard', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it.concurrent('serves cached app-scoped files without checking the app in the database', async () => {
    getAppByAppIdPgMock.mockResolvedValue(null)

    const bucketPut = vi.fn()
    globalThis.caches = {
      default: {
        match: async () => new Response('cached bytes', {
          headers: {
            'content-type': 'text/plain',
          },
        }),
        put: async () => { },
      },
    } as any

    const { app: files } = await import('../supabase/functions/_backend/files/files.ts')
    const { createAllCatch, createHono } = await import('../supabase/functions/_backend/utils/hono.ts')
    const { version } = await import('../supabase/functions/_backend/utils/version.ts')

    const appGlobal = createHono('files', version)
    appGlobal.route('/', files)
    createAllCatch(appGlobal, 'files')

    const response = await appGlobal.fetch(
      new Request('http://localhost/read/attachments/orgs/test-org/apps/test-app/orphan.txt'),
      {
        ATTACHMENT_BUCKET: { put: bucketPut },
      },
      { waitUntil: () => { } } as any,
    )

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('cached bytes')
    expect(bucketPut).not.toHaveBeenCalled()
    expect(getPgClientMock).not.toHaveBeenCalled()
    expect(getAppByAppIdPgMock).not.toHaveBeenCalled()
  })

  it.concurrent('serves cached malformed app-scoped paths without a database lookup', async () => {
    const bucketPut = vi.fn()
    globalThis.caches = {
      default: {
        match: async () => new Response('cached bytes', {
          headers: {
            'content-type': 'text/plain',
          },
        }),
        put: async () => { },
      },
    } as any

    const { app: files } = await import('../supabase/functions/_backend/files/files.ts')
    const { createAllCatch, createHono } = await import('../supabase/functions/_backend/utils/hono.ts')
    const { version } = await import('../supabase/functions/_backend/utils/version.ts')

    const appGlobal = createHono('files', version)
    appGlobal.route('/', files)
    createAllCatch(appGlobal, 'files')

    const response = await appGlobal.fetch(
      new Request('http://localhost/read/attachments/orgs/test-org/apps/test-app/'),
      {
        ATTACHMENT_BUCKET: { put: bucketPut },
      },
      { waitUntil: () => { } } as any,
    )

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('cached bytes')
    expect(bucketPut).not.toHaveBeenCalled()
    expect(getPgClientMock).not.toHaveBeenCalled()
    expect(getAppByAppIdPgMock).not.toHaveBeenCalled()
  })
})
