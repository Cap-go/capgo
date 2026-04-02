import { beforeEach, describe, expect, it, vi } from 'vitest'

const checkPermissionMock = vi.fn()
function queryBuilderFactory() {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: { id: 123, app_id: 'com.example.app' },
      error: null,
    }),
    update: vi.fn().mockReturnThis(),
  }
}
const supabaseApikeyMock = vi.fn()

vi.mock('../supabase/functions/_backend/utils/hono_middleware.ts', () => ({
  middlewareKey: () => async (c: any, next: () => Promise<void>) => {
    c.set('apikey', { key: 'test-apikey', user_id: 'user-1' })
    c.set('auth', { userId: 'user-1', authType: 'apikey', apikey: { key: 'test-apikey', user_id: 'user-1' }, jwt: null })
    await next()
  },
}))

vi.mock('../supabase/functions/_backend/utils/rbac.ts', () => ({
  checkPermission: (...args: unknown[]) => checkPermissionMock(...args),
}))

vi.mock('../supabase/functions/_backend/utils/supabase.ts', () => ({
  supabaseApikey: (...args: unknown[]) => supabaseApikeyMock(...args),
}))

const { app } = await import('../supabase/functions/_backend/public/bundle/update_metadata.ts')

function postJson(body: unknown) {
  return new Request('http://local/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

describe('bundle metadata RBAC guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    checkPermissionMock.mockResolvedValue(true)
    supabaseApikeyMock.mockReturnValue({
      from: vi.fn().mockReturnValue(queryBuilderFactory()),
    })
  })

  it('rejects metadata writes when upload permission is denied', async () => {
    checkPermissionMock.mockResolvedValue(false)

    const response = await app.request(postJson({
      app_id: 'com.example.app',
      version_id: 123,
      comment: 'blocked update',
    }))

    expect(response.status).toBe(400)
    expect(await response.text()).toContain('You can\'t update metadata for this app')
    expect(checkPermissionMock).toHaveBeenCalledWith(expect.anything(), 'app.upload_bundle', { appId: 'com.example.app' })
    expect(supabaseApikeyMock).not.toHaveBeenCalled()
  })

  it('allows metadata writes when upload permission is granted', async () => {
    const response = await app.request(postJson({
      app_id: 'com.example.app',
      version_id: 123,
      comment: 'allowed update',
    }))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      status: 'ok',
    })
    expect(checkPermissionMock).toHaveBeenCalledWith(expect.anything(), 'app.upload_bundle', { appId: 'com.example.app' })
    expect(supabaseApikeyMock).toHaveBeenCalled()
  })
})
