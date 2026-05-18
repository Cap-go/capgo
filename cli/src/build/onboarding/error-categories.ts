import type { AndroidOnboardingErrorCategory } from './android/types.js'
import type { OnboardingErrorCategory } from './types.js'
import { MissingScopesError } from './android/oauth-google.js'
import { CertificateLimitError } from './apple-api.js'

interface MaybeStatus {
  status?: unknown
}

interface MaybePhase {
  phase?: string
}

function getStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object')
    return undefined
  const candidate = (error as MaybeStatus).status
  return typeof candidate === 'number' ? candidate : undefined
}

function getPhase(error: unknown): string | undefined {
  if (!error || typeof error !== 'object')
    return undefined
  const candidate = (error as MaybePhase).phase
  return typeof candidate === 'string' ? candidate : undefined
}

export function mapIosOnboardingError(error: unknown): OnboardingErrorCategory {
  if (error instanceof CertificateLimitError)
    return 'cert_limit_reached'

  const status = getStatus(error)
  if (status === 401)
    return 'apple_api_unauthorized'
  if (status === 429)
    return 'apple_api_rate_limited'

  const phase = getPhase(error)
  if (phase === 'profile')
    return 'profile_creation_failed'
  if (phase === 'p8')
    return 'p8_invalid'

  return 'unknown'
}

export function mapAndroidOnboardingError(error: unknown): AndroidOnboardingErrorCategory {
  // MissingScopesError has no `phase` property, so the instanceof check must
  // precede the phase-based dispatching below.
  if (error instanceof MissingScopesError)
    return 'google_oauth_failed'

  const phase = getPhase(error)
  if (phase === 'keystore')
    return 'keystore_invalid'
  if (phase === 'oauth')
    return 'google_oauth_failed'
  if (phase === 'play_account_id')
    return 'play_account_id_invalid'

  return 'unknown'
}
