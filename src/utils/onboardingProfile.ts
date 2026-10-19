import type { Json } from '~/types/supabase.types'
import type { OnboardingAnalyticsStep } from '~/utils/onboardingProgressAnalytics'
import { hasNewChannelTreatment, hasProfileOnboarding, hasWebNativeDevelopmentEnvironmentTreatment } from '~/utils/onboardingABTests'

interface OnboardingProfileUser {
  first_name?: string | null
  last_name?: string | null
  created_via_invite?: boolean
  onboarding: Json
}

export const PROFILE_ONBOARDING_HANDOFF_KEY = 'capgoProfileOnboardingHandoff'

export function needsInitialOnboardingName(user: OnboardingProfileUser | null | undefined, hasOrganizations = false): boolean {
  if (hasOrganizations || !user || user.created_via_invite || !hasProfileOnboarding(user.onboarding))
    return false
  const onboarding = user.onboarding && typeof user.onboarding === 'object' && !Array.isArray(user.onboarding) ? user.onboarding : {}
  const confirmedAt = onboarding.profile_completed_at
  return !user.first_name?.trim() || !user.last_name?.trim()
    || typeof confirmedAt !== 'string' || !Number.isFinite(Date.parse(confirmedAt))
}

export function readProfileOnboardingHandoff(state: unknown): { attemptId: string, runId: string } | null {
  if (!state || typeof state !== 'object')
    return null
  const handoff = (state as Record<string, unknown>)[PROFILE_ONBOARDING_HANDOFF_KEY]
  if (!handoff || typeof handoff !== 'object')
    return null
  const { attemptId, runId } = handoff as Record<string, unknown>
  return typeof attemptId === 'string' && typeof runId === 'string' ? { attemptId, runId } : null
}

export function consumeProfileOnboardingHandoff(history: Pick<History, 'state' | 'replaceState'>): { attemptId: string, runId: string } | null {
  const handoff = readProfileOnboardingHandoff(history.state)
  if (handoff) {
    const { [PROFILE_ONBOARDING_HANDOFF_KEY]: _consumed, ...rest } = history.state as Record<string, unknown>
    history.replaceState(rest, '')
  }
  return handoff
}

export function initialProfileOnboardingSteps(onboarding: unknown, showWelcome: boolean): OnboardingAnalyticsStep[] {
  return [
    'name',
    ...(showWelcome ? ['welcome' as const] : []),
    'intent',
    ...(hasWebNativeDevelopmentEnvironmentTreatment(onboarding) ? ['publish_app_question' as const] : []),
    'app_name',
    'app_id',
    'app_icon',
    'organization',
    ...(hasNewChannelTreatment(onboarding) ? ['channel' as const] : []),
    'setup',
  ]
}
