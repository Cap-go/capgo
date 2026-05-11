import { describe, expect, it } from 'vitest'

import { redactQueryForLog, redactUrlForLog } from '../supabase/functions/_backend/utils/log_redaction.ts'

describe('hono log redaction', () => {
  it.concurrent('redacts sensitive query parameters before logging', () => {
    expect(redactQueryForLog({
      access_token: 'access-token-value',
      refresh_token: 'refresh-token-value',
      apikey: 'api-key-value',
      code: 'auth-code-value',
      page: '2',
    })).toEqual({
      access_token: '[REDACTED]',
      refresh_token: '[REDACTED]',
      apikey: '[REDACTED]',
      code: '[REDACTED]',
      page: '2',
    })
  })

  it.concurrent('redacts sensitive URL query parameters before logging', () => {
    const redacted = redactUrlForLog('https://api.capgo.test/private?refresh_token=refresh-token-value&page=2')

    expect(redacted).not.toContain('refresh-token-value')
    expect(redacted).toContain('refresh_token=%5BREDACTED%5D')
    expect(redacted).toContain('page=2')
  })

  it.concurrent('redacts sensitive key format variations', () => {
    expect(redactQueryForLog({
      'API_KEY': 'api-key-value',
      'api-key-token': 'mixed-separator-value',
      'apiKey': 'camel-case-value',
      'bearer-token': 'bearer-token-value',
      'client_secret': 'client-secret-value',
      'jwtToken': 'jwt-token-value',
      'oauth_code': 'oauth-code-value',
    })).toEqual({
      'API_KEY': '[REDACTED]',
      'api-key-token': '[REDACTED]',
      'apiKey': '[REDACTED]',
      'bearer-token': '[REDACTED]',
      'client_secret': '[REDACTED]',
      'jwtToken': '[REDACTED]',
      'oauth_code': '[REDACTED]',
    })
  })

  it.concurrent('preserves non-sensitive partial key matches', () => {
    expect(redactQueryForLog({
      codename: 'project-x',
      keyword: 'search-term',
      somecodeParam: 'non-secret-code-label',
    })).toEqual({
      codename: 'project-x',
      keyword: 'search-term',
      somecodeParam: 'non-secret-code-label',
    })
  })

  it.concurrent('handles empty queries and invalid URLs', () => {
    expect(redactQueryForLog({})).toEqual({})
    expect(redactUrlForLog('not-a-valid-url')).toBe('not-a-valid-url')
    expect(redactUrlForLog('http://[::1')).toBe('http://[::1')
  })
})
