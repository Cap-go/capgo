import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  cloudlogMock,
  fetchMock,
} = vi.hoisted(() => ({
  cloudlogMock: vi.fn(),
  fetchMock: vi.fn(),
}))

vi.mock('../supabase/functions/_backend/utils/logging.ts', () => ({
  cloudlog: cloudlogMock,
}))

function createContext() {
  return {
    get: (key: string) => key === 'requestId' ? 'request-id' : undefined,
  } as any
}

beforeEach(() => {
  cloudlogMock.mockReset()
  fetchMock.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('captcha log redaction', () => {
  it('logs only metadata for successful captcha responses', async () => {
    const { verifyCaptchaToken } = await import('../supabase/functions/_backend/utils/captcha.ts')
    fetchMock.mockResolvedValue({
      json: vi.fn().mockResolvedValue({
        action: 'signup',
        cdata: 'raw-cdata-value',
        challenge_ts: '2026-05-11T00:00:00Z',
        hostname: 'tenant.capgo.app',
        success: true,
        token: 'turnstile-response-token',
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await verifyCaptchaToken(createContext(), 'turnstile-response-token', 'turnstile-secret-key')

    const serializedLogs = JSON.stringify(cloudlogMock.mock.calls)

    expect(fetchMock).toHaveBeenCalledWith(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      expect.objectContaining({
        body: expect.any(URLSearchParams),
        method: 'POST',
      }),
    )
    expect(cloudlogMock).toHaveBeenCalledWith({
      requestId: 'request-id',
      context: 'captcha_result',
      captchaResult: {
        parsed: true,
        success: true,
      },
    })
    expect(serializedLogs).not.toContain('raw-cdata-value')
    expect(serializedLogs).not.toContain('tenant.capgo.app')
    expect(serializedLogs).not.toContain('turnstile-response-token')
    expect(serializedLogs).not.toContain('turnstile-secret-key')
  })

  it('logs only metadata before rejecting failed captcha responses', async () => {
    const { verifyCaptchaToken } = await import('../supabase/functions/_backend/utils/captcha.ts')
    fetchMock.mockResolvedValue({
      json: vi.fn().mockResolvedValue({
        'error-codes': ['invalid-input-response'],
        'success': false,
        'token': 'failed-turnstile-response-token',
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      verifyCaptchaToken(createContext(), 'failed-turnstile-response-token', 'turnstile-secret-key'),
    ).rejects.toThrow('Invalid captcha result')

    const serializedLogs = JSON.stringify(cloudlogMock.mock.calls)

    expect(cloudlogMock).toHaveBeenCalledWith({
      requestId: 'request-id',
      context: 'captcha_result',
      captchaResult: {
        parsed: true,
        success: false,
      },
    })
    expect(serializedLogs).not.toContain('invalid-input-response')
    expect(serializedLogs).not.toContain('failed-turnstile-response-token')
    expect(serializedLogs).not.toContain('turnstile-secret-key')
  })
})
