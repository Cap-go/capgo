import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { bytesToGb } from '../utils/conversion.ts'
import { useCors } from '../utils/hono.ts'
import { supabaseAdmin } from '../utils/supabase.ts'

interface CostCalculationRequest {
  mau: number
  bandwidth: number // in bytes
  storage: number // in bytes
}

interface TierUsage {
  tier_id: number
  range: string
  units_used: number // GB for bandwidth/storage, count for MAU
  price_per_unit: number // Price per GB for bandwidth/storage, price per unit for MAU
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
    const { data: credits } = await supabaseAdmin(c as any)
      .from('capgo_credits_steps')
      .select()
      .order('price_per_unit')
    return c.json(credits || [])
  }
  catch (e) {
    return c.json({ status: 'Cannot get credits', error: JSON.stringify(e) }, 500)
  }
})

app.post('/', async (c) => {
  try {
    const body = await c.req.json<CostCalculationRequest>()
    const { mau, bandwidth, storage } = body

    // Validate inputs
    if (mau === undefined || bandwidth === undefined || storage === undefined) {
      return c.json({ error: 'Missing required fields: mau, bandwidth, storage' }, 400)
    }

    // Get pricing steps from database
    const { data: credits, error } = await supabaseAdmin(c as any)
      .from('capgo_credits_steps')
      .select()
      .order('type, step_min')

    if (error || !credits) {
      return c.json({ error: 'Failed to fetch pricing data' }, 500)
    }

    // Calculate cost for each metric type with tier breakdown
    const calculateMetricCost = (value: number, type: string): MetricBreakdown => {
      if (value <= 0)
        return { cost: 0, tiers: [] }

      const applicableSteps = credits.filter(credit => credit.type === type)
      const tiersUsed: TierUsage[] = []
      let remainingValue = value
      let totalCost = 0

      for (const step of applicableSteps) {
        const stepMin = step.step_min
        const stepMax = step.step_max

        if (remainingValue > 0 && value >= stepMin) {
          const tierUsageBytes = Math.min(remainingValue, stepMax - stepMin)

          // For bandwidth and storage, convert bytes to GB and round up for pricing
          let tierUsage = tierUsageBytes
          let tierCost = 0

          if (type === 'bandwidth' || type === 'storage') {
            // Convert to GB and round up (any partial GB counts as full GB for pricing)
            tierUsage = Math.ceil(bytesToGb(tierUsageBytes))
            tierCost = tierUsage * step.price_per_unit
          }
          else {
            // For MAU, use as-is
            tierCost = tierUsage * step.price_per_unit
          }

          tiersUsed.push({
            tier_id: step.id,
            range: type === 'bandwidth' || type === 'storage'
              ? `${bytesToGb(stepMin)}-${bytesToGb(stepMax)} GB`
              : `${stepMin}-${stepMax}`,
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
          let tierUsage = remainingValue
          let tierCost = 0

          if (type === 'bandwidth' || type === 'storage') {
            // Convert to GB and round up
            tierUsage = Math.ceil(bytesToGb(remainingValue))
            tierCost = tierUsage * highestStep.price_per_unit
          }
          else {
            tierCost = tierUsage * highestStep.price_per_unit
          }

          const stepMin = highestStep.step_min

          tiersUsed.push({
            tier_id: highestStep.id,
            range: type === 'bandwidth' || type === 'storage'
              ? `${bytesToGb(stepMin)}+ GB`
              : `${stepMin}+`,
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
  }
  catch (e) {
    return c.json({ status: 'Cannot calculate cost', error: JSON.stringify(e) }, 500)
  }
})
