import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { executeSQL, getBaseData, getSupabaseClient, postUpdate, resetAndSeedAppData, resetAppData } from './test-utils.ts'

describe('plugin plan gating: credits flag', () => {
  const supabase = getSupabaseClient()
  const orgId = randomUUID()
  const stripeCustomerId = `cus_missing_stripe_${orgId.replaceAll('-', '')}`
  const appId = `com.test.credits_flag.${orgId.replaceAll('-', '')}`

  beforeAll(async () => {
    await resetAndSeedAppData(appId, { orgId, stripeCustomerId })

    // Force the "plan" branch to fail: buildPlanValidationExpression joins stripe_info by customer_id.
    // Use direct SQL to avoid any RLS/service-key issues accidentally leaving the org "plan_valid".
    await executeSQL(
      'UPDATE public.stripe_info SET status = $1, is_good_plan = $2, trial_at = $3 WHERE customer_id = $4',
      ['canceled', false, '1970-01-01T00:00:00+00:00', stripeCustomerId],
    )

    // Ensure default state is "no credits flag".
    await executeSQL('UPDATE public.orgs SET has_usage_credits = false WHERE id = $1', [orgId])

    // Sanity checks: if these don't apply, the test may silently become a no-op and pass/fail randomly.
    const stripeRows = await executeSQL('SELECT status, is_good_plan, trial_at FROM public.stripe_info WHERE customer_id = $1', [stripeCustomerId])
    expect(stripeRows[0]?.status).toBe('canceled')
    expect(stripeRows[0]?.is_good_plan).toBe(false)
    const orgRows = await executeSQL('SELECT has_usage_credits FROM public.orgs WHERE id = $1', [orgId])
    expect(orgRows[0]?.has_usage_credits).toBe(false)
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

    await executeSQL('UPDATE public.orgs SET has_usage_credits = true WHERE id = $1', [orgId])

    const responseAllowed = await postUpdate({
      ...baseData,
      // Avoid any device-side caching behavior by changing device id.
      device_id: randomUUID().toLowerCase(),
    })
    expect(responseAllowed.status).toBe(200)
  })
})
