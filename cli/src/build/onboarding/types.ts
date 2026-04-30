// src/build/onboarding/types.ts

export type Platform = 'ios' | 'android'

export type OnboardingStep
  = | 'welcome'
    | 'platform-select'
    | 'adding-platform'
    | 'credentials-exist'
    | 'backing-up'
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
