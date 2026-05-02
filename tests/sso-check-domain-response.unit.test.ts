import { describe, expect, it, vi } from 'vitest'

const rpcMock = vi.fn()

vi.mock('../supabase/functions/_backend/utils/logging.ts', () => ({
  cloudlog: () => {},
  cloudlogErr: () => {},
  serializeError: (error: unknown) => String(error),
}))

vi.mock('../supabase/functions/_backend/utils/supabase.ts', () => ({
  supabaseAdmin: () => ({
    rpc: rpcMock,
  }),
}))

describe('sso check-domain response shape', () => {
  it('does not expose internal org or provider identifiers to anonymous callers', async () => {
    vi.resetModules()
    rpcMock.mockImplementation((functionName: string) => {
      if (functionName === 'get_sso_enforcement_by_domain') {
        return Promise.resolve({
          data: [{
            enforce_sso: true,
            org_id: '00000000-0000-4000-8000-000000000001',
            provider_id: '00000000-0000-4000-8000-000000000002',
          }],
          error: null,
        })
      }

      if (functionName === 'check_domain_sso') {
        return Promise.resolve({
          data: [{
            has_sso: true,
            org_id: '00000000-0000-4000-8000-000000000001',
            provider_id: '00000000-0000-4000-8000-000000000003',
          }],
          error: null,
        })
      }

      return Promise.resolve({ data: null, error: null })
    })

    const { app } = await import('../supabase/functions/_backend/private/sso/check-domain.ts')

    const response = await app.request('http://sso.test/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'cf-connecting-ip': '203.0.113.10',
      },
      body: JSON.stringify({ email: 'user@example.com' }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      has_sso: true,
      enforce_sso: true,
    })
  })
})
