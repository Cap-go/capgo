import { describe, expect, it, vi } from 'vitest'
import { hasProfileOnboarding, reconcileOnboardingABTestAssignments, resolveOnboardingAnalyticsVersion } from '../src/utils/onboardingABTests'
import { consumeProfileOnboardingHandoff, initialProfileOnboardingSteps, needsInitialOnboardingName, PROFILE_ONBOARDING_HANDOFF_KEY, readProfileOnboardingHandoff } from '../src/utils/onboardingProfile'

const abtests = { onboarding_v6: { branch: 'A' as const, assigned_at: '2026-10-19T11:00:00.000Z' } }
const onboarding = { abtests }

describe('required initial onboarding name', () => {
  it.each([['', ''], ['Alice', ''], ['', 'Smith'], [' ', 'Smith']])('requires both saved names for assigned users (%s, %s)', (first_name, last_name) => {
    expect(needsInitialOnboardingName({ first_name, last_name, onboarding })).toBe(true)
  })
  it('requires saved confirmation but excludes invitations and existing organization members', () => {
    expect(needsInitialOnboardingName({ first_name: 'Alice', last_name: 'Smith', onboarding })).toBe(true)
    expect(needsInitialOnboardingName({ first_name: 'Alice', last_name: 'Smith', onboarding: { ...onboarding, profile_completed_at: '2026-10-19T11:00:00Z' } })).toBe(false)
    expect(needsInitialOnboardingName({ created_via_invite: true, onboarding })).toBe(false)
    expect(needsInitialOnboardingName({ onboarding }, true)).toBe(false)
    expect(needsInitialOnboardingName(undefined)).toBe(false)
  })
  it.each([{}, { version: 6 }, { abtests: { onboarding_v6: { branch: 'B', assigned_at: '2026-10-19' } } }])('keeps V6 disabled without treatment A: %j', (disabled) => {
    expect(needsInitialOnboardingName({ onboarding: disabled })).toBe(false)
    expect(hasProfileOnboarding(disabled)).toBe(false)
    expect(resolveOnboardingAnalyticsVersion(disabled)).not.toBe(6)
  })
  it('tracks welcome before names and then the goal', () => {
    expect(initialProfileOnboardingSteps(onboarding, true)).toEqual(['welcome', 'name', 'intent', 'app_name', 'app_icon', 'organization', 'setup'])
  })
  it('shares the name, goal and app step order with combined onboarding flags', () => {
    expect(initialProfileOnboardingSteps({ abtests: { ...abtests, webnativeapp_development_environment: { branch: 'C' }, new_channel: { branch: 'A' } } }, true))
      .toEqual(['welcome', 'name', 'intent', 'publish_app_question', 'app_name', 'app_icon', 'organization', 'channel', 'setup'])
  })
  it('uses treatment A regardless of the legacy stored version', () => {
    expect(hasProfileOnboarding({ ...onboarding, version: 4 })).toBe(true)
    expect(resolveOnboardingAnalyticsVersion(onboarding)).toBe(6)
  })
  it('removes a stale treatment when the authoritative response omits it', () => {
    expect(reconcileOnboardingABTestAssignments(abtests, {})).toEqual({})
  })
  it('preserves the required name gate and V6 tracking while a forced refresh is pending or fails', () => {
    const retained = reconcileOnboardingABTestAssignments(abtests, {}, { authoritative: false })
    expect(retained).toEqual(abtests)
    const retainedOnboarding = { abtests: { onboarding_v6: { ...retained.onboarding_v6 } } }
    expect(needsInitialOnboardingName({ onboarding: retainedOnboarding })).toBe(true)
    expect(resolveOnboardingAnalyticsVersion(retainedOnboarding)).toBe(6)
    expect(reconcileOnboardingABTestAssignments(retained, {})).toEqual({})
  })
  it('consumes the handoff once so a refresh starts a new telemetry run', () => {
    const identity = { attemptId: 'attempt', runId: 'run' }
    let state: Record<string, unknown> = { position: 3, [PROFILE_ONBOARDING_HANDOFF_KEY]: identity }
    const history = {
      get state() {
        return state
      },
      replaceState: vi.fn((next: Record<string, unknown>) => {
        state = next
      }),
    }
    expect(consumeProfileOnboardingHandoff(history)).toEqual(identity)
    expect(state).toEqual({ position: 3 })
    expect(consumeProfileOnboardingHandoff(history)).toBeNull()
    expect(history.replaceState).toHaveBeenCalledTimes(1)
  })
  it('carries the same attempt and run into the app onboarding funnel', () => {
    const identity = { attemptId: 'attempt', runId: 'run' }
    expect(readProfileOnboardingHandoff({ [PROFILE_ONBOARDING_HANDOFF_KEY]: identity })).toEqual(identity)
    expect(readProfileOnboardingHandoff(null)).toBeNull()
    expect(readProfileOnboardingHandoff({ [PROFILE_ONBOARDING_HANDOFF_KEY]: { attemptId: 1 } })).toBeNull()
  })
})
