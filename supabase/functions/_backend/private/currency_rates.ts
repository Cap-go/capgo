import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import { Hono } from 'hono/tiny'
import { CacheHelper } from '../utils/cache.ts'
import { useCors } from '../utils/hono.ts'
import { middlewareAuth } from '../utils/hono_jwt.ts'
import { cloudlogErr, serializeError } from '../utils/logging.ts'
import { getRequestCountry } from '../utils/stripe_billing.ts'

// ECB reference rates (USD base), refreshed once per business day upstream.
const RATES_URL = 'https://api.frankfurter.dev/v1/latest?base=USD'
const RATES_CACHE_PATH = '/private/currency_rates/usd'
const RATES_TTL_SECONDS = 6 * 60 * 60
const RATES_FETCH_TIMEOUT_MS = 3000

export interface UsdRates {
  date: string | null
  rates: Record<string, number>
}

export function parseUsdRates(payload: unknown): UsdRates | null {
  if (!payload || typeof payload !== 'object')
    return null
  const { date, rates } = payload as { date?: unknown, rates?: unknown }
  if (!rates || typeof rates !== 'object')
    return null
  const parsed: Record<string, number> = {}
  for (const [code, value] of Object.entries(rates as Record<string, unknown>)) {
    if (/^[A-Z]{3}$/.test(code) && typeof value === 'number' && Number.isFinite(value) && value > 0)
      parsed[code] = value
  }
  if (!Object.keys(parsed).length)
    return null
  return { date: typeof date === 'string' ? date : null, rates: parsed }
}

async function fetchUsdRates(c: Context): Promise<UsdRates | null> {
  try {
    const response = await fetch(RATES_URL, { signal: AbortSignal.timeout(RATES_FETCH_TIMEOUT_MS) })
    if (!response.ok)
      throw new Error(`Rates request failed with ${response.status}`)
    return parseUsdRates(await response.json())
  }
  catch (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'currency_rates fetch failed', error: serializeError(error) })
    return null
  }
}

async function getUsdRates(c: Context): Promise<UsdRates | null> {
  const cache = new CacheHelper(c)
  const key = cache.buildRequest(RATES_CACHE_PATH)
  const cached = await cache.matchJson<UsdRates>(key, { timeoutMs: 200 })
  if (cached)
    return cached
  const fresh = await fetchUsdRates(c)
  if (fresh)
    await cache.putJson(key, fresh, RATES_TTL_SECONDS, { timeoutMs: 200 })
  return fresh
}

export const app = new Hono<MiddlewareKeyVariables>()

app.use('/', useCors)

// Display-only conversion: Stripe still bills in USD. No rates means the UI stays in USD.
app.get('/', middlewareAuth, async (c) => {
  const usd = await getUsdRates(c)
  return c.json({
    country: getRequestCountry(c),
    date: usd?.date ?? null,
    rates: usd ? { ...usd.rates, USD: 1 } : { USD: 1 },
  })
})
