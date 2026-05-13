import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fileId = 'orgs/test-org/apps/test-app/cache-test.zip'
const originalCaches = globalThis.caches
const getPgClientMock = vi.fn()
const getUserIdFromApikeyMock = vi.fn()
const getAppByAppIdPgMock = vi.fn()
const getAppByIdPgMock = vi.fn()
const checkPermissionPgMock = vi.fn()

function encodeMetadataValue(value: string) {
  return Buffer.from(value).toString('base64')
}

function createCache() {
  const store = new Map<string, Response>()
  return {
    match: vi.fn(async (request: Request) => store.get(request.url)?.clone() ?? null),
    put: vi.fn(async (request: Request, response: Response) => {
      store.set(request.url, response.clone())
    }),
  }
}

function createExecutionContext() {
  return {
    waitUntil: vi.fn(),
  }
}

vi.mock('hono/adapter', () => {
  return {
    env: () => ({}),
    getRuntimeKey: () => 'workerd',
  }
})

vi.mock('../supabase/functions/_backend/utils/discord.ts', () => ({
  sendDiscordAlert500: () => Promise.resolve(),
  sendDiscordAlert: () => Promise.resolve(),
}))

vi.mock('../supabase/functions/_backend/utils/hono_middleware.ts', () => ({
  middlewareKey: () => async (c: any, next: () => Promise<void>) => {
    const apikey = {
      id: 123,
      user_id: '00000000-0000-0000-0000-000000000001',
      limited_to_apps: [],
      limited_to_orgs: [],
    }
    c.set('apikey', apikey)
    c.set('parentApikey', apikey)
    c.set('capgkey', 'test-api-key')
    c.set('auth', {
      userId: apikey.user_id,
      authType: 'apikey',
      apikey,
      jwt: null,
    })
    await next()
  },
}))

vi.mock('../supabase/functions/_backend/utils/pg.ts', () => ({
  closeClient: vi.fn(() => Promise.resolve()),
  getAppByIdPg: getAppByIdPgMock,
  getDrizzleClient: vi.fn(() => ({})),
  getPgClient: getPgClientMock,
  logPgError: vi.fn(),
}))

vi.mock('../supabase/functions/_backend/utils/pg_files.ts', () => ({
  getAppByAppIdPg: getAppByAppIdPgMock,
  getUserIdFromApikey: getUserIdFromApikeyMock,
}))

vi.mock('../supabase/functions/_backend/utils/rbac.ts', () => ({
  checkPermission: vi.fn(() => Promise.resolve(true)),
  checkPermissionPg: checkPermissionPgMock,
}))

describe('files upload access cache', () => {
  afterEach(() => {
    globalThis.caches = originalCaches
  })

  beforeEach(() => {
    vi.clearAllMocks()
    getPgClientMock.mockReturnValue({
      end: vi.fn(() => Promise.resolve()),
      query: vi.fn(async () => ({ rows: [] })),
    })
    getUserIdFromApikeyMock.mockResolvedValue('00000000-0000-0000-0000-000000000001')
    getAppByAppIdPgMock.mockResolvedValue({ app_id: 'test-app', owner_org: 'test-org' })
    getAppByIdPgMock.mockResolvedValue({ plan_valid: true })
    checkPermissionPgMock.mockResolvedValue(true)
  })

  it('reuses cached TUS write access for repeated HEAD checks', async () => {
    const cache = createCache()
    globalThis.caches = { default: cache } as any

    const handlerFetch = vi.fn(async (request: Request) => {
      return new Response(null, {
        status: request.method === 'POST' ? 201 : 204,
        headers: {
          'Tus-Resumable': '1.0.0',
        },
      })
    })
    const env = {
      ATTACHMENT_UPLOAD_HANDLER: {
        idFromName: (name: string) => name,
        get: () => ({ fetch: handlerFetch }),
      },
    }
    const executionCtx = createExecutionContext()

    const { app: files } = await import('../supabase/functions/_backend/files/files.ts')
    const { createAllCatch, createHono } = await import('../supabase/functions/_backend/utils/hono.ts')
    const { version } = await import('../supabase/functions/_backend/utils/version.ts')

    const appGlobal = createHono('files', version)
    appGlobal.route('/', files)
    createAllCatch(appGlobal, 'files')

    const createResponse = await appGlobal.fetch(
      new Request('http://localhost/upload/attachments', {
        method: 'POST',
        headers: {
          Authorization: 'test-api-key',
          'Tus-Resumable': '1.0.0',
          'Upload-Metadata': `filename ${encodeMetadataValue(fileId)},filetype ${encodeMetadataValue('application/zip')}`,
          'Content-Length': '0',
        },
      }),
      env,
      executionCtx as any,
    )

    expect(createResponse.status).toBe(201)
    expect(getPgClientMock).toHaveBeenCalledTimes(1)
    expect(cache.put).toHaveBeenCalled()

    const headResponse = await appGlobal.fetch(
      new Request(`http://localhost/upload/attachments/${fileId}`, {
        method: 'HEAD',
        headers: {
          Authorization: 'test-api-key',
          'Tus-Resumable': '1.0.0',
        },
      }),
      env,
      executionCtx as any,
    )

    expect(headResponse.status).toBe(204)
    expect(getPgClientMock).toHaveBeenCalledTimes(1)
    expect(getUserIdFromApikeyMock).toHaveBeenCalledTimes(1)
    expect(checkPermissionPgMock).toHaveBeenCalledTimes(1)
    expect(cache.match).toHaveBeenCalled()
  })
})
