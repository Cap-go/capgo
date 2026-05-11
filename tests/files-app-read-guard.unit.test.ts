import { beforeEach, describe, expect, it, vi } from 'vitest'

const getAppByAppIdPgMock = vi.fn()
const pgClientMock = {
  query: vi.fn(),
}
const getPgClientMock = vi.fn(() => pgClientMock)

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
    pgClientMock.query.mockResolvedValue({ rows: [] })
  })

  it('returns 404 for deleted app-scoped files before serving cached content', async () => {
    getAppByAppIdPgMock.mockResolvedValue(null)

    const bucketPut = vi.fn()
    globalThis.caches = {
      default: {
        match: async () => new Response('cached orphan bytes', {
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

    expect(response.status).toBe(404)
    expect(bucketPut).not.toHaveBeenCalled()
    expect(getPgClientMock).toHaveBeenCalledWith(expect.anything(), false)
  })

  it('returns 404 for malformed app-scoped paths before serving cached content', async () => {
    const bucketPut = vi.fn()
    globalThis.caches = {
      default: {
        match: async () => new Response('cached malformed bytes', {
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

    expect(response.status).toBe(404)
    expect(bucketPut).not.toHaveBeenCalled()
    expect(getAppByAppIdPgMock).not.toHaveBeenCalled()
  })

  it('returns 404 for soft-deleted bundle paths before serving cached content', async () => {
    getAppByAppIdPgMock.mockResolvedValue({ app_id: 'test-app', owner_org: 'test-org' })
    pgClientMock.query.mockResolvedValue({ rows: [{ id: 123 }] })

    const bucketPut = vi.fn()
    globalThis.caches = {
      default: {
        match: async () => new Response('cached deleted bundle bytes', {
          headers: {
            'content-type': 'application/zip',
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

    const filePath = 'orgs/test-org/apps/test-app/1.0.0.zip'
    const response = await appGlobal.fetch(
      new Request(`http://localhost/read/attachments/${filePath}`),
      {
        ATTACHMENT_BUCKET: { put: bucketPut },
      },
      { waitUntil: () => { } } as any,
    )

    expect(response.status).toBe(404)
    expect(pgClientMock.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM public.app_versions'),
      ['test-org', 'test-app', filePath],
    )
    expect(bucketPut).not.toHaveBeenCalled()
  })
})
