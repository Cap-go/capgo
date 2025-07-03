import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { simpleError, useCors } from '../utils/hono.ts'
import { supabaseAdmin } from '../utils/supabase.ts'

interface CreditStep {
  id: number
  step_min: number
  step_max: number
  price_per_unit: number
  type: string
  unit_factor: number
  stripe_id?: string | null
  created_at: string
  updated_at: string
}

interface CostCalculationRequest {
  mau: number
  bandwidth: number // in bytes
  storage: number // in bytes
}

interface TierUsage {
  tier_id: number
  step_min: number
  step_max: number
  unit_factor: number
  units_used: number // billing units (GB for bandwidth/storage, count for MAU)
  price_per_unit: number // Price per billing unit
  cost: number
}

interface MetricBreakdown {
  cost: number
  tiers: TierUsage[]
}

interface CostCalculationResponse {
  total_cost: number
  breakdown: {
    mau: MetricBreakdown
    bandwidth: MetricBreakdown
    storage: MetricBreakdown
  }
  usage: {
    mau: number
    bandwidth: number
    storage: number
  }
}

export const app = new Hono<MiddlewareKeyVariables>()

app.use('/', useCors)

app.get('/', async (c) => {
  try {
    const { data: credits } = await supabaseAdmin(c)
      .from('capgo_credits_steps')
      .select()
      .order('price_per_unit')
    return c.json(credits ?? [])
  }
  catch (e) {
    throw simpleError('failed_to_fetch_pricing_data', 'Failed to fetch pricing data', {}, e)
  }
})

app.post('/', async (c) => {
  const body = await c.req.json<CostCalculationRequest>()
    .catch((e) => {
      throw simpleError('invalid_json_body', 'Invalid JSON body', { e })
    })
  const { mau, bandwidth, storage } = body

  // Validate inputs
  if (mau === undefined || bandwidth === undefined || storage === undefined) {
    throw simpleError('missing_required_fields', 'Missing required fields: mau, bandwidth, storage')
  }

  // Get pricing steps from database
  const { data: credits, error } = await supabaseAdmin(c)
    .from('capgo_credits_steps')
    .select()
    .order('type, step_min')

  if (error || !credits) {
    throw simpleError('failed_to_fetch_pricing_data', 'Failed to fetch pricing data')
  }

  // Type assertion for credits
  const typedCredits = credits as CreditStep[]

  // Calculate cost for each metric type with tier breakdown
  const calculateMetricCost = (value: number, type: string): MetricBreakdown => {
    if (value <= 0)
      return { cost: 0, tiers: [] }

    const applicableSteps = typedCredits.filter(credit => credit.type === type)
    const tiersUsed: TierUsage[] = []
    let remainingValue = value
    let totalCost = 0

    for (const step of applicableSteps) {
      const stepMin = step.step_min
      const stepMax = step.step_max
      const unitFactor = step.unit_factor || 1

      if (remainingValue > 0 && value >= stepMin) {
        const tierUsageBytes = Math.min(remainingValue, stepMax - stepMin)

        // Convert using unit_factor and round up for pricing
        const tierUsage = Math.ceil(tierUsageBytes / unitFactor)
        const tierCost = tierUsage * step.price_per_unit

        tiersUsed.push({
          tier_id: step.id,
          step_min: stepMin,
          step_max: stepMax,
          unit_factor: step.unit_factor || 1,
          units_used: tierUsage,
          price_per_unit: step.price_per_unit,
          cost: tierCost,
        })

        totalCost += tierCost
        remainingValue -= tierUsageBytes

        if (remainingValue <= 0)
          break
      }
    }

    // If there's still remaining value, use the highest tier
    if (remainingValue > 0) {
      const highestStep = applicableSteps[applicableSteps.length - 1]
      if (highestStep) {
        const unitFactor = highestStep.unit_factor || 1

        // Convert using unit_factor and round up
        const tierUsage = Math.ceil(remainingValue / unitFactor)
        const tierCost = tierUsage * highestStep.price_per_unit

        const stepMin = highestStep.step_min

        tiersUsed.push({
          tier_id: highestStep.id,
          step_min: stepMin,
          step_max: highestStep.step_max,
          unit_factor: highestStep.unit_factor || 1,
          units_used: tierUsage,
          price_per_unit: highestStep.price_per_unit,
          cost: tierCost,
        })

        totalCost += tierCost
      }
    }

    return { cost: totalCost, tiers: tiersUsed }
  }

  // Calculate costs
  const mauResult = calculateMetricCost(mau, 'mau')
  const bandwidthResult = calculateMetricCost(bandwidth, 'bandwidth')
  const storageResult = calculateMetricCost(storage, 'storage')

  const totalCost = mauResult.cost + bandwidthResult.cost + storageResult.cost

  const response: CostCalculationResponse = {
    total_cost: totalCost,
    breakdown: {
      mau: mauResult,
      bandwidth: bandwidthResult,
      storage: storageResult,
    },
    usage: {
      mau,
      bandwidth,
      storage,
    },
  }

  return c.json(response)
})
