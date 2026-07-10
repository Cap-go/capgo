import type { AndroidOnboardingProgress } from '../cli/src/build/onboarding/android/types.ts'
import { describe, expect, it } from 'vitest'
import { getAndroidResumeStep } from '../cli/src/build/onboarding/android/progress.ts'

// ─── Test fixture helpers ───────────────────────────────────────────
//
// Built compositionally so each test makes the minimum-relevant
// progress shape and the failure-localization on assertions stays
// clear: if `withFullKeystore(emptyProgress())` resumes to the wrong
// step, the offending field is unambiguous.

function emptyProgress(): AndroidOnboardingProgress {
  return {
    platform: 'android',
    appId: 'com.test.app',
    startedAt: '2026-05-21T00:00:00.000Z',
    completedSteps: {},
  }
}

function withFullKeystore(p: AndroidOnboardingProgress): AndroidOnboardingProgress {
  // `keystoreFullyValid` requires the marker AND all three ephemeral
  // fields. Helper sets them all so resume always passes the keystore
  // gate and tests focus on Phase 2+.
  return {
    ...p,
    keystoreAlias: 'release',
    keystoreStorePassword: 'pw',
    _keystoreBase64: 'base64-data',
    completedSteps: {
      ...p.completedSteps,
      keystoreReady: {
        keystorePath: 'release.p12',
        alias: 'release',
        isGenerated: true,
      },
    },
  }
}

function withGoogleSignIn(p: AndroidOnboardingProgress): AndroidOnboardingProgress {
  return {
    ...p,
    _oauthRefreshToken: 'refresh-token',
    completedSteps: {
      ...p.completedSteps,
      googleSignInComplete: {
        email: 'user@example.com',
        googleSubject: 'subject-123',
        scope: 'androidpublisher cloud-platform',
      },
    },
  }
}

function withPackageChosen(p: AndroidOnboardingProgress): AndroidOnboardingProgress {
  return {
    ...p,
    completedSteps: {
      ...p.completedSteps,
      androidPackageChosen: {
        packageName: 'com.test.app',
        source: 'gradle',
      },
    },
  }
}

// ─── Base routing ───────────────────────────────────────────────────

describe('getAndroidResumeStep — base routing', () => {
  it('returns welcome for null progress', () => {
    expect(getAndroidResumeStep(null)).toBe('welcome')
  })

  it('returns keystore-method-select when keystore is not started', () => {
    expect(getAndroidResumeStep(emptyProgress())).toBe('keystore-method-select')
  })
})

// ─── Legacy progress (backward compatibility contract) ──────────────
//
// Progress files created before the service-account fork existed have
// no `serviceAccountMethod` field. The compatibility contract: route
// them onto the existing OAuth path so in-flight onboardings continue
// where they were. Don't drop legacy users into the new fork.

describe('getAndroidResumeStep — legacy progress (no serviceAccountMethod)', () => {
  it('legacy progress with only keystore done routes to google-sign-in', () => {
    // No serviceAccountMethod → fall through to the OAuth-path rules.
    // !googleSignInComplete → google-sign-in. This is the contract.
    const p = withFullKeystore(emptyProgress())
    expect(getAndroidResumeStep(p)).toBe('google-sign-in')
  })

  it('legacy progress past google-sign-in continues to play-developer-id-input', () => {
    const p = withGoogleSignIn(withFullKeystore(emptyProgress()))
    expect(getAndroidResumeStep(p)).toBe('play-developer-id-input')
  })

  it('re-runs google-sign-in if the marker exists but the refresh token is missing', () => {
    // Defensive: a partial completion that lost the refresh token can't
    // mint new access tokens, so the rest of the OAuth chain would fail.
    // Treat it as never-signed-in.
    const p = withFullKeystore(emptyProgress())
    p.completedSteps.googleSignInComplete = {
      email: 'user@example.com',
      googleSubject: 'subject-123',
      scope: 'androidpublisher cloud-platform',
    }
    // Note: no _oauthRefreshToken
    expect(getAndroidResumeStep(p)).toBe('google-sign-in')
  })
})

// ─── Import path (serviceAccountMethod === 'existing') ──────────────

describe('getAndroidResumeStep — import path', () => {
  it('routes to android-package-select first if no package chosen yet', () => {
    // Package name is needed for the edits.insert validation probe.
    // Until we have it, the import path can't proceed past file pick.
    const p = withFullKeystore(emptyProgress())
    p.serviceAccountMethod = 'existing'
    expect(getAndroidResumeStep(p)).toBe('android-package-select')
  })

  it('routes to sa-json-existing-path after package chosen but no file picked', () => {
    const p = withPackageChosen(withFullKeystore(emptyProgress()))
    p.serviceAccountMethod = 'existing'
    expect(getAndroidResumeStep(p)).toBe('sa-json-existing-path')
  })

  it('routes to sa-json-validating after file picked but not yet accepted', () => {
    const p = withPackageChosen(withFullKeystore(emptyProgress()))
    p.serviceAccountMethod = 'existing'
    p.serviceAccountJsonPath = '/path/to/sa.json'
    expect(getAndroidResumeStep(p)).toBe('sa-json-validating')
  })

  it('routes to saving-credentials once the SA key bytes are accepted', () => {
    // `_serviceAccountKeyBase64` is set by EITHER a successful validation
    // OR the user picking "save anyway" on the failure recovery screen.
    // Both should converge to saving-credentials so we don't re-run
    // validation pointlessly on resume.
    const p = withPackageChosen(withFullKeystore(emptyProgress()))
    p.serviceAccountMethod = 'existing'
    p.serviceAccountJsonPath = '/path/to/sa.json'
    p._serviceAccountKeyBase64 = 'base64-sa-bytes'
    expect(getAndroidResumeStep(p)).toBe('saving-credentials')
  })

  it('honors save-anyway resume even with serviceAccountValidationSkipped=true', () => {
    // The skipped flag drives a banner log at save time; it must NOT
    // affect routing. The key bytes are the source of truth.
    const p = withPackageChosen(withFullKeystore(emptyProgress()))
    p.serviceAccountMethod = 'existing'
    p.serviceAccountJsonPath = '/path/to/sa.json'
    p._serviceAccountKeyBase64 = 'base64-sa-bytes'
    p.serviceAccountValidationSkipped = true
    expect(getAndroidResumeStep(p)).toBe('saving-credentials')
  })
})

// ─── Generate path (serviceAccountMethod === 'generate') ────────────

describe('getAndroidResumeStep — generate path', () => {
  it("'generate' explicitly set falls through to the OAuth-path rules", () => {
    const p = withFullKeystore(emptyProgress())
    p.serviceAccountMethod = 'generate'
    // Same as the legacy case but with an explicit marker — should still
    // land on google-sign-in because no OAuth steps are done.
    expect(getAndroidResumeStep(p)).toBe('google-sign-in')
  })

  it("'generate' continues to play-developer-id-input after sign-in", () => {
    const p = withGoogleSignIn(withFullKeystore(emptyProgress()))
    p.serviceAccountMethod = 'generate'
    expect(getAndroidResumeStep(p)).toBe('play-developer-id-input')
  })
})
