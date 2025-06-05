import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { bytesToGb } from '../utils/conversion.ts'
import { useCors } from '../utils/hono.ts'
import { supabaseAdmin } from '../utils/supabase.ts'

export const app = new Hono<MiddlewareKeyVariables>()

app.use('/', useCors)

app.get('/', async (c) => {
  try {
    const { data: credits } = await supabaseAdmin(c as any)
      .from('capgo_credits_steps')
      .select()
      .order('price_per_unit')
    // use bytesToGb function to convert all column storage and bandwidth to GB
    const creditsFinal = credits?.map((credit) => {
      // convert type bandwidth to gb and storage to gb
      if (credit.type === 'bandwidth') {
        credit.step_min = bytesToGb(credit.step_min)
        credit.step_max = bytesToGb(credit.step_max)
      }
      else if (credit.type === 'storage') {
        credit.step_min = bytesToGb(credit.step_min)
        credit.step_max = bytesToGb(credit.step_max)
      }
      return credit
    })
    return c.json(creditsFinal || [])
  }
  catch (e) {
    return c.json({ status: 'Cannot get credits', error: JSON.stringify(e) }, 500)
  }
})

app.post('/', async (c) => {
  try {
    const body = await c.req.json()
    const { mau, bandwidth, storage_hours, plan_id } = body

    // Validate inputs
    if (!mau || !bandwidth || !storage_hours || !plan_id) {
      return c.json({ error: 'Missing required fields: mau, bandwidth, storage_hours, plan_id' }, 400)
    }

    // Get plan details to find included amounts
    const { data: plan, error: planError } = await supabaseAdmin(c as any)
      .from('plans')
      .select('mau, bandwidth, storage')
      .eq('id', plan_id)
      .single()

    if (planError || !plan) {
      return c.json({ error: 'Failed to fetch plan data' }, 500)
    }

    // Get pricing steps from database
    const { data: credits, error } = await supabaseAdmin(c as any)
      .from('capgo_credits_steps')
      .select()
      .eq('plan_id', plan_id)

    if (error || !credits) {
      return c.json({ error: 'Failed to fetch pricing data' }, 500)
    }

    let totalCost = 0

    // Calculate excess usage (usage above plan included amounts)
    const excessMau = Math.max(0, mau - (plan.mau || 0))
    const excessBandwidth = Math.max(0, bandwidth - bytesToGb(plan.bandwidth || 0))
    const excessStorage = Math.max(0, storage_hours - bytesToGb(plan.storage || 0))

    // Calculate cost for each metric type
    const calculateMetricCost = (value: number, type: string) => {
      if (value <= 0)
        return 0

      const applicableSteps = credits.filter(credit => credit.type === type)

      for (const step of applicableSteps) {
        const stepMin = type === 'bandwidth' || type === 'storage' ? bytesToGb(step.step_min) : step.step_min
        const stepMax = type === 'bandwidth' || type === 'storage' ? bytesToGb(step.step_max) : step.step_max

        if (value >= stepMin && value <= stepMax) {
          return value * step.price_per_unit
        }
      }

      // If no matching step found, use the highest tier
      const highestStep = applicableSteps[applicableSteps.length - 1]
      if (highestStep) {
        return value * highestStep.price_per_unit
      }

      return 0
    }

    // Calculate costs
    const mauCost = calculateMetricCost(excessMau, 'mau')
    const bandwidthCost = calculateMetricCost(excessBandwidth, 'bandwidth')
    const storageCost = calculateMetricCost(excessStorage, 'storage')

    totalCost = mauCost + bandwidthCost + storageCost

    return c.json({
      total_cost: totalCost,
      breakdown: {
        mau_cost: mauCost,
        bandwidth_cost: bandwidthCost,
        storage_cost: storageCost,
      },
      usage: {
        mau,
        bandwidth,
        storage_hours,
        plan_id,
      },
      included: {
        mau: plan.mau || 0,
        bandwidth: bytesToGb(plan.bandwidth || 0),
        storage: bytesToGb(plan.storage || 0),
      },
      excess: {
        mau: excessMau,
        bandwidth: excessBandwidth,
        storage: excessStorage,
      },
    })
  }
  catch (e) {
    return c.json({ status: 'Cannot calculate cost', error: JSON.stringify(e) }, 500)
  }
})
