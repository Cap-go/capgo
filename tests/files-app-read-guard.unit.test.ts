import { beforeEach, describe, expect, it, vi } from 'vitest'

const getAppByAppIdPgMock = vi.fn()
const pgQueryMock = vi.fn()
const getPgClientMock = vi.fn(() => ({ query: pgQueryMock }))
const checkPermissionPgMock = vi.fn()

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

vi.mock('../supabase/functions/_backend/utils/rbac.ts', () => ({
  checkPermissionPg: checkPermissionPgMock,
}))

vi.mock('../supabase/functions/_backend/utils/hono_middleware.ts', () => ({
  middlewareKey: () => async (c: any, next: () => Promise<void>) => {
    const key = c.req.header('authorization') ?? c.req.header('capgkey')
    if (key === 'stale-token')
      return c.json({ error: 'invalid_apikey' }, 401)
    if (key) {
      c.set('auth', {
        userId: 'auth-user-id',
        authType: 'apikey',
        apikey: { key },
        jwt: null,
      })
      c.set('capgkey', key)
    }
    await next()
  },
}))

async function createFilesTestApp() {
  const { app: files } = await import('../supabase/functions/_backend/files/files.ts')
  const { createAllCatch, createHono } = await import('../supabase/functions/_backend/utils/hono.ts')
  const { version } = await import('../supabase/functions/_backend/utils/version.ts')

  const appGlobal = createHono('files', version)
  appGlobal.route('/', files)
  createAllCatch(appGlobal, 'files')
  return appGlobal
}

function setCachedAttachment(body: string) {
  globalThis.caches = {
    default: {
      match: async () => new Response(body, {
        headers: {
          'content-type': 'text/plain',
        },
      }),
      put: async () => { },
    },
  } as any
}

describe('files app-scoped read guard', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    pgQueryMock.mockResolvedValue({ rows: [] })
    checkPermissionPgMock.mockResolvedValue(false)
  })

  it('returns 404 for deleted app-scoped files before serving cached content', async () => {
    getAppByAppIdPgMock.mockResolvedValue(null)

    const bucketPut = vi.fn()
    setCachedAttachment('cached orphan bytes')

    const appGlobal = await createFilesTestApp()
    const response = await appGlobal.fetch(
      new Request('http://localhost/read/attachments/orgs/00000000-0000-4000-8000-000000000001/apps/test-app/orphan.txt'),
      {
        ATTACHMENT_BUCKET: { put: bucketPut },
      },
      { waitUntil: () => { } } as any,
    )

    expect(response.status).toBe(404)
    expect(bucketPut).not.toHaveBeenCalled()
    expect(getPgClientMock).toHaveBeenCalledWith(expect.anything(), false)
  })

  it('allows signed app-scoped bundle reads before checking app existence', async () => {
    pgQueryMock.mockResolvedValueOnce({ rows: [{ exists: true }] })
    setCachedAttachment('cached signed bytes')

    const appGlobal = await createFilesTestApp()
    const response = await appGlobal.fetch(
      new Request('http://localhost/read/attachments/orgs/00000000-0000-4000-8000-000000000001/apps/test-app/bundle.zip?key=signed-key'),
      {
        ATTACHMENT_BUCKET: {},
      },
      { waitUntil: () => { } } as any,
    )

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('cached signed bytes')
    expect(getAppByAppIdPgMock).not.toHaveBeenCalled()
  })

  it('preserves plus characters in signed app-scoped bundle keys before optional API-key auth', async () => {
    pgQueryMock.mockImplementationOnce(async (_query, params) => {
      expect(params[1]).toBe('legacy+checksum')
      return { rows: [{ exists: true }] }
    })
    setCachedAttachment('cached plus-key bytes')

    const appGlobal = await createFilesTestApp()
    const response = await appGlobal.fetch(
      new Request('http://localhost/read/attachments/orgs/00000000-0000-4000-8000-000000000001/apps/test-app/bundle.zip?key=legacy+checksum', {
        headers: {
          authorization: 'stale-token',
        },
      }),
      {
        ATTACHMENT_BUCKET: {},
      },
      { waitUntil: () => { } } as any,
    )

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('cached plus-key bytes')
  })

  it('allows authenticated range existence probes for live app-scoped files', async () => {
    getAppByAppIdPgMock.mockResolvedValue({ app_id: 'test-app', owner_org: '00000000-0000-4000-8000-000000000001' })
    checkPermissionPgMock.mockResolvedValue(true)
    setCachedAttachment('cached probe bytes')

    const appGlobal = await createFilesTestApp()
    const response = await appGlobal.fetch(
      new Request('http://localhost/read/attachments/orgs/00000000-0000-4000-8000-000000000001/apps/test-app/delta/files/upload/attachments/existing.txt', {
        headers: {
          authorization: 'test-api-key',
          range: 'bytes=0-0',
        },
      }),
      {
        ATTACHMENT_BUCKET: {},
      },
      { waitUntil: () => { } } as any,
    )

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('cached probe bytes')
    expect(checkPermissionPgMock).toHaveBeenCalledWith(
      expect.anything(),
      'app.read_bundles',
      { appId: 'test-app' },
      expect.anything(),
      'auth-user-id',
      'test-api-key',
    )
  })

  it('keeps unsigned range app-scoped reads blocked', async () => {
    const bucketPut = vi.fn()
    getAppByAppIdPgMock.mockResolvedValue({ app_id: 'test-app', owner_org: '00000000-0000-4000-8000-000000000001' })
    setCachedAttachment('cached unsigned bytes')

    const appGlobal = await createFilesTestApp()
    const response = await appGlobal.fetch(
      new Request('http://localhost/read/attachments/orgs/00000000-0000-4000-8000-000000000001/apps/test-app/delta/existing.txt', {
        headers: {
          range: 'bytes=0-0',
        },
      }),
      {
        ATTACHMENT_BUCKET: { put: bucketPut },
      },
      { waitUntil: () => { } } as any,
    )

    expect(response.status).toBe(404)
    expect(bucketPut).not.toHaveBeenCalled()
  })

  it('keeps unsigned full app-scoped reads blocked', async () => {
    const bucketPut = vi.fn()
    getAppByAppIdPgMock.mockResolvedValue({ app_id: 'test-app', owner_org: '00000000-0000-4000-8000-000000000001' })
    setCachedAttachment('cached full bytes')

    const appGlobal = await createFilesTestApp()
    const response = await appGlobal.fetch(
      new Request('http://localhost/read/attachments/orgs/00000000-0000-4000-8000-000000000001/apps/test-app/delta/existing.txt'),
      {
        ATTACHMENT_BUCKET: { put: bucketPut },
      },
      { waitUntil: () => { } } as any,
    )

    expect(response.status).toBe(404)
    expect(bucketPut).not.toHaveBeenCalled()
  })

  it('returns 404 for malformed app-scoped paths before serving cached content', async () => {
    const bucketPut = vi.fn()
    setCachedAttachment('cached malformed bytes')

    const appGlobal = await createFilesTestApp()
    const response = await appGlobal.fetch(
      new Request('http://localhost/read/attachments/orgs/00000000-0000-4000-8000-000000000001/apps/test-app/'),
      {
        ATTACHMENT_BUCKET: { put: bucketPut },
      },
      { waitUntil: () => { } } as any,
    )

    expect(response.status).toBe(404)
    expect(bucketPut).not.toHaveBeenCalled()
    expect(getAppByAppIdPgMock).not.toHaveBeenCalled()
  })
})
