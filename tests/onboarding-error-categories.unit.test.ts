import { describe, expect, it } from 'vitest'
import { MissingScopesError } from '../cli/src/build/onboarding/android/oauth-google.ts'
import { CertificateLimitError } from '../cli/src/build/onboarding/apple-api.ts'
import { mapAndroidOnboardingError, mapIosOnboardingError, mapSaValidationKindToCategory } from '../cli/src/build/onboarding/error-categories.ts'

describe('mapIosOnboardingError', () => {
  it.concurrent('maps 401 from App Store Connect to apple_api_unauthorized', () => {
    const err = Object.assign(new Error('Unauthorized'), { status: 401 })
    expect(mapIosOnboardingError(err)).toBe('apple_api_unauthorized')
  })

  it.concurrent('maps a 403 with the agreements code to apple_agreements_missing', () => {
    const err = Object.assign(
      new Error('Apple API error (403): A required agreement is missing or has expired. — sign it (FORBIDDEN.REQUIRED_AGREEMENTS_MISSING_OR_EXPIRED)'),
      { status: 403, code: 'FORBIDDEN.REQUIRED_AGREEMENTS_MISSING_OR_EXPIRED' },
    )
    expect(mapIosOnboardingError(err)).toBe('apple_agreements_missing')
  })

  it.concurrent('maps a 403 agreements error by message when no code is present', () => {
    const err = Object.assign(new Error('A required agreement is missing or has expired.'), { status: 403 })
    expect(mapIosOnboardingError(err)).toBe('apple_agreements_missing')
  })

  it.concurrent('maps the friendly agreement message to apple_agreements_missing even when status/code are stripped (real TUI flow)', () => {
    // The iOS TUI engine collapses the AppleApiHttpError to its message string and
    // reconstructs a plain Error(message) before mapping — no status/code survive.
    // The mapper must still classify it from the message alone, or PostHog records
    // 'unknown' for the exact scenario this whole feature targets.
    const reconstructed = new Error(
      'Apple is blocking App Store Connect API access because your developer account has a required agreement that is unsigned or has expired.\n'
      + '  - Sign in as the Account Holder at https://appstoreconnect.apple.com',
    )
    expect(mapIosOnboardingError(reconstructed, 'verifying-key')).toBe('apple_agreements_missing')
  })

  it.concurrent('does NOT classify an unrelated 403 that loosely mentions "agreement" as agreements-missing', () => {
    // The phrase requires "required agreement" adjacent to a signing/expiry word;
    // a generic mention must fall through to apple_api_forbidden.
    const err = Object.assign(new Error('Forbidden: your team agreement role is insufficient'), { status: 403 })
    expect(mapIosOnboardingError(err)).toBe('apple_api_forbidden')
  })

  it.concurrent('maps other 403s to apple_api_forbidden', () => {
    const err = Object.assign(new Error('Forbidden'), { status: 403 })
    expect(mapIosOnboardingError(err)).toBe('apple_api_forbidden')
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

  it.concurrent('maps import-scanning failures to keychain_no_identities', () => {
    expect(mapIosOnboardingError(new Error('no identities'), 'import-scanning')).toBe('keychain_no_identities')
  })

  it.concurrent('maps import-exporting failures to keychain_export_failed', () => {
    expect(mapIosOnboardingError(new Error('wrong password'), 'import-exporting')).toBe('keychain_export_failed')
  })

  it.concurrent('maps import-provide-profile-path failures to profile_read_failed', () => {
    // The 'import-fetching-profile' step was removed (commit 36a7c282)
    // alongside the Rescan recovery option; the .mobileprovision file
    // picker step 'import-provide-profile-path' replaces it for the
    // "read profile from disk" failure class — parse + 3 invariant
    // checks (bundle id, distribution, cert SHA1) + the generic catch
    // all surface here.
    expect(mapIosOnboardingError(new Error('fs error'), 'import-provide-profile-path')).toBe('profile_read_failed')
  })

  it.concurrent('maps import-pick-profile and import-no-match-recovery to profile_no_match', () => {
    expect(mapIosOnboardingError(new Error('no match'), 'import-pick-profile')).toBe('profile_no_match')
    expect(mapIosOnboardingError(new Error('no match'), 'import-no-match-recovery')).toBe('profile_no_match')
  })

  it.concurrent('structural discriminators take precedence over failedStep', () => {
    // Even if failedStep is an import step, a 401 still maps to apple_api_unauthorized
    // (e.g. the helper precompile or fetch could theoretically throw an ASC error).
    const err = Object.assign(new Error('Unauthorized'), { status: 401 })
    expect(mapIosOnboardingError(err, 'import-scanning')).toBe('apple_api_unauthorized')
  })

  it.concurrent('returns unknown for non-import failedStep with no structural discriminator', () => {
    expect(mapIosOnboardingError(new Error('???'), 'welcome')).toBe('unknown')
    expect(mapIosOnboardingError(new Error('???'), 'creating-certificate')).toBe('unknown')
  })

  it.concurrent('returns unknown when no failedStep and no structural discriminator', () => {
    expect(mapIosOnboardingError(new Error('something else'), undefined)).toBe('unknown')
  })
})

describe('mapAndroidOnboardingError', () => {
  it.concurrent('maps MissingScopesError to google_oauth_failed', () => {
    expect(mapAndroidOnboardingError(new MissingScopesError(['scope1'], ''))).toBe('google_oauth_failed')
  })

  it.concurrent('maps keystore parse failures to keystore_invalid', () => {
    const err = Object.assign(new Error('Bad keystore'), { phase: 'keystore' as const })
    expect(mapAndroidOnboardingError(err)).toBe('keystore_invalid')
  })

  it.concurrent('maps oauth token failures to google_oauth_failed', () => {
    const err = Object.assign(new Error('Token refresh failed'), { phase: 'oauth' as const })
    expect(mapAndroidOnboardingError(err)).toBe('google_oauth_failed')
  })

  it.concurrent('maps play account id failures to play_account_id_invalid', () => {
    const err = Object.assign(new Error('Bad ID'), { phase: 'play_account_id' as const })
    expect(mapAndroidOnboardingError(err)).toBe('play_account_id_invalid')
  })

  it.concurrent('returns unknown for everything else', () => {
    expect(mapAndroidOnboardingError(new Error('???'))).toBe('unknown')
    expect(mapAndroidOnboardingError(null)).toBe('unknown')
  })
})

describe('mapSaValidationKindToCategory', () => {
  it.concurrent('maps shape-error to sa_json_shape_invalid', () => {
    expect(mapSaValidationKindToCategory('shape-error')).toBe('sa_json_shape_invalid')
  })

  it.concurrent('maps token-error to sa_json_token_rejected', () => {
    expect(mapSaValidationKindToCategory('token-error')).toBe('sa_json_token_rejected')
  })

  it.concurrent('maps no-app-access to sa_json_no_app_access', () => {
    expect(mapSaValidationKindToCategory('no-app-access')).toBe('sa_json_no_app_access')
  })

  it.concurrent('maps network-error to sa_json_network_error', () => {
    expect(mapSaValidationKindToCategory('network-error')).toBe('sa_json_network_error')
  })
})
