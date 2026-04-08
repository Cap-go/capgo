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

const creditPricingTierLabelKeys: Partial<Record<CreditMetricType, Record<string, string>>> = {
  mau: {
    '0:1000000': 'credits-pricing-mau-tier-first',
    '1000000:3000000': 'credits-pricing-mau-tier-next-2m',
    '3000000:10000000': 'credits-pricing-mau-tier-next-7m',
    '10000000:15000000': 'credits-pricing-mau-tier-next-5m',
    '15000000:25000000': 'credits-pricing-mau-tier-next-10m',
    '25000000:40000000': 'credits-pricing-mau-tier-next-15m',
    '40000000:100000000': 'credits-pricing-mau-tier-next-60m',
    '100000000:open': 'credits-pricing-mau-tier-over-100m',
  },
  bandwidth: {
    '0:1024': 'credits-pricing-bandwidth-tier-first',
    '1024:2048': 'credits-pricing-bandwidth-tier-next-1tb',
    '2048:6144': 'credits-pricing-bandwidth-tier-next-4tb',
    '6144:12288': 'credits-pricing-bandwidth-tier-next-6tb',
    '12288:25600': 'credits-pricing-bandwidth-tier-next-13tb',
    '25600:64512': 'credits-pricing-bandwidth-tier-next-38tb',
    '64512:130048': 'credits-pricing-bandwidth-tier-next-64tb',
    '130048:open': 'credits-pricing-bandwidth-tier-over-128tb',
  },
  storage: {
    '0:1': 'credits-pricing-storage-tier-first',
    '1:6': 'credits-pricing-storage-tier-next-5gib',
    '6:25': 'credits-pricing-storage-tier-next-19gib',
    '25:63': 'credits-pricing-storage-tier-next-38gib',
    '63:250': 'credits-pricing-storage-tier-next-187gib',
    '250:640': 'credits-pricing-storage-tier-next-390gib',
    '640:1280': 'credits-pricing-storage-tier-next-640gib',
    '1280:open': 'credits-pricing-storage-tier-over-1tb',
  },
  build_time: {
    '0:100': 'credits-pricing-build-tier-first-100',
    '100:500': 'credits-pricing-build-tier-next-400',
    '500:1000': 'credits-pricing-build-tier-next-500',
    '1000:5000': 'credits-pricing-build-tier-next-4000',
    '5000:10000': 'credits-pricing-build-tier-next-5000',
    '10000:open': 'credits-pricing-build-tier-over-10000',
  },
}

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

function getTierLookupKey(step: Pick<CreditPricingStep, 'type' | 'step_min' | 'step_max' | 'unit_factor'>) {
  const minUnits = toBilledUnits(step, step.step_min)
  if (isOpenEndedTier(step))
    return `${minUnits}:open`

  const maxUnits = toBilledUnits(step, step.step_max)
  return `${minUnits}:${maxUnits}`
}

function formatCreditTierAmount(metric: CreditMetricType, billedUnits: number, locale?: string) {
  const formatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 })

  if (metric === 'mau' && billedUnits >= 1_000_000 && billedUnits % 1_000_000 === 0)
    return `${formatter.format(billedUnits / 1_000_000)}M`

  if ((metric === 'bandwidth' || metric === 'storage') && billedUnits >= 1024 && billedUnits % 1024 === 0)
    return `${formatter.format(billedUnits / 1024)} TB`

  if (metric === 'bandwidth' || metric === 'storage')
    return `${formatter.format(billedUnits)} GiB`

  if (metric === 'build_time')
    return `${formatter.format(billedUnits)} ${billedUnits === 1 ? 'minute' : 'minutes'}`

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

export function getCreditPricingTierLabelKey(step: Pick<CreditPricingStep, 'type' | 'step_min' | 'step_max' | 'unit_factor'>) {
  return creditPricingTierLabelKeys[step.type]?.[getTierLookupKey(step)] ?? null
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
  const translatedTierKey = getCreditPricingTierLabelKey(step)
  if (translatedTierKey) {
    const translated = t(translatedTierKey)
    if (translated !== translatedTierKey)
      return translated
  }

  const minUnits = toBilledUnits(step, step.step_min)
  const maxUnits = toBilledUnits(step, step.step_max)
  const openEnded = isOpenEndedTier(step)

  if (step.step_min === 0) {
    return t('credits-pricing-tier-first', {
      amount: formatCreditTierAmount(step.type, maxUnits, locale),
    })
  }

  if (openEnded) {
    return t('credits-pricing-tier-over', {
      amount: formatCreditTierAmount(step.type, minUnits, locale),
    })
  }

  return t('credits-pricing-tier-next', {
    amount: formatCreditTierAmount(step.type, maxUnits - minUnits, locale),
  })
}

export function formatIncludedThenPrice(metric: CreditMetricType, pricePerUnit: number, t: Translate, locale?: string) {
  return t('credits-plan-overage', {
    included: t('included-in-plan'),
    price: formatCreditPricingPrice(metric, pricePerUnit, t, locale),
  })
}
