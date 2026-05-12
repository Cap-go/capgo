import { describe, expect, it } from 'vitest'
import {
  sanitizeSensitiveFromString,
  sanitizeSensitiveHeaders,
} from '../supabase/functions/_backend/utils/discord_sanitization.ts'

function sampleValue(prefix: string) {
  return `${prefix}-${'x'.repeat(16)}`
}

describe('Discord alert sanitization', () => {
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
})
