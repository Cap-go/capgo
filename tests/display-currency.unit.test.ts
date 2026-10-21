import { describe, expect, it, vi } from 'vitest'
import { parseUsdRates } from '../supabase/functions/_backend/private/currency_rates.ts'
import { convertFromUsd, currencyForCountry, regionFromLocale } from '../src/services/displayCurrency'

vi.mock('~/services/capgoApi', () => ({
  invokeCapgoApi: vi.fn(),
}))

describe('display currency', () => {
  it.concurrent('maps countries to their local currency', () => {
    expect(currencyForCountry('FR')).toBe('EUR')
    expect(currencyForCountry('gb')).toBe('GBP')
    expect(currencyForCountry('US')).toBe('USD')
    expect(currencyForCountry('XX')).toBeNull()
    expect(currencyForCountry(null)).toBeNull()
  })

  it.concurrent('reads the region from a locale tag', () => {
    expect(regionFromLocale('fr-FR')).toBe('FR')
    expect(regionFromLocale('ja')).toBe('JP')
    expect(regionFromLocale('not a locale')).toBeNull()
    expect(regionFromLocale(undefined)).toBeNull()
  })

  it.concurrent('converts USD prices with the given rates', () => {
    const rates = { EUR: 0.9, JPY: 150 }
    expect(convertFromUsd(100, 'USD', rates)).toBe(100)
    expect(convertFromUsd(100, 'EUR', rates)).toBeCloseTo(90)
    expect(convertFromUsd(12, 'JPY', rates)).toBe(1800)
    expect(convertFromUsd(100, 'GBP', rates)).toBeNull()
  })

  it.concurrent('keeps only valid upstream rates', () => {
    expect(parseUsdRates({ date: '2026-10-21', rates: { EUR: 0.89, BAD: -1, eur: 1, GBP: 'x' } })).toEqual({ date: '2026-10-21', rates: { EUR: 0.89 } })
    expect(parseUsdRates({ rates: {} })).toBeNull()
    expect(parseUsdRates(null)).toBeNull()
  })
})
