import type { BentoTrackingPayload } from './tracking.ts'

/**
 * `capgo build init` wizard steps that mark the start / successful end of the
 * native-build credential setup. We emit a Bento signal event on each so a
 * later Bento automation can send a recovery email to people who started
 * (`welcome`) but never finished (`build-complete` suppresses the recovery).
 */
const MILESTONE_TO_BENTO_EVENT: Record<string, string> = {
  'welcome': 'builder_onboarding_started',
  'build-complete': 'builder_onboarding_completed',
}

/** Steps that should trigger the org/app lookup + Bento emit in the route. */
export const BUILDER_RECOVERY_MILESTONES: ReadonlySet<string> = new Set(Object.keys(MILESTONE_TO_BENTO_EVENT))

export interface BuilderOnboardingBentoInput {
  /** The incoming tracking event name (must be 'Builder Onboarding Step'). */
  event: string
  /** tags.step from the wizard. */
  step: string | undefined
  orgId: string | undefined
  appId: string | undefined
  /** tags.platform ('ios' | 'android'); defaults to 'unknown' when absent. */
  platform: string | undefined
  orgName: string | undefined
  appName: string | undefined
}

/**
 * Pure: decide whether this onboarding step should emit a Bento signal event,
 * and build its payload. Returns undefined when nothing should be emitted.
 * Personalization is intentionally minimal for now: app_name + platform.
 */
export function buildBuilderOnboardingBentoEvent(input: BuilderOnboardingBentoInput): BentoTrackingPayload | undefined {
  if (input.event !== 'Builder Onboarding Step')
    return undefined
  if (!input.step || !input.orgId || !input.appId)
    return undefined

  const bentoEvent = MILESTONE_TO_BENTO_EVENT[input.step]
  if (!bentoEvent)
    return undefined

  const platform = input.platform ?? 'unknown'

  return {
    // Mirrors the existing onboarding-step-done block: '* * * * *' lets the
    // notifications table + uniqId dedupe the signal without hard-blocking it.
    cron: '* * * * *',
    event: bentoEvent,
    // Dedicated key — independent from the OTA 'onboarding' preference.
    preferenceKey: 'builder_onboarding',
    // One signal per app+platform+phase, so repeated `welcome` hits within a
    // window collapse to a single "started" signal.
    uniqId: `${bentoEvent}:${input.appId}:${platform}`,
    data: {
      org_id: input.orgId,
      org_name: input.orgName ?? '',
      app_id: input.appId,
      app_name: input.appName ?? '',
      platform,
      step: input.step,
    },
  }
}
