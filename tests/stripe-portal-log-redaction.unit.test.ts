import { HTTPException } from 'hono/http-exception'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const cloudlogMock = vi.fn()
const checkPermissionMock = vi.fn()
const createPortalMock = vi.fn()
const supabaseClientMock = vi.fn()

const mockedModules = [
  '../supabase/functions/_backend/utils/hono.ts',
  '../supabase/functions/_backend/utils/logging.ts',
  '../supabase/functions/_backend/utils/rbac.ts',
  '../supabase/functions/_backend/utils/stripe.ts',
  '../supabase/functions/_backend/utils/supabase.ts',
]

describe('stripe portal log redaction', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()

    vi.doMock('../supabase/functions/_backend/utils/hono.ts', () => ({
      middlewareAuth: async (c: any, next: () => Promise<void>) => {
        c.set('authorization', 'Bearer jwt-with-sensitive-user')
        c.set('auth', {
          userId: 'user-sensitive-id',
          authType: 'jwt',
          apikey: null,
          jwt: 'Bearer jwt-with-sensitive-user',
        })
        await next()
      },
      parseBody: async (c: { req: { json: () => Promise<unknown> } }) => await c.req.json(),
      simpleError: (errorCode: string, message: string) => {
        throw new HTTPException(400, { message, cause: { error: errorCode } })
      },
      useCors: async (_c: unknown, next: () => Promise<void>) => await next(),
    }))

    vi.doMock('../supabase/functions/_backend/utils/logging.ts', () => ({
      cloudlog: cloudlogMock,
    }))

    vi.doMock('../supabase/functions/_backend/utils/rbac.ts', () => ({
      checkPermission: checkPermissionMock,
    }))

    vi.doMock('../supabase/functions/_backend/utils/stripe.ts', () => ({
      createPortal: createPortalMock,
    }))

    vi.doMock('../supabase/functions/_backend/utils/supabase.ts', () => ({
      supabaseClient: supabaseClientMock,
    }))
  })

  afterEach(() => {
    mockedModules.forEach(path => vi.doUnmock(path))
    vi.resetModules()
  })

  it('does not log portal callback, org, user, or customer identifiers', async () => {
    const singleMock = vi.fn().mockResolvedValue({
      data: { customer_id: 'cus_sensitive_customer' },
      error: null,
    })
    const eqMock = vi.fn(() => ({ single: singleMock }))
    const selectMock = vi.fn(() => ({ eq: eqMock }))
    const fromMock = vi.fn(() => ({ select: selectMock }))

    supabaseClientMock.mockReturnValue({ from: fromMock })
    checkPermissionMock.mockResolvedValue(true)
    createPortalMock.mockResolvedValue({ url: 'https://billing.stripe.com/session_sensitive' })

    const { app: stripePortal } = await import('../supabase/functions/_backend/private/stripe_portal.ts')

    const response = await stripePortal.request('http://localhost/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        callbackUrl: 'https://app.capgo.app/billing?token=callback-secret',
        orgId: 'org-sensitive-id',
      }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ url: 'https://billing.stripe.com/session_sensitive' })
    expect(createPortalMock).toHaveBeenCalledWith(
      expect.anything(),
      'cus_sensitive_customer',
      'https://app.capgo.app/billing?token=callback-secret',
    )

    expect(cloudlogMock).toHaveBeenCalledWith({
      requestId: undefined,
      message: 'post stripe portal request',
      request: {
        hasCallbackUrl: true,
        hasOrgId: true,
      },
    })
    expect(cloudlogMock).toHaveBeenCalledWith({
      requestId: undefined,
      message: 'stripe portal auth context',
      auth: { authenticated: true },
    })
    expect(cloudlogMock).toHaveBeenCalledWith({
      requestId: undefined,
      message: 'stripe portal org lookup result',
      org: {
        found: true,
        hasCustomerId: true,
      },
    })

    const serializedLogs = JSON.stringify(cloudlogMock.mock.calls)
    expect(serializedLogs).not.toContain('callback-secret')
    expect(serializedLogs).not.toContain('org-sensitive-id')
    expect(serializedLogs).not.toContain('user-sensitive-id')
    expect(serializedLogs).not.toContain('cus_sensitive_customer')
  })
})
