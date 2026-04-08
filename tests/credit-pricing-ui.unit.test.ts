import { describe, expect, it } from 'vitest'
import { formatCreditPricingPrice, formatCreditPricingTierLabel, formatIncludedThenPrice, getFirstTierCreditUnitPricing } from '../src/services/creditPricing'

const messages: Record<string, string> = {
  'credits-plan-overage': '{included}, then {price}',
  'minutes-short': '{minutes}m',
  'credits-pricing-price': '{price} {unit}',
  'credits-pricing-tier-first': 'First {amount}',
  'credits-pricing-tier-next': 'Next {amount}',
  'credits-pricing-tier-over': 'Over {amount}',
  'credits-pricing-unit-per-gib': 'per GiB',
  'credits-pricing-unit-per-mau': 'per MAU',
  'credits-pricing-unit-per-minute': 'per minute',
  'included-in-plan': 'Included in plan',
}

function t(key: string, values: Record<string, string | number> = {}) {
  const template = messages[key] ?? key
  return template.replaceAll(/\{(\w+)\}/g, (_match, placeholder) => String(values[placeholder] ?? `{${placeholder}}`))
}

describe('credit pricing UI helpers', () => {
  it.concurrent('formats first build_time tiers with generic translated labels', () => {
    expect(formatCreditPricingTierLabel({
      type: 'build_time',
      step_min: 0,
      step_max: 6000,
      unit_factor: 60,
    }, t)).toBe('First 100m')

    expect(formatCreditPricingPrice('build_time', 0.16, t)).toBe('$0.16 per minute')
  })

  it.concurrent('falls back to generic tier copy for custom org-scoped ranges', () => {
    expect(formatCreditPricingTierLabel({
      type: 'build_time',
      step_min: 3000,
      step_max: 9000,
      unit_factor: 60,
    }, t)).toBe('Next 100m')

    expect(formatCreditPricingTierLabel({
      type: 'build_time',
      step_min: 9000,
      step_max: Number.MAX_SAFE_INTEGER,
      unit_factor: 60,
    }, t)).toBe('Over 150m')
  })

  it.concurrent('rounds bounded custom spans from the raw tier width', () => {
    expect(formatCreditPricingTierLabel({
      type: 'build_time',
      step_min: 5000,
      step_max: 6000,
      unit_factor: 60,
    }, t)).toBe('Next 17m')
  })

  it.concurrent('derives the visible first-tier pricing from the shared step list', () => {
    expect(getFirstTierCreditUnitPricing([
      {
        type: 'build_time',
        step_min: 6000,
        step_max: 30000,
        price_per_unit: 0.14,
        unit_factor: 60,
      },
      {
        type: 'bandwidth',
        step_min: 0,
        step_max: 1099511627776,
        price_per_unit: 0.12,
        unit_factor: 1073741824,
      },
      {
        type: 'build_time',
        step_min: 0,
        step_max: 6000,
        price_per_unit: 0.16,
        unit_factor: 60,
      },
    ])).toEqual({
      bandwidth: 0.12,
      build_time: 0.16,
    })
  })

  it.concurrent('formats plan overage copy from the shared price formatter', () => {
    expect(formatIncludedThenPrice('build_time', 0.08, t)).toBe('Included in plan, then $0.08 per minute')
  })
})
