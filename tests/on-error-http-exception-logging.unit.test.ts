import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  return {
    backgroundTask: vi.fn((_c, p) => p),
    cloudlog: vi.fn(),
    cloudlogErr: vi.fn(),
    sendDiscordAlert500: vi.fn(() => Promise.resolve()),
  }
})

vi.mock('../supabase/functions/_backend/utils/discord.ts', () => ({
  sendDiscordAlert500: mocks.sendDiscordAlert500,
}))

vi.mock('../supabase/functions/_backend/utils/logging.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../supabase/functions/_backend/utils/logging.ts')>()
  return {
    ...actual,
    cloudlog: mocks.cloudlog,
    cloudlogErr: mocks.cloudlogErr,
  }
})

vi.mock('../supabase/functions/_backend/utils/utils.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../supabase/functions/_backend/utils/utils.ts')>()
  return {
    ...actual,
    backgroundTask: mocks.backgroundTask,
  }
})

describe('onError HTTP exception logging', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('logs 4xx HTTP exceptions through cloudlog without error logging', async () => {
    const { onError } = await import('../supabase/functions/_backend/utils/on_error.ts')

    const app = new Hono()
    app.use('*', async (c, next) => {
      c.set('requestId', 'test-request-id')
      await next()
    })
    app.get('/missing-provider', () => {
      throw new HTTPException(404, {
        message: 'SSO provider not found',
        cause: {
          error: 'provider_not_found',
          message: 'SSO provider not found',
          moreInfo: {},
        },
      })
    })
    app.onError(onError('private'))

    const response = await app.request('http://local/missing-provider')

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({
      error: 'provider_not_found',
      message: 'SSO provider not found',
      moreInfo: {},
    })
    expect(mocks.cloudlog).toHaveBeenCalledWith(expect.objectContaining({
      functionName: 'private',
      kind: 'http_exception',
      status: 404,
      errorCode: 'provider_not_found',
    }))
    expect(mocks.cloudlogErr).not.toHaveBeenCalled()
    expect(mocks.sendDiscordAlert500).not.toHaveBeenCalled()
  })

  it('keeps 5xx HTTP exceptions on the error log channel', async () => {
    const { onError } = await import('../supabase/functions/_backend/utils/on_error.ts')

    const app = new Hono()
    app.use('*', async (c, next) => {
      c.set('requestId', 'test-request-id')
      await next()
    })
    app.get('/internal-error', () => {
      throw new HTTPException(500, {
        message: 'Internal server error',
        cause: {
          error: 'internal_error',
          message: 'Internal server error',
          moreInfo: {},
        },
      })
    })
    app.onError(onError('private'))

    const response = await app.request('http://local/internal-error')

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      error: 'internal_error',
      message: 'Internal server error',
      moreInfo: {},
    })
    expect(mocks.cloudlogErr).toHaveBeenCalledWith(expect.objectContaining({
      functionName: 'private',
      kind: 'http_exception',
      status: 500,
      errorCode: 'internal_error',
    }))
    expect(mocks.cloudlog).not.toHaveBeenCalled()
    expect(mocks.sendDiscordAlert500).toHaveBeenCalledOnce()
  })
})
