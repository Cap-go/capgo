import type { Ref } from 'vue'
import { computed, ref, watch } from 'vue'
import { invokeCapgoApi } from '~/services/capgoApi'
import { formatNumber } from '~/services/formatLocale'
import { stripeAmountToMajorUnits } from '../../supabase/functions/shared/stripe-amount.ts'

const STORAGE_KEY = 'capgo_plan_currency'
const DEFAULT_CURRENCY = 'usd'

// Smallest-unit amounts per currency, straight from the Stripe prices (currency_options).
type PlanPriceAmounts = Record<string, { month: Record<string, number>, year: Record<string, number> }>

interface PlanPricesResponse {
  currencies: string[]
  currency: string
  lockedCurrency: string | null
  prices: PlanPriceAmounts
}

export interface PlanAmounts {
  month: number
  year: number
}

function readStoredCurrency() {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) ?? null
  }
  catch {
    return null
  }
}

// Major-unit monthly/yearly amounts for one currency, or null when Stripe does not sell the plan in it.
export function getPlanAmounts(prices: PlanPriceAmounts, productId: string, currency: string): PlanAmounts | null {
  const plan = prices[productId]
  const month = plan?.month[currency]
  const year = plan?.year[currency]
  if (month === undefined || year === undefined)
    return null
  return { month: stripeAmountToMajorUnits(month, currency), year: stripeAmountToMajorUnits(year, currency) }
}

export function usePlanPrices(orgId: Ref<string | undefined>) {
  const data = ref<PlanPricesResponse | null>(null)
  const storedCurrency = ref(readStoredCurrency())

  watch(orgId, async (id) => {
    data.value = null
    if (!id)
      return
    const { data: response, error } = await invokeCapgoApi<PlanPricesResponse>(`private/plan_prices?orgId=${encodeURIComponent(id)}`, { method: 'GET' })
    if (!error && response && orgId.value === id)
      data.value = response
  }, { immediate: true })

  const currencies = computed(() => data.value?.currencies ?? [DEFAULT_CURRENCY])
  const lockedCurrency = computed(() => data.value?.lockedCurrency ?? null)
  const currency = computed(() => {
    if (lockedCurrency.value)
      return lockedCurrency.value
    if (storedCurrency.value && currencies.value.includes(storedCurrency.value))
      return storedCurrency.value
    return data.value?.currency ?? DEFAULT_CURRENCY
  })

  function setCurrency(code: string) {
    storedCurrency.value = code
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, code)
    }
    catch {}
  }

  // Null until Stripe prices load: callers fall back to the USD amounts stored on the plan.
  function amountsFor(productId: string) {
    return data.value ? getPlanAmounts(data.value.prices, productId, currency.value) : null
  }

  function formatAmount(value: number, code: string, options: Intl.NumberFormatOptions = {}) {
    return formatNumber(value, { style: 'currency', currency: code.toUpperCase(), currencyDisplay: 'narrowSymbol', ...options })
  }

  return { amountsFor, currencies, currency, formatAmount, lockedCurrency, setCurrency }
}
