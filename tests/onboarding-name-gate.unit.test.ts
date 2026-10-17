import { describe, expect, it } from 'vitest'
import { needsInitialOnboardingName, PROFILE_ONBOARDING_HANDOFF_KEY, readProfileOnboardingHandoff } from '../src/utils/onboardingProfile'
import { AB_TESTS_CONFIG, createABTestAssignments } from '../supabase/functions/_backend/utils/ab_tests'

describe('required initial onboarding name', () => {
  it.each([['', ''], ['Alice', ''], ['', 'Smith'], [' ', 'Smith']])('requires both saved names (%s, %s)', (first_name, last_name) => {
    expect(needsInitialOnboardingName({ first_name, last_name, onboarding: { version: 6 } })).toBe(true)
  })
  it('preserves complete profiles, invitations and legacy cohorts', () => {
    expect(needsInitialOnboardingName({ first_name: 'Alice', last_name: 'Smith', onboarding: { version: 6 } })).toBe(false)
    expect(needsInitialOnboardingName({ created_via_invite: true, onboarding: { version: 6 } })).toBe(false)
    for (const version of [4, 5, '5.C', undefined])
      expect(needsInitialOnboardingName({ onboarding: { version } })).toBe(false)
    expect(needsInitialOnboardingName(undefined)).toBe(false)
    expect(needsInitialOnboardingName({ onboarding: { version: 6 } }, true)).toBe(false)
  })
  it('allocates every new V6 self-signup without enrolling existing cohorts or invitees', () => {
    const config = { onboarding_v6: AB_TESTS_CONFIG.onboarding_v6 }
    expect(config.onboarding_v6.treatment_percentage).toBe(100)
    for (const random of [0, 0.5, 0.999999]) {
      expect(createABTestAssignments({ created_via_invite: false, onboarding_version: 6 }, config, () => random).onboarding_v6.branch).toBe('A')
      expect(createABTestAssignments({ created_via_invite: true, onboarding_version: 6 }, config, () => random)).toEqual({})
    }
    for (const onboarding_version of [undefined, 4, 5])
      expect(createABTestAssignments({ created_via_invite: false, onboarding_version }, config)).toEqual({})
  })
  it('carries the same attempt and run into the app onboarding funnel', () => {
    const identity = { attemptId: 'attempt', runId: 'run' }
    expect(readProfileOnboardingHandoff({ [PROFILE_ONBOARDING_HANDOFF_KEY]: identity })).toEqual(identity)
    expect(readProfileOnboardingHandoff(null)).toBeNull()
    expect(readProfileOnboardingHandoff({ [PROFILE_ONBOARDING_HANDOFF_KEY]: { attemptId: 1 } })).toBeNull()
  })
})
