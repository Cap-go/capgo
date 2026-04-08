import { describe, expect, it } from 'vitest'
import { fetchWithRetry, getEndpointUrl } from './test-utils'

interface CreditStep {
  type: string
  step_min: number
  price_per_unit: number
}

describe('credits pricing API', () => {
  it('returns the updated build_time tiers from the shared pricing table', async () => {
    const response = await fetchWithRetry(getEndpointUrl('/private/credits'))

    expect(response.status).toBe(200)

    const data = await response.json() as CreditStep[]
    const buildSteps = data
      .filter(step => step.type === 'build_time')
      .sort((a, b) => a.step_min - b.step_min)

    expect(buildSteps.map(step => step.price_per_unit)).toEqual([0.16, 0.14, 0.12, 0.10, 0.09, 0.08])
  })

  it('prices build_time overage through the shared calculator endpoint', async () => {
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
})
