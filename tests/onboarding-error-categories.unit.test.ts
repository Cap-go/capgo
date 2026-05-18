import { describe, expect, it } from 'vitest'
import { CertificateLimitError } from '../cli/src/build/onboarding/apple-api.ts'
import { mapIosOnboardingError } from '../cli/src/build/onboarding/error-categories.ts'

describe('mapIosOnboardingError', () => {
  it.concurrent('maps 401 from App Store Connect to apple_api_unauthorized', () => {
    const err = Object.assign(new Error('Unauthorized'), { status: 401 })
    expect(mapIosOnboardingError(err)).toBe('apple_api_unauthorized')
  })

  it.concurrent('maps 429 to apple_api_rate_limited', () => {
    const err = Object.assign(new Error('Too many'), { status: 429 })
    expect(mapIosOnboardingError(err)).toBe('apple_api_rate_limited')
  })

  it.concurrent('maps CertificateLimitError instances to cert_limit_reached', () => {
    expect(mapIosOnboardingError(new CertificateLimitError([]))).toBe('cert_limit_reached')
  })

  it.concurrent('maps profile creation failures to profile_creation_failed', () => {
    const err = Object.assign(new Error('Profile create failed'), { phase: 'profile' as const })
    expect(mapIosOnboardingError(err)).toBe('profile_creation_failed')
  })

  it.concurrent('maps P8 read errors to p8_invalid', () => {
    const err = Object.assign(new Error('Cannot parse P8'), { phase: 'p8' as const })
    expect(mapIosOnboardingError(err)).toBe('p8_invalid')
  })

  it.concurrent('returns unknown for anything else', () => {
    expect(mapIosOnboardingError(new Error('something else'))).toBe('unknown')
    expect(mapIosOnboardingError('a string')).toBe('unknown')
    expect(mapIosOnboardingError(undefined)).toBe('unknown')
  })
})
