import { describe, expect, it } from 'vitest'
import { executeSQL, fetchWithRetry, getAuthHeaders, getEndpointUrl, ORG_ID } from './test-utils'

interface CreditStep {
  type: string
  step_min: number
  price_per_unit: number
}

describe('credits pricing API', () => {
  it.concurrent('returns the updated build_time tiers from the shared pricing table', async () => {
    const response = await fetchWithRetry(getEndpointUrl('/private/credits'))

    expect(response.status).toBe(200)

    const data = await response.json() as CreditStep[]
    const buildSteps = data
      .filter(step => step.type === 'build_time')
      .sort((a, b) => a.step_min - b.step_min)

    expect(buildSteps.map(step => step.price_per_unit)).toEqual([0.16, 0.14, 0.12, 0.10, 0.09, 0.08])
  })

  it.concurrent('preserves not_authorized for org-scoped pricing queries without auth', async () => {
    const response = await fetchWithRetry(getEndpointUrl(`/private/credits?org_id=${ORG_ID}`))

    expect(response.status).toBe(400)

    const data = await response.json() as {
      error: string
    }

    expect(data.error).toBe('not_authorized')
  })

  it.concurrent('prices build_time overage through the shared calculator endpoint', async () => {
    const response = await fetchWithRetry(getEndpointUrl('/private/credits'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mau: 0,
        bandwidth: 0,
        storage: 0,
        build_time: 6000,
      }),
    })

    expect(response.status).toBe(200)

    const data = await response.json() as {
      total_cost: number
      breakdown: {
        build_time: {
          cost: number
        }
      }
      usage: {
        build_time: number
      }
    }

    expect(data.usage.build_time).toBe(6000)
    expect(data.breakdown.build_time.cost).toBe(16)
    expect(data.total_cost).toBe(16)
  })

  it.concurrent('rejects negative build_time input', async () => {
    const response = await fetchWithRetry(getEndpointUrl('/private/credits'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mau: 0,
        bandwidth: 0,
        storage: 0,
        build_time: -60,
      }),
    })

    expect(response.status).toBe(400)

    const data = await response.json() as {
      error: string
    }

    expect(data.error).toBe('invalid_build_time')
  })

  it('uses org-scoped build_time tiers when an authorized org_id is supplied', async () => {
    await executeSQL('DELETE FROM public.capgo_credits_steps WHERE org_id = $1 AND type = $2', [ORG_ID, 'build_time'])

    await executeSQL(`
      INSERT INTO public.capgo_credits_steps (type, step_min, step_max, price_per_unit, unit_factor, org_id)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, ['build_time', 0, 6000, 0.05, 60, ORG_ID])

    try {
      const response = await fetchWithRetry(getEndpointUrl('/private/credits'), {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          org_id: ORG_ID,
          mau: 0,
          bandwidth: 0,
          storage: 0,
          build_time: 6000,
        }),
      })

      expect(response.status).toBe(200)

      const data = await response.json() as {
        total_cost: number
        breakdown: {
          build_time: {
            cost: number
            tiers: {
              price_per_unit: number
            }[]
          }
        }
      }

      expect(data.breakdown.build_time.tiers[0]?.price_per_unit).toBe(0.05)
      expect(data.breakdown.build_time.cost).toBe(5)
      expect(data.total_cost).toBe(5)
    }
    finally {
      await executeSQL('DELETE FROM public.capgo_credits_steps WHERE org_id = $1 AND type = $2', [ORG_ID, 'build_time'])
    }
  })

  it('falls back to the correct global tiers after a partial org-scoped override', async () => {
    await executeSQL('DELETE FROM public.capgo_credits_steps WHERE org_id = $1 AND type = $2', [ORG_ID, 'build_time'])

    await executeSQL(`
      INSERT INTO public.capgo_credits_steps (type, step_min, step_max, price_per_unit, unit_factor, org_id)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, ['build_time', 0, 5000, 0.05, 60, ORG_ID])

    try {
      const response = await fetchWithRetry(getEndpointUrl('/private/credits'), {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          org_id: ORG_ID,
          mau: 0,
          bandwidth: 0,
          storage: 0,
          build_time: 8000,
        }),
      })

      expect(response.status).toBe(200)

      const data = await response.json() as {
        total_cost: number
        breakdown: {
          build_time: {
            cost: number
            tiers: {
              step_min: number
              step_max: number
              price_per_unit: number
            }[]
          }
        }
      }

      expect(data.breakdown.build_time.tiers.map(tier => ({
        step_min: tier.step_min,
        step_max: tier.step_max,
        price_per_unit: tier.price_per_unit,
      }))).toEqual([
        { step_min: 0, step_max: 5000, price_per_unit: 0.05 },
        { step_min: 5000, step_max: 6000, price_per_unit: 0.16 },
        { step_min: 6000, step_max: 30000, price_per_unit: 0.14 },
      ])
      expect(data.breakdown.build_time.cost).toBeCloseTo(11.68, 5)
      expect(data.total_cost).toBeCloseTo(11.68, 5)
    }
    finally {
      await executeSQL('DELETE FROM public.capgo_credits_steps WHERE org_id = $1 AND type = $2', [ORG_ID, 'build_time'])
    }
  })
})
