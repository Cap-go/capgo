import { describe, expect, it } from 'vitest'
import { createABTestAssignments, resolveABTestAssignments, validateABTestsConfig } from '../supabase/functions/_backend/utils/ab_test_allocation'
import rawConfig from '../supabase/functions/_backend/utils/ab_tests.json'

const name = 'onboarding_v6'
const config = validateABTestsConfig(rawConfig)
const enabled = { [name]: config[name] }
const disabled = { [name]: { ...config[name], treatment_percentage: 0 } }
const cohortStart = config[name].enroll_new_users_after!
const newSignupAt = new Date(Date.parse(cohortStart) + 1000).toISOString()
const assignment = { branch: 'A', assigned_at: '2026-10-19T11:00:00.000Z' }
function signup(extra = {}) {
  return {
    id: 'new-signup',
    created_at: newSignupAt,
    created_via_invite: false,
    abtests_enrolled: [name],
    ...extra,
  }
}

describe('onboarding V6 rollout', () => {
  it('enrolls all eligible new signups without a control or version prerequisite', () => {
    expect(config[name]).toMatchObject({ audience: 'self_signup', treatment_percentage: 100, allocation: 'deterministic', assign_control: false })
    expect(config[name]).not.toHaveProperty('onboarding_version')
    for (let index = 0; index < 100; index++)
      expect(createABTestAssignments(signup({ id: `signup-${index}` }), config)[name]?.branch).toBe('A')
  })

  it('removes stale assignments while disabled', () => {
    const result = resolveABTestAssignments(signup(), { [name]: assignment }, disabled)
    expect(result.assignments).not.toHaveProperty(name)
    expect(result.nextAssignments).not.toHaveProperty(name)
  })

  it('can enroll self-signups without an onboarding version or selected intent when enabled', () => {
    for (let index = 0; index < 100; index++)
      expect(createABTestAssignments(signup({ id: `signup-${index}` }), enabled)[name]?.branch).toBe('A')
  })

  it.each([
    { created_via_invite: true },
    { abtests_enrolled: [] },
    { created_at: '2026-01-01T00:00:00.000Z' },
  ])('does not enroll invited or legacy accounts when enabled: %j', (extra) => {
    expect(createABTestAssignments(signup(extra), enabled)).not.toHaveProperty(name)
  })

  it('excludes already-enrolled accounts created before the new rollout cutoff', () => {
    const beforeRollout = signup({ created_at: new Date(Date.parse(cohortStart) - 1).toISOString() })
    expect(resolveABTestAssignments(beforeRollout, { [name]: assignment }, enabled).assignments).not.toHaveProperty(name)
    expect(createABTestAssignments(signup({ created_at: cohortStart }), enabled)[name]?.branch).toBe('A')
  })

  it('keeps enabled assignments stable across lookups', () => {
    expect(resolveABTestAssignments(signup(), { [name]: assignment }, enabled).assignments[name]).toEqual(assignment)
  })
})
