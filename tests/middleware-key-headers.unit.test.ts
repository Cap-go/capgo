import { Hono } from 'hono/tiny'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { middlewareKey } from '../supabase/functions/_backend/utils/hono_middleware.ts'

const {
  mockCheckKey,
  mockCheckKeyById,
  mockIsAPIKeyRateLimited,
  mockIsIPRateLimited,
  mockRecordAPIKeyUsage,
  mockRecordFailedAuth,
  mockSupabaseAdmin,
} = vi.hoisted(() => ({
  mockCheckKey: vi.fn(),
  mockCheckKeyById: vi.fn(),
  mockIsAPIKeyRateLimited: vi.fn(),
  mockIsIPRateLimited: vi.fn(),
  mockRecordAPIKeyUsage: vi.fn(),
  mockRecordFailedAuth: vi.fn(),
  mockSupabaseAdmin: vi.fn(),
}))

vi.mock('../supabase/functions/_backend/utils/logging.ts', () => ({
  cloudlog: vi.fn(),
}))

vi.mock('../supabase/functions/_backend/utils/rate_limit.ts', () => ({
  isAPIKeyRateLimited: mockIsAPIKeyRateLimited,
  isIPRateLimited: mockIsIPRateLimited,
  recordAPIKeyUsage: mockRecordAPIKeyUsage,
  recordFailedAuth: mockRecordFailedAuth,
}))

vi.mock('../supabase/functions/_backend/utils/supabase.ts', () => ({
  checkKey: mockCheckKey,
  checkKeyById: mockCheckKeyById,
  supabaseAdmin: mockSupabaseAdmin,
}))

const fakeApikey = {
  id: 123,
  user_id: 'user-test',
  key: 'stored-key',
  key_hash: null,
  mode: 'all',
  name: 'unit-test-key',
  limited_to_orgs: [],
  limited_to_apps: [],
  expires_at: null,
}

function createApp() {
  const app = new Hono()
  app.get('/protected', middlewareKey(['all']), (c) => {
    const auth = c.get('auth') as { authType: string, userId: string }
    return c.json({
      authType: auth.authType,
      capgkey: c.get('capgkey'),
      userId: auth.userId,
    })
  })
  return app
}

describe('middlewareKey header resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsIPRateLimited.mockResolvedValue({ limited: false })
    mockIsAPIKeyRateLimited.mockResolvedValue({ limited: false })
    mockRecordAPIKeyUsage.mockResolvedValue(undefined)
    mockRecordFailedAuth.mockResolvedValue(undefined)
    mockSupabaseAdmin.mockReturnValue({})
    mockCheckKey.mockResolvedValue(fakeApikey)
    mockCheckKeyById.mockResolvedValue(null)
  })

  it('accepts x-api-key as an API key header', async () => {
    const response = await createApp().request(new Request('http://localhost/protected', {
      headers: {
        'x-api-key': 'x-api-key-value',
      },
    }))

    expect(response.status).toBe(200)
    expect(mockCheckKey).toHaveBeenCalledWith(expect.anything(), 'x-api-key-value', expect.anything(), ['all'])
    await expect(response.json()).resolves.toEqual({
      authType: 'apikey',
      capgkey: 'x-api-key-value',
      userId: 'user-test',
    })
  })

  it('keeps capgkey precedence over x-api-key for legacy clients', async () => {
    const response = await createApp().request(new Request('http://localhost/protected', {
      headers: {
        'capgkey': 'legacy-key-value',
        'x-api-key': 'x-api-key-value',
      },
    }))

    expect(response.status).toBe(200)
    expect(mockCheckKey).toHaveBeenCalledWith(expect.anything(), 'legacy-key-value', expect.anything(), ['all'])
    await expect(response.json()).resolves.toMatchObject({
      capgkey: 'legacy-key-value',
    })
  })
})
