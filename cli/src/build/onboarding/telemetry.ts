import type { AndroidOnboardingStep } from './android/types.js'
import type { OnboardingStep, Platform } from './types.js'
import process from 'node:process'
import { sendEvent } from '../../utils.js'
import { mapAndroidOnboardingError, mapIosOnboardingError } from './error-categories.js'

export interface TrackBuilderOnboardingStepInput {
  apikey: string
  appId: string
  orgId: string
  platform: Platform
  step: OnboardingStep | AndroidOnboardingStep
  durationMs?: number
  error?: unknown
}

function isTruthyEnv(value: string | undefined): boolean {
  return value === '1' || value?.toLowerCase() === 'true' || value?.toLowerCase() === 'yes'
}

function telemetryDisabled(): boolean {
  return isTruthyEnv(process.env.CAPGO_DISABLE_TELEMETRY)
    || isTruthyEnv(process.env.CAPGO_DISABLE_POSTHOG)
}

export async function trackBuilderOnboardingStep(input: TrackBuilderOnboardingStepInput): Promise<void> {
  if (telemetryDisabled())
    return

  const tags: Record<string, string> = {
    step: input.step,
    platform: input.platform,
    app_id: input.appId,
  }

  if (typeof input.durationMs === 'number' && Number.isFinite(input.durationMs))
    tags.duration_ms = String(Math.round(input.durationMs))

  if (input.error !== undefined) {
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
