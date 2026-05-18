// src/build/onboarding/types.ts

export type Platform = 'ios' | 'android'

export type OnboardingStep
  = | 'welcome'
    | 'platform-select'
    | 'adding-platform'
    | 'credentials-exist'
    | 'backing-up'
    // ── Setup-method fork (macOS only) ──
    | 'setup-method-select'
    // ── Import-existing sub-flow (macOS only) ──
    | 'import-scanning'
    | 'import-distribution-mode'
    | 'import-pick-identity'
    | 'import-pick-profile'
    | 'import-no-match-recovery'
    | 'import-fetching-profile'
    | 'import-create-profile-only'
    | 'import-export-warning'
    | 'import-compiling-helper'
    | 'import-exporting'
    // ── Existing create-new sub-flow (and ASC API key step reused by import for app_store) ──
    | 'api-key-instructions'
    | 'p8-method-select'
    | 'input-p8-path'
    | 'input-key-id'
    | 'input-issuer-id'
    | 'verifying-key'
    | 'creating-certificate'
    | 'cert-limit-prompt'
    | 'revoking-certificate'
    | 'creating-profile'
    | 'duplicate-profile-prompt'
    | 'deleting-duplicate-profiles'
    | 'saving-credentials'
    | 'ask-build'
    | 'requesting-build'
    | 'build-complete'
    | 'no-platform'
    | 'error'

export type OnboardingErrorCategory
  = | 'apple_api_unauthorized'
    | 'apple_api_rate_limited'
    | 'cert_limit_reached'
    | 'profile_creation_failed'
    | 'p8_invalid'
    | 'unknown'

export interface ApiKeyData {
  keyId: string
  issuerId: string
}

export interface CertificateData {
  certificateId: string
  expirationDate: string
  teamId: string
  p12Base64: string
}

export interface ProfileData {
  profileId: string
  profileName: string
  profileBase64: string
}

export interface OnboardingProgress {
  platform: Platform
  appId: string
  startedAt: string
  /** Path to the .p8 file on disk (content is NOT stored, only the path) */
  p8Path?: string
  /** Partial input — saved incrementally so resume works mid-flow */
  keyId?: string
  issuerId?: string
  /**
   * Records which fork the user picked at `setup-method-select`. Crucial for
   * resume — without this, a partial import-flow run would resume at
   * `creating-certificate` (the create-new path) and immediately hit the
   * Apple cert-limit error.
   *
   * Absent on legacy progress files (created before this field existed) →
   * resume defaults to `create-new` for backward compatibility.
   */
  setupMethod?: 'create-new' | 'import-existing'
  /**
   * Records the distribution mode picked at `import-distribution-mode`.
   *
   * Persisted (not derived from .p8 presence) because ad_hoc users can
   * legitimately enter a one-shot .p8 during no-match recovery, which would
   * otherwise make .p8-presence-implies-app_store an incorrect heuristic. On
   * resume the UI hydrates `importDistribution` from this field so the
   * `verifying-key` branch and `doSaveCredentials` route correctly.
   *
   * Only meaningful when `setupMethod === 'import-existing'`.
   */
  importDistribution?: 'app_store' | 'ad_hoc'
  completedSteps: {
    apiKeyVerified?: ApiKeyData
    certificateCreated?: CertificateData
    profileCreated?: ProfileData
  }
  /** Temporary — wiped after .p12 creation */
  _privateKeyPem?: string
}

/** Maps each step to a progress percentage (0-100) */
export const STEP_PROGRESS: Record<OnboardingStep, number> = {
  'welcome': 0,
  'platform-select': 0,
  'adding-platform': 0,
  'credentials-exist': 0,
  'backing-up': 0,
  // Import-existing sub-flow (re-ordered: distribution-mode first)
  'setup-method-select': 5,
  'import-scanning': 10,
  'import-distribution-mode': 15,
  'import-pick-identity': 40,
  'import-pick-profile': 55,
  'import-no-match-recovery': 55,
  'import-fetching-profile': 60,
  'import-create-profile-only': 60,
  'import-export-warning': 70,
  'import-compiling-helper': 72,
  'import-exporting': 75,
  // Create-new sub-flow
  'api-key-instructions': 5,
  'p8-method-select': 8,
  'input-p8-path': 10,
  'input-key-id': 12,
  'input-issuer-id': 18,
  'verifying-key': 25,
  'creating-certificate': 45,
  'cert-limit-prompt': 45,
  'revoking-certificate': 48,
  'creating-profile': 65,
  'duplicate-profile-prompt': 65,
  'deleting-duplicate-profiles': 68,
  'saving-credentials': 80,
  'ask-build': 85,
  'requesting-build': 90,
  'build-complete': 100,
  'no-platform': 0,
  'error': 0,
}

export function getPhaseLabel(step: OnboardingStep): string {
  switch (step) {
    case 'welcome':
    case 'platform-select':
    case 'adding-platform':
    case 'credentials-exist':
    case 'backing-up':
      return ''
    case 'setup-method-select':
      return 'Setup method'
    case 'import-scanning':
      return 'Step 1 of 4 · Scanning your Mac'
    case 'import-distribution-mode':
      return 'Step 1 of 4 · Distribution mode'
    case 'import-pick-identity':
      return 'Step 2 of 4 · Choose certificate'
    case 'import-pick-profile':
      return 'Step 3 of 4 · Choose provisioning profile'
    case 'import-no-match-recovery':
      return 'Step 3 of 4 · No matching profile — recover'
    case 'import-fetching-profile':
      return 'Step 3 of 4 · Fetching profile from Apple'
    case 'import-create-profile-only':
      return 'Step 3 of 4 · Creating profile via Apple'
    case 'import-export-warning':
    case 'import-compiling-helper':
    case 'import-exporting':
      return 'Step 4 of 4 · Export from Keychain'
    case 'api-key-instructions':
    case 'p8-method-select':
    case 'input-p8-path':
    case 'input-key-id':
    case 'input-issuer-id':
    case 'verifying-key':
      return 'Step 1 of 4 · App Store Connect API Key'
    case 'creating-certificate':
    case 'cert-limit-prompt':
    case 'revoking-certificate':
      return 'Step 2 of 4 · Distribution Certificate'
    case 'creating-profile':
    case 'duplicate-profile-prompt':
    case 'deleting-duplicate-profiles':
      return 'Step 3 of 4 · Provisioning Profile'
    case 'saving-credentials':
    case 'ask-build':
    case 'requesting-build':
      return 'Step 4 of 4 · Save & Build'
    case 'build-complete':
      return 'Complete'
    case 'no-platform':
    case 'error':
      return ''
  }
}
