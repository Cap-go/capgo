import { describe, expect, it } from 'vitest'
import { redactQueryParams, redactUrl } from '../supabase/functions/_backend/utils/log_redaction.ts'

describe('redactQueryParams', () => {
  it('redacts api_key', () => {
    const result = redactQueryParams({ api_key: 'super-secret-key', page: '1' })
    expect(result.api_key).toBe('[REDACTED]')
    expect(result.page).toBe('1')
  })

  it('redacts apikey (no underscore)', () => {
    const result = redactQueryParams({ apikey: 'my-api-key', limit: '10' })
    expect(result.apikey).toBe('[REDACTED]')
    expect(result.limit).toBe('10')
  })

  it('redacts capgkey', () => {
    const result = redactQueryParams({ capgkey: 'capgo-secret', version: '1.0.0' })
    expect(result.capgkey).toBe('[REDACTED]')
    expect(result.version).toBe('1.0.0')
  })

  it('redacts access_token', () => {
    const result = redactQueryParams({ access_token: 'tok-abc123', app_id: 'com.example' })
    expect(result.access_token).toBe('[REDACTED]')
    expect(result.app_id).toBe('com.example')
  })

  it('redacts token', () => {
    const result = redactQueryParams({ token: 'secret-tok' })
    expect(result.token).toBe('[REDACTED]')
  })

  it('redacts password', () => {
    const result = redactQueryParams({ password: 'hunter2', username: 'alice' })
    expect(result.password).toBe('[REDACTED]')
    expect(result.username).toBe('alice')
  })

  it('redacts secret', () => {
    const result = redactQueryParams({ secret: 'my-secret' })
    expect(result.secret).toBe('[REDACTED]')
  })

  it('redacts key', () => {
    const result = redactQueryParams({ key: 'private-key-value' })
    expect(result.key).toBe('[REDACTED]')
  })

  it('redacts refresh_token', () => {
    const result = redactQueryParams({ refresh_token: 'rt-abc', org_id: 'org-123' })
    expect(result.refresh_token).toBe('[REDACTED]')
    expect(result.org_id).toBe('org-123')
  })

  it('is case-insensitive for key names', () => {
    const result = redactQueryParams({ API_KEY: 'sensitive', Token: 'tok', PAGE: '2' })
    expect(result.API_KEY).toBe('[REDACTED]')
    expect(result.Token).toBe('[REDACTED]')
    expect(result.PAGE).toBe('2')
  })

  it('preserves non-sensitive params', () => {
    const params = { app_id: 'com.example.app', platform: 'ios', version: '1.2.3', page: '5', limit: '20' }
    const result = redactQueryParams(params)
    expect(result).toEqual(params)
  })

  it('returns empty object for empty input', () => {
    expect(redactQueryParams({})).toEqual({})
  })

  it('does not mutate the original object', () => {
    const original = { api_key: 'secret', page: '1' }
    const copy = { ...original }
    redactQueryParams(original)
    expect(original).toEqual(copy)
  })
})

describe('redactUrl', () => {
  it('redacts api_key in URL query string', () => {
    const url = 'https://api.capgo.app/channel?api_key=super-secret&app_id=com.example'
    const result = redactUrl(url)
    expect(result).not.toContain('super-secret')
    expect(result).toContain('[REDACTED]')
    expect(result).toContain('app_id=com.example')
  })

  it('redacts token in URL query string', () => {
    const url = 'https://api.capgo.app/device?token=tok-abc&platform=ios'
    const result = redactUrl(url)
    expect(result).not.toContain('tok-abc')
    expect(result).toContain('[REDACTED]')
    expect(result).toContain('platform=ios')
  })

  it('preserves URL with no sensitive params unchanged', () => {
    const url = 'https://api.capgo.app/stats?app_id=com.test&platform=android&version=1.0.0'
    const result = redactUrl(url)
    expect(result).toBe(url)
  })

  it('preserves the path and non-sensitive query params', () => {
    const url = 'https://api.capgo.app/not-found/path?api_key=secret&page=3&limit=10'
    const result = redactUrl(url)
    expect(result).toContain('/not-found/path')
    expect(result).toContain('page=3')
    expect(result).toContain('limit=10')
    expect(result).not.toContain('secret')
  })

  it('handles URL with no query string', () => {
    const url = 'https://api.capgo.app/channel'
    expect(redactUrl(url)).toBe(url)
  })

  it('handles unparsable URL gracefully', () => {
    const bad = 'not-a-url'
    expect(redactUrl(bad)).toBe(bad)
  })

  it('redacts presigned S3-style params', () => {
    const url = 'https://bucket.s3.amazonaws.com/file.zip?X-Amz-Signature=abc123&X-Amz-Algorithm=AWS4&response-expires=3600'
    const result = redactUrl(url)
    expect(result).not.toContain('abc123')
    expect(result).toContain('[REDACTED]')
    expect(result).toContain('X-Amz-Algorithm=AWS4')
  })

  it('redacts multiple sensitive params in one URL', () => {
    const url = 'https://example.com/api?api_key=k1&token=t1&secret=s1&app_id=myapp'
    const result = redactUrl(url)
    expect(result).not.toContain('k1')
    expect(result).not.toContain('t1')
    expect(result).not.toContain('s1')
    expect(result).toContain('app_id=myapp')
    expect(result.match(/\[REDACTED\]/g)?.length).toBe(3)
  })
})
