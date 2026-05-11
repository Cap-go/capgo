import { afterEach, describe, expect, it, vi } from 'vitest'

const { cloudlogErrMock } = vi.hoisted(() => ({
  cloudlogErrMock: vi.fn(),
}))

vi.mock('../supabase/functions/_backend/utils/logging.ts', () => ({
  cloudlog: vi.fn(),
  cloudlogErr: cloudlogErrMock,
}))

vi.mock('../supabase/functions/_backend/utils/utils.ts', () => ({
  getEnv: (_c: unknown, key: string) => {
    const env: Record<string, string> = {
      DISCORD_ALERT: 'https://discord.example/webhook',
      ENVIRONMENT: 'test',
    }
    return env[key] ?? ''
  },
}))

function createContext() {
  return {
    get: (key: string) => key === 'requestId' ? 'req-test' : undefined,
    req: {
      header: (key: string) => {
        const headers: Record<string, string> = {
          'user-agent': 'vitest',
          'cf-connecting-ip': '203.0.113.10',
        }
        return headers[key.toLowerCase()]
      },
      method: 'POST',
      raw: {
        headers: new Headers({
          'authorization': 'Bearer header-secret-token',
          'capgkey': 'header-capgkey-secret-value',
          'content-type': 'application/json',
          'x-api-key': 'header-api-key-value',
        }),
      },
      url: 'https://api.example/functions/v1/test?access_token=url-access-secret-value&password=url-password-secret-value&safe=kept',
    },
  } as any
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  cloudlogErrMock.mockReset()
})

describe('discord 500 alert redaction', () => {
  it('redacts token-like request body fields before posting alert payloads', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const { sendDiscordAlert500 } = await import('../supabase/functions/_backend/utils/discord.ts')
    const error = Object.assign(new Error('boom access_token=message-access-secret-value authorization: message-authorization-secret-value'), {
      api_key: 'object-api-key-secret-value',
    })
    error.stack = 'Error: boom\n    refresh_token=stack-refresh-secret-value'

    await sendDiscordAlert500(createContext(), 'test_function', JSON.stringify({
      access_token: 'access-token-secret-value',
      captcha_token: 'captcha-token-secret-value',
      nested: {
        refresh_token: 'refresh-token-secret-value',
        token_hash: 'token-hash-secret-value',
      },
      password: 'super-secret-password',
      safe: 'kept',
    }), error)

    expect(fetchMock).toHaveBeenCalledOnce()
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const alertPayload = JSON.parse(String(init.body))
    const serializedPayload = JSON.stringify(alertPayload)

    expect(serializedPayload).not.toContain('access-token-secret-value')
    expect(serializedPayload).not.toContain('captcha-token-secret-value')
    expect(serializedPayload).not.toContain('refresh-token-secret-value')
    expect(serializedPayload).not.toContain('token-hash-secret-value')
    expect(serializedPayload).not.toContain('super-secret-password')
    expect(serializedPayload).not.toContain('url-access-secret-value')
    expect(serializedPayload).not.toContain('url-password-secret-value')
    expect(serializedPayload).not.toContain('message-access-secret-value')
    expect(serializedPayload).not.toContain('message-authorization-secret-value')
    expect(serializedPayload).not.toContain('stack-refresh-secret-value')
    expect(serializedPayload).not.toContain('object-api-key-secret-value')
    expect(serializedPayload).not.toContain('header-secret-token')
    expect(serializedPayload).not.toContain('header-api-key-value')
    expect(serializedPayload).not.toContain('header-capgkey-secret-value')
    expect(serializedPayload).toContain('acce...alue')
    expect(serializedPayload).toContain('capt...alue')
    expect(serializedPayload).toContain('refr...alue')
    expect(serializedPayload).toContain('toke...alue')
    expect(serializedPayload).toContain('safe')
    expect(serializedPayload).toContain('kept')
  })
})
