import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../supabase/functions/_backend/utils/hono.ts'
import { HTTPException } from 'hono/http-exception'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const checkPermissionMock = vi.fn()
const supabaseApikeyMock = vi.fn()

vi.mock('../supabase/functions/_backend/utils/rbac.ts', () => ({
  checkPermission: (...args: unknown[]) => checkPermissionMock(...args),
}))

vi.mock('../supabase/functions/_backend/utils/supabase.ts', () => ({
  supabaseApikey: (...args: unknown[]) => supabaseApikeyMock(...args),
}))

vi.mock('../supabase/functions/_backend/utils/utils.ts', async () => {
  const actual = await vi.importActual<typeof import('../supabase/functions/_backend/utils/utils.ts')>('../supabase/functions/_backend/utils/utils.ts')
  return {
    ...actual,
    isValidAppId: (appId: string) => typeof appId === 'string' && appId.includes('.'),
    fetchLimit: 50,
  }
})

const { get } = await import('../supabase/functions/_backend/public/bundle/get.ts')

const apikey = {
  key: 'test-apikey',
  user_id: 'user-1',
} as any

function causeErrorCode(error: HTTPException) {
  return (error.cause as { error: string }).error
}

function createContext(auth?: { userId: string }) {
  return {
    get: vi.fn((key: string) => {
      if (key === 'requestId')
        return 'req-1'
      if (key === 'auth')
        return auth
      return undefined
    }),
    json: (body: unknown, status = 200) => Response.json(body, { status }),
  } as unknown as Context<MiddlewareKeyVariables>
}

function makeSupabaseChain(result: { data?: unknown, error?: unknown }) {
  const eqCalls: Array<[string, unknown]> = []
  const chain: Record<string, any> = {}
  const self = () => chain
  chain.from = vi.fn(self)
  chain.select = vi.fn(self)
  chain.eq = vi.fn((column: string, value: unknown) => {
    eqCalls.push([column, value])
    return chain
  })
  chain.range = vi.fn(self)
  chain.limit = vi.fn(self)
  chain.order = vi.fn(self)
  chain.maybeSingle = vi.fn(() => Promise.resolve(result))
  chain.then = (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => Promise.resolve(result).then(resolve, reject)
  chain.eqCalls = eqCalls
  return chain
}

describe('bundle GET handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    checkPermissionMock.mockResolvedValue(true)
  })

  it('returns 401 when auth context is missing', async () => {
    const error = await get(createContext(undefined), { app_id: 'com.example.app' }, apikey).catch(caught => caught) as HTTPException
    expect(error).toBeInstanceOf(HTTPException)
    expect(error.status).toBe(401)
    expect(causeErrorCode(error)).toBe('invalid_apikey')
  })

  it('returns 404 when permission is denied and the app is not visible', async () => {
    checkPermissionMock.mockResolvedValue(false)
    supabaseApikeyMock.mockReturnValue(makeSupabaseChain({ data: null, error: null }))

    const error = await get(createContext({ userId: 'user-1' }), { app_id: 'com.missing.app' }, apikey).catch(caught => caught) as HTTPException
    expect(error).toBeInstanceOf(HTTPException)
    expect(error.status).toBe(404)
    expect(causeErrorCode(error)).toBe('app_not_found')
  })

  it('returns 403 when permission is denied but the app exists', async () => {
    checkPermissionMock.mockResolvedValue(false)
    supabaseApikeyMock.mockReturnValue(makeSupabaseChain({ data: { app_id: 'com.example.app' }, error: null }))

    const error = await get(createContext({ userId: 'user-1' }), { app_id: 'com.example.app' }, apikey).catch(caught => caught) as HTTPException
    expect(error).toBeInstanceOf(HTTPException)
    expect(error.status).toBe(403)
    expect(causeErrorCode(error)).toBe('cannot_get_bundle')
  })

  it('returns 500 when bundle query fails', async () => {
    const versionsChain = makeSupabaseChain({ data: null, error: { message: 'db down' } })
    supabaseApikeyMock.mockReturnValue(versionsChain)

    const error = await get(createContext({ userId: 'user-1' }), { app_id: 'com.example.app' }, apikey).catch(caught => caught) as HTTPException
    expect(error).toBeInstanceOf(HTTPException)
    expect(error.status).toBe(500)
    expect(causeErrorCode(error)).toBe('cannot_get_bundle')
  })

  it.each([
    ['bundle rows', [{ id: 1, name: '1.0.0', app_id: 'com.example.app' }]],
    ['an empty array when the app has no bundles', []],
  ])('returns %s on success', async (_label, rows) => {
    supabaseApikeyMock.mockReturnValue(makeSupabaseChain({ data: rows, error: null }))

    const response = await get(createContext({ userId: 'user-1' }), { app_id: 'com.example.app' }, apikey)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(rows)
  })

  it('excludes deleted bundles by default on version lookup', async () => {
    const chain = makeSupabaseChain({ data: [], error: null })
    supabaseApikeyMock.mockReturnValue(chain)

    const response = await get(createContext({ userId: 'user-1' }), { app_id: 'com.example.app', version: '1.0.0' }, apikey)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([])
    expect(chain.eqCalls).toContainEqual(['deleted', false])
  })

  it('include_deleted matches soft-deleted bundles for name occupancy checks', async () => {
    const row = { id: 12, name: '1.0.0', checksum: 'abc', deleted: true, created_at: '2026-01-01T00:00:00.000Z' }
    const chain = makeSupabaseChain({ data: [row], error: null })
    supabaseApikeyMock.mockReturnValue(chain)

    const response = await get(createContext({ userId: 'user-1' }), { app_id: 'com.example.app', version: '1.0.0', include_deleted: '1' }, apikey)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([row])
    expect(chain.eqCalls).not.toContainEqual(['deleted', false])
    expect(chain.eqCalls).toContainEqual(['name', '1.0.0'])
  })
})
