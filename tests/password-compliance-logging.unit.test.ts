import { describe, expect, it } from 'vitest'
import { getPasswordComplianceBodyLogMetadata, getPasswordComplianceSuccessLogMetadata } from '../supabase/functions/_backend/private/validate_password_compliance_logging.ts'

describe('password compliance logging metadata', () => {
  it('summarizes request bodies without retaining credentials or identifiers', () => {
    const metadata = getPasswordComplianceBodyLogMetadata({
      email: 'member@example.com',
      password: 'CorrectHorseBatteryStaple123!',
      org_id: '6f06fb67-b12e-4b20-b593-33b4f4411d09',
      captcha_token: 'turnstile-secret-token',
      unexpected: 'raw-extra-value',
    })

    expect(metadata).toEqual({
      bodyType: 'object',
      fieldCount: 5,
      hasEmail: true,
      hasPassword: true,
      hasOrgId: true,
      hasCaptchaToken: true,
    })

    const serialized = JSON.stringify(metadata)
    expect(serialized).not.toContain('member@example.com')
    expect(serialized).not.toContain('CorrectHorseBatteryStaple123!')
    expect(serialized).not.toContain('6f06fb67-b12e-4b20-b593-33b4f4411d09')
    expect(serialized).not.toContain('turnstile-secret-token')
    expect(serialized).not.toContain('raw-extra-value')
  })

  it('summarizes malformed request bodies without preserving raw values', () => {
    expect(getPasswordComplianceBodyLogMetadata(null)).toEqual({
      bodyType: 'object',
      fieldCount: 0,
      hasEmail: false,
      hasPassword: false,
      hasOrgId: false,
      hasCaptchaToken: false,
    })

    expect(getPasswordComplianceBodyLogMetadata(['member@example.com'])).toEqual({
      bodyType: 'array',
      fieldCount: 0,
      hasEmail: false,
      hasPassword: false,
      hasOrgId: false,
      hasCaptchaToken: false,
    })
  })

  it('does not retain user or organization identifiers in success metadata', () => {
    const metadata = getPasswordComplianceSuccessLogMetadata(
      '57a6fb0a-fc26-419d-aeb0-9f44f4d0b53a',
      '6f06fb67-b12e-4b20-b593-33b4f4411d09',
    )

    expect(metadata).toEqual({
      hasUserId: true,
      hasOrgId: true,
    })

    const serialized = JSON.stringify(metadata)
    expect(serialized).not.toContain('57a6fb0a-fc26-419d-aeb0-9f44f4d0b53a')
    expect(serialized).not.toContain('6f06fb67-b12e-4b20-b593-33b4f4411d09')
  })
})
