import { describe, expect, it } from 'vitest'

import { normalizeWebsiteUrl } from '../supabase/functions/_backend/public/organization/website.ts'

describe('normalizeWebsiteUrl', () => {
  it('keeps explicit http and https urls', () => {
    expect(normalizeWebsiteUrl('https://example.com')).toBe('https://example.com/')
    expect(normalizeWebsiteUrl('http://example.com')).toBe('http://example.com/')
  })

  it('adds https to host and host:port inputs', () => {
    expect(normalizeWebsiteUrl('example.com')).toBe('https://example.com/')
    expect(normalizeWebsiteUrl('example.com:3000')).toBe('https://example.com:3000/')
  })

  it('rejects non-web schemes', () => {
    expect(() => normalizeWebsiteUrl('ftp://example.com')).toThrowError()
  })
})
