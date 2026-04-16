import type { Database } from '~/types/supabase.types'

export type CreditMetricType = Database['public']['Enums']['credit_metric_type']

export interface CreditPricingStep {
  type: CreditMetricType
  step_min: number
  step_max: number
  price_per_unit: number
  unit_factor: number
  org_id?: string | null
}

type Translate = (key: string, values?: Record<string, string | number>) => string

export const creditPricingMetricOrder: CreditMetricType[] = ['mau', 'bandwidth', 'storage', 'build_time']

const creditPricingUnitLabelKeys: Record<CreditMetricType, string> = {
  mau: 'credits-pricing-unit-per-mau',
  bandwidth: 'credits-pricing-unit-per-gib',
  storage: 'credits-pricing-unit-per-gib',
  build_time: 'credits-pricing-unit-per-minute',
}

function getMetricOrder(metric: CreditMetricType) {
  const index = creditPricingMetricOrder.indexOf(metric)
  return index === -1 ? Number.MAX_SAFE_INTEGER : index
}

function isOpenEndedTier(step: Pick<CreditPricingStep, 'step_max'>) {
  return !Number.isFinite(step.step_max) || step.step_max >= Number.MAX_SAFE_INTEGER
}

function toBilledUnits(step: Pick<CreditPricingStep, 'unit_factor'>, rawValue: number) {
  const factor = step.unit_factor || 1
  return Math.ceil(rawValue / factor)
}

function formatCreditTierAmount(metric: CreditMetricType, billedUnits: number, t: Translate, locale?: string) {
  const formatter = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
    notation: metric === 'mau' ? 'compact' : 'standard',
    compactDisplay: 'short',
  })

  if (metric === 'mau')
    return formatter.format(billedUnits)

  if ((metric === 'bandwidth' || metric === 'storage') && billedUnits >= 1024 && billedUnits % 1024 === 0)
    return `${formatter.format(billedUnits / 1024)} TB`

  if (metric === 'bandwidth' || metric === 'storage')
    return `${formatter.format(billedUnits)} GiB`

  if (metric === 'build_time')
    return t('minutes-short', { minutes: formatter.format(billedUnits) })

  return formatter.format(billedUnits)
}

export function sortCreditPricingSteps(steps: CreditPricingStep[]) {
  return [...steps].sort((left, right) => {
    const metricOrderDiff = getMetricOrder(left.type) - getMetricOrder(right.type)
    if (metricOrderDiff !== 0)
      return metricOrderDiff

    if (left.step_min !== right.step_min)
      return left.step_min - right.step_min

    return left.step_max - right.step_max
  })
}

export function getFirstTierCreditUnitPricing(steps: CreditPricingStep[]) {
  return sortCreditPricingSteps(steps).reduce<Partial<Record<CreditMetricType, number>>>((pricing, step) => {
    if (pricing[step.type] === undefined)
      pricing[step.type] = step.price_per_unit

    return pricing
  }, {})
}

export function formatCreditPriceValue(pricePerUnit: number, locale?: string) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(pricePerUnit)
}

export function formatCreditPricingPrice(
  metric: CreditMetricType,
  pricePerUnit: number,
  t: Translate,
  locale?: string,
) {
  return t('credits-pricing-price', {
    price: formatCreditPriceValue(pricePerUnit, locale),
    unit: t(creditPricingUnitLabelKeys[metric]),
  })
}

export function formatCreditPricingTierLabel(
  step: Pick<CreditPricingStep, 'type' | 'step_min' | 'step_max' | 'unit_factor'>,
  t: Translate,
  locale?: string,
) {
  const minUnits = toBilledUnits(step, step.step_min)
  const maxUnits = toBilledUnits(step, step.step_max)
  const openEnded = isOpenEndedTier(step)

  if (step.step_min === 0) {
    return t('credits-pricing-tier-first', {
      to: formatCreditTierAmount(step.type, maxUnits, t, locale),
    })
  }

  if (openEnded) {
    return t('credits-pricing-tier-over', {
      from: formatCreditTierAmount(step.type, minUnits, t, locale),
    })
  }

  return t('credits-pricing-tier-range', {
    from: formatCreditTierAmount(step.type, minUnits, t, locale),
    to: formatCreditTierAmount(step.type, maxUnits, t, locale),
  })
}

export function formatIncludedThenPrice(metric: CreditMetricType, pricePerUnit: number, t: Translate, locale?: string) {
  return t('credits-plan-overage', {
    included: t('included-in-plan'),
    price: formatCreditPricingPrice(metric, pricePerUnit, t, locale),
  })
}
