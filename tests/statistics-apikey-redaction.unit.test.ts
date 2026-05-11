import type { AuthInfo } from '../supabase/functions/_backend/utils/hono.ts'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { app as statisticsApp } from '../supabase/functions/_backend/public/statistics/index.ts'
import { createAllCatch, createHono } from '../supabase/functions/_backend/utils/hono.ts'
import { version } from '../supabase/functions/_backend/utils/version.ts'

const checkPermissionMock = vi.fn()
let authMock: AuthInfo

vi.mock('../supabase/functions/_backend/utils/hono_middleware.ts', () => ({
  middlewareV2: () => async (c: any, next: () => Promise<void>) => {
    c.set('auth', authMock)
    await next()
  },
}))

vi.mock('../supabase/functions/_backend/utils/rbac.ts', () => ({
  checkPermission: (...args: unknown[]) => checkPermissionMock(...args),
}))

function createStatisticsRequestApp() {
  const app = createHono('statistics', version)
  app.route('/', statisticsApp)
  createAllCatch(app, 'statistics')
  return app
}

function createApiKeyAuth(overrides: Partial<NonNullable<AuthInfo['apikey']>>): AuthInfo {
  return {
    userId: 'user-with-scoped-key',
    authType: 'apikey',
    jwt: null,
    apikey: {
      id: 123,
      user_id: 'user-with-scoped-key',
      key: 'capgo_secret_scoped_key_value',
      mode: 'read',
      name: 'Scoped key',
      limited_to_apps: [],
      limited_to_orgs: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      expires_at: null,
      key_hash: null,
      ...overrides,
    } as NonNullable<AuthInfo['apikey']>,
  }
}

async function requestOrgStats() {
  return createStatisticsRequestApp().request(
    'http://local/org/org-target?from=2026-05-01&to=2026-05-10',
    { method: 'GET' },
  )
}

async function expectInvalidApiKeyWithoutSecret(response: Response) {
  expect(response.status).toBe(401)

  const text = await response.text()
  expect(text).not.toContain('capgo_secret_scoped_key_value')

  const body = JSON.parse(text) as { error?: string, moreInfo?: { data?: unknown } }
  expect(body.error).toBe('invalid_apikey')
  expect(body.moreInfo?.data).toBeUndefined()
}

beforeEach(() => {
  vi.clearAllMocks()
  checkPermissionMock.mockResolvedValue(true)
})

describe('statistics API key error redaction', () => {
  it('does not echo org-limited API key secrets for disallowed org stats', async () => {
    authMock = createApiKeyAuth({ limited_to_orgs: ['org-other'] })

    await expectInvalidApiKeyWithoutSecret(await requestOrgStats())
  })

  it('does not echo app-limited API key secrets for org stats', async () => {
    authMock = createApiKeyAuth({ limited_to_apps: ['com.example.app'] })

    await expectInvalidApiKeyWithoutSecret(await requestOrgStats())
  })
})
