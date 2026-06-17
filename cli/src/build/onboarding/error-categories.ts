import type { AndroidOnboardingErrorCategory } from './android/types.js'
import type { OnboardingErrorCategory, OnboardingStep } from './types.js'
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

function getCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object')
    return undefined
  const candidate = (error as { code?: unknown }).code
  return typeof candidate === 'string' ? candidate : undefined
}

function getPhase(error: unknown): string | undefined {
  if (!error || typeof error !== 'object')
    return undefined
  const candidate = (error as MaybePhase).phase
  return typeof candidate === 'string' ? candidate : undefined
}

export function mapIosOnboardingError(
  error: unknown,
  failedStep?: OnboardingStep,
): OnboardingErrorCategory {
  // Structural discriminators take precedence so an ASC API error thrown
  // during an import step (e.g. fetching a profile via the API) still maps
  // to the correct category instead of being shadowed by the step-derived
  // fallback below.
  if (error instanceof CertificateLimitError)
    return 'cert_limit_reached'

  const status = getStatus(error)
  const code = getCode(error)
  const message = error instanceof Error ? error.message : ''
  // A 403 carrying the agreements code is a VALID key blocked by an unsigned or
  // expired Apple agreement — keep it distinct from a genuine auth failure so the
  // UI can tell the user to sign the agreement rather than re-check the key.
  if (status === 403 && (code === 'FORBIDDEN.REQUIRED_AGREEMENTS_MISSING_OR_EXPIRED' || /required agreement/i.test(message)))
    return 'apple_agreements_missing'
  if (status === 401)
    return 'apple_api_unauthorized'
  if (status === 403)
    return 'apple_api_forbidden'
  if (status === 429)
    return 'apple_api_rate_limited'

  const phase = getPhase(error)
  if (phase === 'profile')
    return 'profile_creation_failed'
  if (phase === 'p8')
    return 'p8_invalid'

  // Import-flow step-derived categories. The import path throws
  // MacOSSigningError / generic Error without a `phase` or `status`
  // discriminator, so we derive the category from the step at which the
  // failure occurred.
  if (failedStep === 'import-scanning')
    return 'keychain_no_identities'
  if (failedStep === 'import-exporting')
    return 'keychain_export_failed'
  if (failedStep === 'import-provide-profile-path')
    return 'profile_read_failed'
  if (failedStep === 'import-pick-profile' || failedStep === 'import-no-match-recovery')
    return 'profile_no_match'

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

/**
 * Map a `ValidationResult.kind` from the SA-import validation module onto an
 * AndroidOnboardingErrorCategory so PostHog `Builder Onboarding Step` events
 * for `sa-json-validation-failed` carry an actionable failure dimension.
 *
 * Kept here (alongside `mapAndroidOnboardingError`) so the full SA-error
 * taxonomy lives in one place.
 */
export function mapSaValidationKindToCategory(
  kind: 'shape-error' | 'token-error' | 'no-app-access' | 'network-error',
): AndroidOnboardingErrorCategory {
  switch (kind) {
    case 'shape-error':
      return 'sa_json_shape_invalid'
    case 'token-error':
      return 'sa_json_token_rejected'
    case 'no-app-access':
      return 'sa_json_no_app_access'
    case 'network-error':
      return 'sa_json_network_error'
  }
}
