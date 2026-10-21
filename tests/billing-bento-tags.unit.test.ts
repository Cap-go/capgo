import { describe, expect, it } from 'vitest'
import { buildBillingPlanBentoTags } from '../supabase/functions/_backend/utils/billing_bento_tags.ts'

describe('billing plan Bento tags', () => {
  it.concurrent.each([
    ['uses a distinct tag for the plan being trialed', 'Solo', 'trial', undefined, ['trial-plan:Solo'], []],
    ['replaces the trial-plan tag when the customer starts paying', 'Solo', 'paying', undefined, ['plan:Solo'], ['trial-plan:Solo', 'trial-card-on-file']],
    ['removes every possible trial plan when the customer starts paying', 'Maker', 'paying', ['Solo', 'Maker', 'Team'], ['plan:Maker'], ['trial-plan:Solo', 'trial-plan:Maker', 'trial-plan:Team', 'trial-card-on-file']],
    ['clears trial tags even when the current paid plan is unavailable', null, 'paying', ['Solo', 'Team'], [], ['trial-plan:Solo', 'trial-plan:Team', 'trial-card-on-file']],
    ['does not create a plan tag outside a trial or paid subscription', 'Solo', 'none', undefined, [], []],
  ] as const)('%s', (_label, plan, state, allPlans, segments, deleteSegments) => {
    expect(buildBillingPlanBentoTags(plan, state, allPlans as string[] | undefined)).toEqual({ segments, deleteSegments })
  })
})
