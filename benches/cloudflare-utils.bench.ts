import { bench, describe } from 'vitest'
import { normalizeAnalyticsLimit } from '../supabase/functions/_backend/utils/cloudflare.ts'

describe('normalizeAnalyticsLimit', () => {
  bench('valid number within range', () => {
    normalizeAnalyticsLimit(500)
  })

  bench('number exceeding max', () => {
    normalizeAnalyticsLimit(100_000)
  })

  bench('negative number', () => {
    normalizeAnalyticsLimit(-10)
  })

  bench('zero', () => {
    normalizeAnalyticsLimit(0)
  })

  bench('non-number types', () => {
    normalizeAnalyticsLimit('500')
    normalizeAnalyticsLimit(null)
    normalizeAnalyticsLimit(undefined)
    normalizeAnalyticsLimit({})
  })

  bench('float truncation', () => {
    normalizeAnalyticsLimit(99.7)
  })

  bench('NaN and Infinity', () => {
    normalizeAnalyticsLimit(Number.NaN)
    normalizeAnalyticsLimit(Number.POSITIVE_INFINITY)
  })

  bench('with custom fallback', () => {
    normalizeAnalyticsLimit('invalid', 250)
  })
})
