import { describe, test } from 'vitest'
import { normalizeAnalyticsLimit } from '../supabase/functions/_backend/utils/cloudflare.ts'

describe('normalizeAnalyticsLimit', () => {
  test('valid number within range', async ({ bench }) => {
    await bench('valid number within range', () => {
      normalizeAnalyticsLimit(500)
    }).run()
  })

  test('number exceeding max', async ({ bench }) => {
    await bench('number exceeding max', () => {
      normalizeAnalyticsLimit(100_000)
    }).run()
  })

  test('negative number', async ({ bench }) => {
    await bench('negative number', () => {
      normalizeAnalyticsLimit(-10)
    }).run()
  })

  test('zero', async ({ bench }) => {
    await bench('zero', () => {
      normalizeAnalyticsLimit(0)
    }).run()
  })

  test('non-number types', async ({ bench }) => {
    await bench('non-number types', () => {
      normalizeAnalyticsLimit('500')
      normalizeAnalyticsLimit(null)
      normalizeAnalyticsLimit(undefined)
      normalizeAnalyticsLimit({})
    }).run()
  })

  test('float truncation', async ({ bench }) => {
    await bench('float truncation', () => {
      normalizeAnalyticsLimit(99.7)
    }).run()
  })

  test('nan and infinity', async ({ bench }) => {
    await bench('nan and infinity', () => {
      normalizeAnalyticsLimit(Number.NaN)
      normalizeAnalyticsLimit(Number.POSITIVE_INFINITY)
    }).run()
  })

  test('with custom fallback', async ({ bench }) => {
    await bench('with custom fallback', () => {
      normalizeAnalyticsLimit('invalid', 250)
    }).run()
  })
})
