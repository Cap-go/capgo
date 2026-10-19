import type { Context } from 'hono'
import type { Database } from './supabase.types.ts'
import { cloudlog, cloudlogErr, serializeError } from './logging.ts'
import { getEnv } from './utils.ts'

// OpenAI Ads Conversions API: https://developers.openai.com/ads/conversions-api
const OPENAI_ADS_EVENTS_URL = 'https://bzr.openai.com/v1/events'
// Same Pixel ID as the website measurement pixel; events must share it to deduplicate.
const DEFAULT_OPENAI_ADS_PIXEL_ID = '5Fiq7Kwp18THe1MThKS7GL'
const REGISTRATION_SOURCE_URL = 'https://capgo.app/register/'
// The API rejects events older than 7 days; keep a margin for clock skew.
const MAX_EVENT_AGE_MS = 7 * 24 * 60 * 60 * 1000 - 10 * 60 * 1000
const OPENAI_ADS_TIMEOUT_MS = 10_000

type UserRow = Database['public']['Tables']['users']['Row']

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

const ASCII_PUNCTUATION_OR_WHITESPACE = /[\s!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/g

// Lowercase, drop whitespace and ASCII punctuation, keep non-ASCII characters.
export function normalizeOpenAIName(name: string): string {
  return name.toLowerCase().replace(ASCII_PUNCTUATION_OR_WHITESPACE, '')
}

export async function buildOpenAIRegistrationEvent(record: Pick<UserRow, 'id' | 'email' | 'first_name' | 'last_name' | 'country' | 'created_at'>, now = Date.now()) {
  const externalIdHash = await sha256Hex(record.id.trim())
  const user: Record<string, string[]> = {
    external_ids_sha256: [externalIdHash],
  }
  const email = (record.email ?? '').trim().toLowerCase()
  if (email)
    user.emails_sha256 = [await sha256Hex(email)]
  const firstName = normalizeOpenAIName(record.first_name ?? '')
  if (firstName)
    user.first_names_sha256 = [await sha256Hex(firstName)]
  const lastName = normalizeOpenAIName(record.last_name ?? '')
  if (lastName)
    user.last_names_sha256 = [await sha256Hex(lastName)]
  const country = (record.country ?? '').trim()
  if (/^[a-z]{2}$/i.test(country))
    user.countries = [country.toUpperCase()]

  const createdAt = record.created_at ? Date.parse(record.created_at) : Number.NaN
  const timestampMs = Number.isFinite(createdAt) ? Math.min(createdAt, now) : now

  return {
    // Matches the pixel event_id `registration_<sha256(user id)>` for deduplication.
    id: `registration_${externalIdHash}`,
    type: 'registration_completed',
    timestamp_ms: timestampMs,
    source_url: REGISTRATION_SOURCE_URL,
    action_source: 'web',
    user,
    data: { type: 'customer_action' },
  }
}

/**
 * Send the server-side `registration_completed` conversion to OpenAI Ads.
 * No-op when OPENAI_ADS_API_KEY is missing. Never throws.
 */
export async function trackOpenAIRegistration(c: Context, record: Pick<UserRow, 'id' | 'email' | 'first_name' | 'last_name' | 'country' | 'created_at'>): Promise<boolean> {
  try {
    const apiKey = getEnv(c, 'OPENAI_ADS_API_KEY').trim()
    if (!apiKey)
      return false
    const pixelId = getEnv(c, 'OPENAI_ADS_PIXEL_ID').trim() || DEFAULT_OPENAI_ADS_PIXEL_ID

    const now = Date.now()
    const event = await buildOpenAIRegistrationEvent(record, now)
    if (now - event.timestamp_ms > MAX_EVENT_AGE_MS) {
      cloudlog({ requestId: c.get('requestId'), message: 'OpenAI Ads registration skipped: event older than 7 days', userId: record.id })
      return false
    }

    const url = new URL(OPENAI_ADS_EVENTS_URL)
    url.searchParams.set('pid', pixelId)
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ events: [event] }),
      signal: AbortSignal.timeout(OPENAI_ADS_TIMEOUT_MS),
    })
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      cloudlogErr({ requestId: c.get('requestId'), message: 'OpenAI Ads registration event failed', userId: record.id, status: response.status, body: body.slice(0, 500) })
      return false
    }
    await response.body?.cancel().catch(() => {})
    cloudlog({ requestId: c.get('requestId'), message: 'OpenAI Ads registration event sent', userId: record.id })
    return true
  }
  catch (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'OpenAI Ads registration event error', userId: record.id, error: serializeError(error) })
    return false
  }
}
