import { afterEach, describe, expect, it, vi } from 'vitest'
import { sendDiscordAlert500 } from '../supabase/functions/_backend/utils/discord.ts'
import {
  sanitizeSensitiveFromString,
  sanitizeSensitiveHeaders,
} from '../supabase/functions/_backend/utils/discord_sanitization.ts'

function sampleValue(prefix: string) {
  return `${prefix}-${'x'.repeat(16)}`
}

describe('Discord alert sanitization', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('removes password-like JSON fields and redacts token-like JSON fields', () => {
    const accessToken = sampleValue('access-token')
    const passwordConfirmation = sampleValue('confirmation')
    const refreshToken = sampleValue('refresh-token')
    const sessionKey = sampleValue('session-key')
    const sanitized = sanitizeSensitiveFromString(
      JSON.stringify({
        access_token: accessToken,
        nested: {
          password_confirm: passwordConfirmation,
          refreshToken,
          session_key: sessionKey,
        },
        safe: 'visible',
      }),
    )

    expect(sanitized).toContain('"safe":"visible"')
    expect(sanitized).toContain('"access_token":"acce...xxxx"')
    expect(sanitized).toContain('"refreshToken":"refr...xxxx"')
    expect(sanitized).toContain('"session_key":"sess...xxxx"')
    expect(sanitized).not.toContain(accessToken)
    expect(sanitized).not.toContain(refreshToken)
    expect(sanitized).not.toContain(sessionKey)
    expect(sanitized).not.toContain('password_confirm')
    expect(sanitized).not.toContain(passwordConfirmation)
  })

  it('redacts sensitive query parameters in non-JSON bodies', () => {
    const accessToken = sampleValue('access-token')
    const refreshToken = sampleValue('refresh-token')
    const sanitized = sanitizeSensitiveFromString(
      `redirect=/login?access_token=${accessToken}&refresh_token=${refreshToken}&next=/dashboard`,
    )

    expect(sanitized).toContain('redirect=/login?access_token=acce...xxxx')
    expect(sanitized).toContain('&refresh_token=refr...xxxx')
    expect(sanitized).toContain('&next=/dashboard')
    expect(sanitized).not.toContain(accessToken)
    expect(sanitized).not.toContain(refreshToken)
  })

  it('does not throw on malformed encoded sensitive query parameters', () => {
    const sanitized = sanitizeSensitiveFromString(
      'redirect=/login?access_token=%E0%A4%A&next=/dashboard',
    )

    expect(sanitized).toContain('redirect=/login?access_token=')
    expect(sanitized).toContain('&next=/dashboard')
  })

  it('redacts token-like query parameters inside JSON string values', () => {
    const accessToken = sampleValue('access-token')
    const refreshToken = sampleValue('refresh-token')
    const sanitized = sanitizeSensitiveFromString(
      JSON.stringify({
        error: {
          message: `failed callback /login?access_token=${accessToken}`,
          stack: `Error: /login?refresh_token=${refreshToken}`,
        },
      }),
    )

    expect(sanitized).toContain('/login?access_token=acce...xxxx')
    expect(sanitized).toContain('/login?refresh_token=refr...xxxx')
    expect(sanitized).not.toContain(accessToken)
    expect(sanitized).not.toContain(refreshToken)
  })

  it('removes password-like headers and redacts token-like headers', () => {
    const authorization = sampleValue('Bearer')
    const sessionKey = sampleValue('session-key')
    const passwordConfirmation = sampleValue('confirmation')
    const sanitized = sanitizeSensitiveHeaders({
      Authorization: authorization,
      'x-session-key': sessionKey,
      'x-password-confirm': passwordConfirmation,
      'user-agent': 'vitest',
    })

    expect(sanitized.Authorization).toBe('Bear...xxxx')
    expect(sanitized['x-session-key']).toBe('sess...xxxx')
    expect(sanitized['user-agent']).toBe('vitest')
    expect(sanitized).not.toHaveProperty('x-password-confirm')
  })

  it('redacts sensitive query parameters from Discord request details URL', async () => {
    const accessToken = sampleValue('access-token')
    const requestUrl = `https://api.example.test/callback?access_token=${accessToken}&next=/dashboard`
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    const headers = new Headers({
      'user-agent': 'vitest',
    })
    const context = {
      env: {
        DISCORD_ALERT: 'https://discord.example.test/webhook',
        ENVIRONMENT: 'test',
      },
      get: (key: string) => key === 'requestId' ? 'request-1' : undefined,
      req: {
        method: 'GET',
        url: requestUrl,
        header: (key: string) => headers.get(key) ?? undefined,
        raw: { headers },
      },
    }

    await sendDiscordAlert500(context as any, 'callback', '{}', new Error('boom'))

    expect(fetchMock).toHaveBeenCalledOnce()
    const [, init] = fetchMock.mock.calls[0]
    const payload = JSON.parse(String((init as RequestInit).body))
    const requestDetails = payload.embeds[0].fields.find(
      (field: { name: string }) => field.name.includes('Request Details'),
    )?.value

    expect(requestDetails).toContain('access_token=acce...xxxx')
    expect(requestDetails).toContain('next=/dashboard')
    expect(JSON.stringify(payload)).not.toContain(accessToken)
  })
})
