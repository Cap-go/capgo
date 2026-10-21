import { computed, ref } from 'vue'
import { invokeCapgoApi } from '~/services/capgoApi'
import { formatNumber, getFormatLocale } from '~/services/formatLocale'
import { useMainStore } from '~/stores/main'

// Prices are billed in USD; other currencies are display-only estimates from ECB rates.
export const BILLING_CURRENCY = 'USD'
const STORAGE_KEY = 'capgo_display_currency'

const EURO_COUNTRIES = ['AD', 'AT', 'BE', 'BG', 'CY', 'DE', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'IE', 'IT', 'LT', 'LU', 'LV', 'MC', 'ME', 'MT', 'NL', 'PT', 'SI', 'SK', 'SM', 'VA', 'XK']

const COUNTRY_CURRENCIES: Record<string, string> = {
  ...Object.fromEntries(EURO_COUNTRIES.map(country => [country, 'EUR'])),
  AU: 'AUD',
  BR: 'BRL',
  CA: 'CAD',
  CH: 'CHF',
  CN: 'CNY',
  CZ: 'CZK',
  DK: 'DKK',
  GB: 'GBP',
  HK: 'HKD',
  HU: 'HUF',
  ID: 'IDR',
  IL: 'ILS',
  IN: 'INR',
  IS: 'ISK',
  JP: 'JPY',
  KR: 'KRW',
  LI: 'CHF',
  MX: 'MXN',
  MY: 'MYR',
  NO: 'NOK',
  NZ: 'NZD',
  PH: 'PHP',
  PL: 'PLN',
  RO: 'RON',
  SE: 'SEK',
  SG: 'SGD',
  TH: 'THB',
  TR: 'TRY',
  US: 'USD',
  ZA: 'ZAR',
}

interface CurrencyRatesResponse {
  country: string | null
  date: string | null
  rates: Record<string, number>
}

export function currencyForCountry(country: string | null | undefined) {
  return country ? COUNTRY_CURRENCIES[country.toUpperCase()] ?? null : null
}

// Region of a locale tag such as "fr-FR" or "en-US".
export function regionFromLocale(locale: string | null | undefined) {
  if (!locale)
    return null
  try {
    return new Intl.Locale(locale).maximize().region ?? null
  }
  catch {
    return null
  }
}

export function convertFromUsd(usd: number, currency: string, rates: Record<string, number>) {
  if (currency === BILLING_CURRENCY)
    return usd
  const rate = rates[currency]
  return rate ? usd * rate : null
}

function readStoredCurrency() {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) ?? null
  }
  catch {
    return null
  }
}

const rates = ref<Record<string, number>>({ [BILLING_CURRENCY]: 1 })
const ratesDate = ref<string | null>(null)
const detectedCurrency = ref<string | null>(null)
const storedCurrency = ref<string | null>(readStoredCurrency())
let loadPromise: Promise<void> | null = null

async function loadRates() {
  const { data, error } = await invokeCapgoApi<CurrencyRatesResponse>('private/currency_rates', { method: 'GET' })
  if (error || !data?.rates) {
    // Retry on the next page visit instead of pinning USD for the whole session.
    loadPromise = null
    return
  }
  rates.value = { ...data.rates, [BILLING_CURRENCY]: 1 }
  ratesDate.value = data.date
  detectedCurrency.value = currencyForCountry(data.country)
    // Only an explicit account format locale counts: the default (en-GB) says nothing about the user.
    ?? currencyForCountry(regionFromLocale(useMainStore().user?.format_locale))
    ?? currencyForCountry(regionFromLocale(globalThis.navigator?.language))
}

export function useDisplayCurrency() {
  loadPromise ??= loadRates()

  const availableCurrencies = computed(() => Object.keys(rates.value).sort())
  const currency = computed(() => {
    for (const candidate of [storedCurrency.value, detectedCurrency.value]) {
      if (candidate && rates.value[candidate])
        return candidate
    }
    return BILLING_CURRENCY
  })
  const isEstimate = computed(() => currency.value !== BILLING_CURRENCY)

  function setCurrency(code: string) {
    storedCurrency.value = code
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, code)
    }
    catch {}
  }

  // Whole-unit prices (plan cards) drop decimals; per-unit prices keep them.
  function formatPrice(usd: number, options: Intl.NumberFormatOptions = {}) {
    const converted = convertFromUsd(usd, currency.value, rates.value)
    const code = converted === null ? BILLING_CURRENCY : currency.value
    return formatNumber(converted ?? usd, { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol', ...options })
  }

  function currencyLabel(code: string) {
    try {
      const name = new Intl.DisplayNames([getFormatLocale()], { type: 'currency' }).of(code)
      return name ? `${code} - ${name}` : code
    }
    catch {
      return code
    }
  }

  return { availableCurrencies, currency, currencyLabel, formatPrice, isEstimate, ratesDate, setCurrency }
}
