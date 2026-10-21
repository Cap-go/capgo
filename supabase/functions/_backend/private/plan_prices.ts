import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { BillingAccount } from '../utils/stripe_billing.ts'
import { Hono } from 'hono/tiny'
import { CacheHelper } from '../utils/cache.ts'
import { simpleError, useCors } from '../utils/hono.ts'
import { middlewareAuth } from '../utils/hono_jwt.ts'
import { cloudlogErr, serializeError } from '../utils/logging.ts'
import { getCheckoutPlanPrice, getPriceCurrencyAmounts, getStripeCustomerCurrency } from '../utils/stripe.ts'
import { getBillingAccountForCustomer, getRequestCountry, isStripeConfiguredForAccount } from '../utils/stripe_billing.ts'
import { supabaseAdmin, supabaseClient } from '../utils/supabase.ts'

const PLAN_PRICES_CACHE_PATH = '/private/plan_prices'
const PLAN_PRICES_TTL_SECONDS = 60 * 60
const DEFAULT_CURRENCY = 'usd'

const EURO_COUNTRIES = new Set(['AD', 'AT', 'BE', 'BG', 'CY', 'DE', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'IE', 'IT', 'LT', 'LU', 'LV', 'MC', 'ME', 'MT', 'NL', 'PT', 'SI', 'SK', 'SM', 'VA', 'XK'])

// Smallest-unit amounts per currency, keyed by plan product id (plans.stripe_id) and interval.
export type PlanPriceAmounts = Record<string, { month: Record<string, number>, year: Record<string, number> }>

// Only picks among currencies Stripe actually sells; it never sets an amount.
export function currencyForCountry(country: string | null | undefined) {
  if (!country)
    return null
  const code = country.toUpperCase()
  if (EURO_COUNTRIES.has(code))
    return 'eur'
  if (code === 'GB')
    return 'gbp'
  if (code === 'US')
    return 'usd'
  return null
}

// Currencies every plan is sold in, so switching never leaves a card without a price.
export function getCommonCurrencies(prices: PlanPriceAmounts) {
  const plans = Object.values(prices)
  if (!plans.length)
    return [DEFAULT_CURRENCY]
  const sets = plans.flatMap(plan => [plan.month, plan.year]).filter(amounts => Object.keys(amounts).length)
  if (!sets.length)
    return [DEFAULT_CURRENCY]
  return Object.keys(sets[0]).filter(currency => sets.every(amounts => currency in amounts)).sort()
}

export function pickCurrency(currencies: string[], lockedCurrency: string | null, country: string | null) {
  if (lockedCurrency)
    return lockedCurrency
  const local = currencyForCountry(country)
  if (local && currencies.includes(local))
    return local
  return currencies.includes(DEFAULT_CURRENCY) ? DEFAULT_CURRENCY : currencies[0] ?? DEFAULT_CURRENCY
}

async function loadPlanPrices(c: Context, billingAccount: BillingAccount): Promise<PlanPriceAmounts> {
  const { data: plans, error } = await supabaseAdmin(c)
    .from('plans')
    .select('stripe_id')
  if (error)
    throw simpleError('plans_not_found', 'Cannot load plans', { error })

  const entries = await Promise.all((plans ?? []).map(async ({ stripe_id }) => {
    const [month, year] = await Promise.all([
      getCheckoutPlanPrice(c, stripe_id, 'month', billingAccount),
      getCheckoutPlanPrice(c, stripe_id, 'year', billingAccount),
    ])
    return [stripe_id, {
      month: month ? getPriceCurrencyAmounts(month) : {},
      year: year ? getPriceCurrencyAmounts(year) : {},
    }] as const
  }))
  return Object.fromEntries(entries)
}

async function getPlanPrices(c: Context, billingAccount: BillingAccount) {
  const cache = new CacheHelper(c)
  const key = cache.buildRequest(PLAN_PRICES_CACHE_PATH, { account: billingAccount })
  const cached = await cache.matchJson<PlanPriceAmounts>(key, { timeoutMs: 200 })
  if (cached)
    return cached
  const fresh = await loadPlanPrices(c, billingAccount)
  await cache.putJson(key, fresh, PLAN_PRICES_TTL_SECONDS, { timeoutMs: 200 })
  return fresh
}

export const app = new Hono<MiddlewareKeyVariables>()

app.use('/', useCors)

// Plan prices in every currency configured on the Stripe prices, plus which one this org should see.
app.get('/', middlewareAuth, async (c) => {
  const orgId = c.req.query('orgId')
  if (!orgId)
    throw simpleError('no_org_id_provided', 'No org_id provided')
  const authorization = c.get('authorization')
  if (!authorization)
    throw simpleError('not_authorized', 'Not authorized')

  // RLS: only members of the org can read its billing currency.
  const { data: org, error } = await supabaseClient(c, authorization)
    .from('orgs')
    .select('customer_id')
    .eq('id', orgId)
    .single()
  if (error || !org)
    throw simpleError('not_authorized', 'Not authorized')

  const billingAccount = org.customer_id ? await getBillingAccountForCustomer(c, org.customer_id) : 'ee'
  if (!isStripeConfiguredForAccount(c, billingAccount))
    return c.json({ currencies: [DEFAULT_CURRENCY], currency: DEFAULT_CURRENCY, lockedCurrency: null, prices: {} })

  const prices = await getPlanPrices(c, billingAccount)
  let lockedCurrency: string | null = null
  if (org.customer_id) {
    try {
      lockedCurrency = await getStripeCustomerCurrency(c, org.customer_id, billingAccount)
    }
    catch (customerError) {
      cloudlogErr({ requestId: c.get('requestId'), message: 'plan_prices customer currency', error: serializeError(customerError) })
    }
  }
  const currencies = getCommonCurrencies(prices)
  // A pinned customer can only check out in its own currency.
  const available = lockedCurrency ? currencies.filter(currency => currency === lockedCurrency) : currencies
  return c.json({
    currencies: available.length ? available : [DEFAULT_CURRENCY],
    currency: pickCurrency(available, lockedCurrency, getRequestCountry(c)),
    lockedCurrency,
    prices,
  })
})
