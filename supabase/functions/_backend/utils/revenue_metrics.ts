import type { Database } from './supabase.types.ts'

type PlanRow = Database['public']['Tables']['plans']['Row']
type StripeInfoRow = Database['public']['Tables']['stripe_info']['Row']

export type StripeInfoRevenueState = {
  is_good_plan?: boolean | null
  paid_at?: string | null
  price_id?: string | null
  product_id?: string | null
  status?: Database['public']['Enums']['stripe_status'] | null
} | null | undefined

export type RevenuePlanRow = Pick<PlanRow, 'price_m' | 'price_m_id' | 'price_y' | 'price_y_id' | 'stripe_id'>

export interface RevenueMovement {
  currentMrr: number
  nextMrr: number
  newBusinessMrr: number
  expansionMrr: number
  contractionMrr: number
  churnMrr: number
}

export interface DailyRevenueChangeSummary {
  churnMrr: number
  contractionMrr: number
  expansionMrr: number
}

const ZERO_REVENUE_MOVEMENT: RevenueMovement = {
  currentMrr: 0,
  nextMrr: 0,
  newBusinessMrr: 0,
  expansionMrr: 0,
  contractionMrr: 0,
  churnMrr: 0,
}

export function getRevenueMetricDateId(targetDate = new Date()) {
  return new Date(Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate())).toISOString().slice(0, 10)
}

export function getEventDateId(eventOccurredAtIso: string) {
  return new Date(eventOccurredAtIso).toISOString().slice(0, 10)
}

export function getPreviousDateId(dateId: string) {
  const target = new Date(`${dateId}T00:00:00.000Z`)
  target.setUTCDate(target.getUTCDate() - 1)
  return getRevenueMetricDateId(target)
}

function getPlanMrr(plan: RevenuePlanRow | null | undefined, priceId: string | null | undefined) {
  if (!plan || !priceId)
    return 0

  if (plan.price_m_id === priceId)
    return Number(plan.price_m) || 0

  if (plan.price_y_id === priceId)
    return (Number(plan.price_y) || 0) / 12

  return 0
}

function getPlanByProductId(plans: RevenuePlanRow[], productId: string | null | undefined) {
  if (!productId)
    return null

  return plans.find(plan => plan.stripe_id === productId) ?? null
}

export function getSubscriptionMrr(plans: RevenuePlanRow[], stripeInfo: StripeInfoRevenueState) {
  if (!stripeInfo || stripeInfo.status !== 'succeeded' || stripeInfo.is_good_plan === false)
    return 0

  return getPlanMrr(getPlanByProductId(plans, stripeInfo.product_id), stripeInfo.price_id)
}

export function classifyRevenueMovement(
  currentStripeInfo: StripeInfoRevenueState,
  nextStripeInfo: StripeInfoRevenueState,
  plans: RevenuePlanRow[],
): RevenueMovement {
  const currentMrr = getSubscriptionMrr(plans, currentStripeInfo)
  const nextMrr = getSubscriptionMrr(plans, nextStripeInfo)

  if (currentMrr === 0 && nextMrr === 0)
    return { ...ZERO_REVENUE_MOVEMENT }

  if (currentMrr === 0 && nextMrr > 0) {
    if (!currentStripeInfo?.paid_at) {
      return {
        ...ZERO_REVENUE_MOVEMENT,
        currentMrr,
        nextMrr,
        newBusinessMrr: nextMrr,
      }
    }

    return {
      ...ZERO_REVENUE_MOVEMENT,
      currentMrr,
      nextMrr,
      expansionMrr: nextMrr,
    }
  }

  if (currentMrr > 0 && nextMrr === 0) {
    return {
      ...ZERO_REVENUE_MOVEMENT,
      currentMrr,
      nextMrr,
      churnMrr: currentMrr,
    }
  }

  if (nextMrr > currentMrr) {
    return {
      ...ZERO_REVENUE_MOVEMENT,
      currentMrr,
      nextMrr,
      expansionMrr: nextMrr - currentMrr,
    }
  }

  if (currentMrr > nextMrr) {
    return {
      ...ZERO_REVENUE_MOVEMENT,
      currentMrr,
      nextMrr,
      contractionMrr: currentMrr - nextMrr,
    }
  }

  return {
    ...ZERO_REVENUE_MOVEMENT,
    currentMrr,
    nextMrr,
  }
}

export function hasRevenueMovement(movement: RevenueMovement) {
  return movement.newBusinessMrr > 0
    || movement.expansionMrr > 0
    || movement.contractionMrr > 0
    || movement.churnMrr > 0
}

export function isStaleStripeEvent(
  currentStripeInfo: Pick<StripeInfoRow, 'last_stripe_event_at'> | null | undefined,
  eventOccurredAtIso: string,
) {
  if (!currentStripeInfo?.last_stripe_event_at)
    return false

  return new Date(currentStripeInfo.last_stripe_event_at).getTime() > new Date(eventOccurredAtIso).getTime()
}

export function calculateNrr(previousMrr: number, dailyChanges: DailyRevenueChangeSummary) {
  if (previousMrr <= 0)
    return 100

  const retainedMrr = Math.max(
    previousMrr - dailyChanges.churnMrr - dailyChanges.contractionMrr + dailyChanges.expansionMrr,
    0,
  )

  return Number(((retainedMrr / previousMrr) * 100).toFixed(2))
}

export function calculateChurnRevenue(dailyChanges: DailyRevenueChangeSummary) {
  return Number((dailyChanges.churnMrr + dailyChanges.contractionMrr).toFixed(2))
}
