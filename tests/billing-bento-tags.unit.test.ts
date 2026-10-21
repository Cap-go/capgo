import { describe, expect, it } from 'vitest'
import { applyDirectOfferBentoTags, buildBillingPlanBentoTags } from '../supabase/functions/_backend/utils/billing_bento_tags.ts'

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

  it.concurrent('tags direct-offer users offer=direct and never adds trial tags', () => {
    expect(applyDirectOfferBentoTags(buildBillingPlanBentoTags('Solo', 'trial'), true)).toEqual({
      segments: ['offer=direct'],
      deleteSegments: ['trial-plan:Solo'],
    })
    expect(applyDirectOfferBentoTags({
      segments: ['capgo', 'onboarded', 'trial', 'trial0'],
      deleteSegments: ['trial7', 'trial1', 'paying'],
    }, true)).toEqual({
      segments: ['capgo', 'onboarded', 'offer=direct'],
      deleteSegments: ['trial7', 'trial1', 'paying', 'trial', 'trial0'],
    })
  })

  it.concurrent('leaves standard users untouched', () => {
    const tags = buildBillingPlanBentoTags('Solo', 'trial')
    expect(applyDirectOfferBentoTags(tags, false)).toBe(tags)
    expect(applyDirectOfferBentoTags(tags, false)).toEqual({ segments: ['trial-plan:Solo'], deleteSegments: [] })
  })
})
