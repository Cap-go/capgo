import { describe, expect, it } from 'vitest'
import { getSsoLogMetadata } from '../supabase/functions/_backend/private/sso/logging.ts'

describe('SSO log redaction', () => {
  it.concurrent('summarizes SSO identifiers without logging raw values', () => {
    const summary = getSsoLogMetadata({
      authenticatedProviders: ['sso:provider-secret', 'email'],
      count: 12,
      domain: 'sensitive-company.example',
      email: 'owner@sensitive-company.example',
      enforceSso: true,
      error: {
        code: 'PGRST123',
        message: 'owner@sensitive-company.example failed',
        name: 'PostgrestError',
      },
      externalProviderId: 'provider-secret',
      ip: '203.0.113.10',
      orgId: '046a36ac-e03c-4590-9257-bd6c9dba9ee8',
      provider: 'sso:provider-secret',
      providerId: 'provider-secret',
      providers: ['email', 'sso:provider-secret'],
      status: 'active',
      userId: '86a84313-9b9f-46d0-9cbb-09d67f18c8f6',
    })

    expect(summary).toEqual({
      authenticatedProviderCount: 2,
      authenticatedSsoProviderCount: 1,
      enforceSso: true,
      errorCode: 'PGRST123',
      errorName: 'PostgrestError',
      hasDomain: true,
      hasEmail: true,
      hasError: true,
      hasExternalProviderId: true,
      hasIp: true,
      hasOrgId: true,
      hasProviderId: true,
      hasUserId: true,
      providerCount: 2,
      providerType: 'sso',
      requestCount: 12,
      ssoProviderCount: 1,
      status: 'active',
    })

    const serialized = JSON.stringify(summary)
    expect(serialized).not.toContain('owner@sensitive-company.example')
    expect(serialized).not.toContain('sensitive-company.example')
    expect(serialized).not.toContain('provider-secret')
    expect(serialized).not.toContain('203.0.113.10')
    expect(serialized).not.toContain('046a36ac-e03c-4590-9257-bd6c9dba9ee8')
    expect(serialized).not.toContain('86a84313-9b9f-46d0-9cbb-09d67f18c8f6')
    expect(serialized).not.toContain('failed')
  })

  it.concurrent('handles empty SSO log metadata without throwing', () => {
    expect(getSsoLogMetadata()).toMatchObject({
      authenticatedProviderCount: 0,
      authenticatedSsoProviderCount: 0,
      hasDomain: false,
      hasEmail: false,
      hasError: false,
      hasIp: false,
      hasOrgId: false,
      hasProviderId: false,
      hasUserId: false,
      providerCount: 0,
      ssoProviderCount: 0,
    })
  })
})
