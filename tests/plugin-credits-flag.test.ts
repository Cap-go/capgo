import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getBaseData, getSupabaseClient, postUpdate, resetAndSeedAppData, resetAppData } from './test-utils.ts'

describe('plugin plan gating: credits flag', () => {
  const supabase = getSupabaseClient()
  const orgId = randomUUID()
  const stripeCustomerId = `cus_missing_stripe_${orgId.replaceAll('-', '')}`
  const appId = `com.test.credits_flag.${orgId.replaceAll('-', '')}`

  beforeAll(async () => {
    await resetAndSeedAppData(appId, { orgId, stripeCustomerId })

    // Force the "plan" branch to fail: buildPlanValidationExpression joins stripe_info by customer_id.
    // By making the subscription invalid and the trial expired, only the replicated org flag can
    // allow plugin access.
    await supabase
      .from('stripe_info')
      .update({
        status: 'canceled',
        is_good_plan: false,
        trial_at: '1970-01-01T00:00:00+00:00',
      })
      .eq('customer_id', stripeCustomerId)

    // Ensure default state is "no credits flag".
    await supabase.from('orgs').update({ has_usage_credits: false }).eq('id', orgId)
  })

  afterAll(async () => {
    await resetAppData(appId)
    await supabase.from('org_users').delete().eq('org_id', orgId)
    await supabase.from('orgs').delete().eq('id', orgId)
    await supabase.from('stripe_info').delete().eq('customer_id', stripeCustomerId)
  })

  it('allows /updates when has_usage_credits is true (replica-safe)', async () => {
    const baseData = getBaseData(appId)

    const responseBlocked = await postUpdate(baseData)
    expect(responseBlocked.status).toBe(429)
    const jsonBlocked = await responseBlocked.json<{ error?: string }>()
    expect(jsonBlocked.error).toBe('on_premise_app')

    const { error } = await supabase
      .from('orgs')
      .update({ has_usage_credits: true })
      .eq('id', orgId)
    expect(error).toBeNull()

    const responseAllowed = await postUpdate({
      ...baseData,
      // Avoid any device-side caching behavior by changing device id.
      device_id: randomUUID().toLowerCase(),
    })
    expect(responseAllowed.status).toBe(200)
  })
})
