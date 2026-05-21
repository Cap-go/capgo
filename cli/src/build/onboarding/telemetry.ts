import type { AndroidOnboardingErrorCategory, AndroidOnboardingStep } from './android/types.js'
import type { OnboardingErrorCategory, OnboardingStep, Platform } from './types.js'
import { sendEvent } from '../../utils.js'
import { mapAndroidOnboardingError, mapIosOnboardingError } from './error-categories.js'

export interface TrackBuilderOnboardingStepInput {
  apikey: string
  appId: string
  orgId: string
  platform: Platform
  step: OnboardingStep | AndroidOnboardingStep
  durationMs?: number
  /** Raw caught error — mapped via the platform's category mapper. Use this OR errorCategory, not both. */
  error?: unknown
  /** Pre-computed category. Takes precedence over `error` if both are present. */
  errorCategory?: OnboardingErrorCategory | AndroidOnboardingErrorCategory
}

export async function trackBuilderOnboardingStep(input: TrackBuilderOnboardingStepInput): Promise<void> {
  const tags: Record<string, string> = {
    step: input.step,
    platform: input.platform,
    app_id: input.appId,
  }

  if (typeof input.durationMs === 'number' && Number.isFinite(input.durationMs))
    tags.duration_ms = String(Math.round(input.durationMs))

  if (input.errorCategory !== undefined) {
    tags.error_category = input.errorCategory
  }
  else if (input.error !== undefined) {
    tags.error_category = input.platform === 'ios'
      ? mapIosOnboardingError(input.error)
      : mapAndroidOnboardingError(input.error)
  }

  try {
    await sendEvent(input.apikey, {
      event: 'Builder Onboarding Step',
      channel: 'builder-onboarding',
      icon: '🧭',
      notify: false,
      user_id: input.orgId,
      tags,
    })
  }
  catch {
    // Telemetry must never break the wizard. sendEvent already swallows
    // fetch failures internally; this catch covers anything else.
  }
}
