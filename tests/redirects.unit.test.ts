import { describe, expect, it } from 'vitest'

import { getSafeRedirectPath, isSafeRedirectPath } from '../src/services/redirects.ts'

describe('redirect path validation', () => {
  it.concurrent('accepts same-origin application paths', () => {
    expect(isSafeRedirectPath('/dashboard')).toBe(true)
    expect(isSafeRedirectPath('/settings/account?tab=security#email')).toBe(true)
  })

  it.concurrent('rejects absolute and protocol-relative targets', () => {
    expect(isSafeRedirectPath('https://example.com/phish')).toBe(false)
    expect(isSafeRedirectPath('//example.com/phish')).toBe(false)
    expect(isSafeRedirectPath('javascript:alert(1)')).toBe(false)
  })

  it.concurrent('rejects ambiguous browser-normalized targets', () => {
    expect(isSafeRedirectPath('/\\example.com/phish')).toBe(false)
    expect(isSafeRedirectPath('/dashboard\n//example.com')).toBe(false)
    expect(isSafeRedirectPath(' /dashboard')).toBe(false)
  })

  it.concurrent('falls back when a query redirect is unsafe', () => {
    expect(getSafeRedirectPath('//example.com/phish')).toBe('/dashboard')
    expect(getSafeRedirectPath('/settings/account')).toBe('/settings/account')
    expect(getSafeRedirectPath(undefined, '/login')).toBe('/login')
  })

  it.concurrent('blocks caller-specific redirect loops', () => {
    expect(getSafeRedirectPath('/onboarding/organization', '/login', {
      blockedPrefixes: ['/onboarding'],
    })).toBe('/login')
    expect(getSafeRedirectPath('/accountDisabled?restored=1', '/dashboard', {
      blockedPrefixes: ['/accountDisabled'],
    })).toBe('/dashboard')
  })
})
