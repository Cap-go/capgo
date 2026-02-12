import type { Context } from 'hono'
import { simpleError } from './hono.ts'
import { cloudlogErr } from './logging.ts'

type CreditPlan = { credit_id: string | null } | null

export async function getFallbackCreditProductId(
  c: Context,
  customerId: string,
  fetchPlan: () => Promise<CreditPlan>,
): Promise<string> {
  let fallbackPlan: CreditPlan = null
  let fallbackError: unknown | null = null

  try {
    fallbackPlan = await fetchPlan()
  }
  catch (error) {
    fallbackError = error
  }

  if (!fallbackPlan?.credit_id) {
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'credit_fallback_plan_missing',
      customerId,
      error: fallbackError,
    })
    throw simpleError('credit_product_not_configured', 'Credit product is not configured')
  }

  return fallbackPlan.credit_id
}
