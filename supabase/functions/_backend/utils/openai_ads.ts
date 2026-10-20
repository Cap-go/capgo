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
// Retries stay inside the ~30s background-task budget: 3 x 8s timeout + 2.5s of waits.
const OPENAI_ADS_TIMEOUT_MS = 8_000
const DEFAULT_RETRY_DELAYS_MS = [500, 2_000]

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

  // Without a real creation time, a late trigger would report an old signup as new.
  const createdAt = record.created_at ? Date.parse(record.created_at) : Number.NaN
  if (!Number.isFinite(createdAt))
    return null
  const timestampMs = Math.min(createdAt, now)

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

function isRetryableStatus(status: number) {
  return status === 408 || status === 429 || status >= 500
}

/**
 * Send the server-side `registration_completed` conversion to OpenAI Ads.
 * Retries network errors, 408, 429 and 5xx a bounded number of times; the event id stays
 * the same, so a retry after a lost response does not create a duplicate.
 * No-op when OPENAI_ADS_API_KEY is missing. Never throws.
 */
export async function trackOpenAIRegistration(
  c: Context,
  record: Pick<UserRow, 'id' | 'email' | 'first_name' | 'last_name' | 'country' | 'created_at'>,
  { retryDelaysMs = DEFAULT_RETRY_DELAYS_MS }: { retryDelaysMs?: number[] } = {},
): Promise<boolean> {
  try {
    const apiKey = getEnv(c, 'OPENAI_ADS_API_KEY').trim()
    if (!apiKey)
      return false
    const pixelId = getEnv(c, 'OPENAI_ADS_PIXEL_ID').trim() || DEFAULT_OPENAI_ADS_PIXEL_ID

    const now = Date.now()
    const event = await buildOpenAIRegistrationEvent(record, now)
    if (!event) {
      cloudlog({ requestId: c.get('requestId'), message: 'OpenAI Ads registration skipped: unknown creation time', userId: record.id })
      return false
    }
    if (now - event.timestamp_ms > MAX_EVENT_AGE_MS) {
      cloudlog({ requestId: c.get('requestId'), message: 'OpenAI Ads registration skipped: event older than 7 days', userId: record.id })
      return false
    }

    const url = new URL(OPENAI_ADS_EVENTS_URL)
    url.searchParams.set('pid', pixelId)
    const body = JSON.stringify({ events: [event] })

    for (let attempt = 0; attempt <= retryDelaysMs.length; attempt++) {
      const isLastAttempt = attempt === retryDelaysMs.length
      try {
        const response = await fetch(url.toString(), {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body,
          signal: AbortSignal.timeout(OPENAI_ADS_TIMEOUT_MS),
        })
        if (response.ok) {
          await response.body?.cancel().catch(() => {})
          cloudlog({ requestId: c.get('requestId'), message: 'OpenAI Ads registration event sent', userId: record.id, attempt: attempt + 1 })
          return true
        }
        const responseBody = await response.text().catch(() => '')
        if (isLastAttempt || !isRetryableStatus(response.status)) {
          cloudlogErr({ requestId: c.get('requestId'), message: 'OpenAI Ads registration event failed', userId: record.id, status: response.status, attempt: attempt + 1, body: responseBody.slice(0, 500) })
          return false
        }
      }
      catch (error) {
        if (isLastAttempt) {
          cloudlogErr({ requestId: c.get('requestId'), message: 'OpenAI Ads registration event error', userId: record.id, attempt: attempt + 1, error: serializeError(error) })
          return false
        }
      }
      await new Promise(resolve => setTimeout(resolve, retryDelaysMs[attempt]))
    }
    return false
  }
  catch (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'OpenAI Ads registration event error', userId: record.id, error: serializeError(error) })
    return false
  }
}
