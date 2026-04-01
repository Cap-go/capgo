import type { Context } from 'hono'
import { CacheHelper } from '../utils/cache.ts'
import { honoFactory, parseBody, quickError, useCors } from '../utils/hono.ts'
import { cloudlog } from '../utils/logging.ts'
import { getClientIP } from '../utils/rate_limit.ts'
import { getEnv } from '../utils/utils.ts'

const CACHE_TTL_SECONDS = 7 * 24 * 60 * 60
const MAX_BATCH_CHARACTERS = 3_200
const MAX_STRINGS = 220
const MAX_TOTAL_CHARACTERS = 12_000
const TRANSLATION_MODEL = '@cf/meta/m2m100-1.2b'
const TRANSLATION_IP_RATE_PATH = '/translation/ip-rate'
const TRANSLATION_IP_RATE_TTL_SECONDS = 60
// High enough for real users behind shared NATs while still limiting quota abuse.
const DEFAULT_TRANSLATION_IP_RATE_LIMIT = 240

const SUPPORTED_LANGUAGES = new Set([
  'ar',
  'bn',
  'cs',
  'de',
  'el',
  'en',
  'es',
  'fa',
  'fi',
  'fr',
  'he',
  'hi',
  'hu',
  'id',
  'it',
  'ja',
  'ko',
  'nl',
  'pl',
  'pt',
  'ro',
  'ru',
  'sv',
  'ta',
  'th',
  'tr',
  'uk',
  'ur',
  'vi',
  'zh',
])

interface TranslationBody {
  pagePath?: string
  requestHash?: string
  strings?: unknown
  targetLanguage?: string
}

export interface ProtectedEntry {
  marker: string
  protectedText: string
  source: string
  tokens: Map<string, string>
}

interface TranslationResponsePayload {
  model: string
  requestHash: string
  translations: Record<string, string>
}

interface TranslationRateLimitEntry {
  count: number
  resetAt: number
}

interface TranslationRateLimitStatus {
  ip?: string
  limited: boolean
  resetAt?: number
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

export function normalizeTranslationStrings(strings: unknown) {
  if (!Array.isArray(strings))
    throw quickError(400, 'invalid_translation_payload', 'strings must be an array')

  const unique = new Set<string>()
  const filtered: string[] = []
  let totalCharacters = 0

  for (const entry of strings) {
    if (typeof entry !== 'string')
      continue

    const normalized = normalizeWhitespace(entry)
    if (!normalized)
      continue
    if (normalized.length > 800)
      continue
    if (unique.has(normalized))
      continue
    if (filtered.length >= MAX_STRINGS)
      break
    if (totalCharacters + entry.length > MAX_TOTAL_CHARACTERS)
      break

    unique.add(normalized)
    filtered.push(entry)
    totalCharacters += entry.length
  }

  return filtered
}

export function protectTranslationTokens(text: string) {
  let index = 0
  const tokens = new Map<string, string>()
  const tokenPattern = /\{\w+\}|\$\d+|https?:\/\/[^\s)]+|\b[\w.%+-]+@[\w.-]+\.[a-z]{2,}\b|\b(?:bunx?|npx)(?:\s+[@\w./:-]+)+/gi

  const replaceMatch = (match: string) => {
    const token = `__CAPGO_TOKEN_${index++}__`
    tokens.set(token, match)
    return token
  }

  const protectedText = text.replace(tokenPattern, replaceMatch)

  return {
    protectedText,
    tokens,
  }
}

export function restoreTranslationTokens(text: string, tokens: Map<string, string>) {
  let restored = text
  tokens.forEach((original, token) => {
    restored = restored.replaceAll(token, original)
  })
  return restored
}

function buildSegmentMarker(index: number) {
  return `[[CAPGO_SEGMENT_${String(index).padStart(4, '0')}]]`
}

function createProtectedEntries(strings: string[]) {
  return strings.map((source, index) => {
    const protectedTokens = protectTranslationTokens(source)
    return {
      source,
      marker: buildSegmentMarker(index),
      protectedText: protectedTokens.protectedText,
      tokens: protectedTokens.tokens,
    } satisfies ProtectedEntry
  })
}

function buildBatches(entries: ProtectedEntry[]) {
  const batches: ProtectedEntry[][] = []
  let currentBatch: ProtectedEntry[] = []
  let currentSize = 0

  entries.forEach((entry) => {
    const entrySize = entry.marker.length + entry.protectedText.length + 2
    if (currentBatch.length > 0 && currentSize + entrySize > MAX_BATCH_CHARACTERS) {
      batches.push(currentBatch)
      currentBatch = []
      currentSize = 0
    }

    currentBatch.push(entry)
    currentSize += entrySize
  })

  if (currentBatch.length > 0)
    batches.push(currentBatch)

  return batches
}

function buildSegmentedText(entries: ProtectedEntry[]) {
  return entries
    .map(entry => `${entry.marker}\n${entry.protectedText}`)
    .join('\n\n')
}

export function parseSegmentedTranslation(translatedText: string, entries: ProtectedEntry[]) {
  const translations = new Map<string, string>()

  entries.forEach((entry, index) => {
    const start = translatedText.indexOf(entry.marker)

    if (start < 0) {
      cloudlog({ message: 'Translation segment marker missing from model output', index, marker: entry.marker })
      translations.set(entry.source, entry.source)
      return
    }

    const contentStart = start + entry.marker.length
    const markerBoundaries = entries
      .slice(index + 1)
      .map(nextEntry => translatedText.indexOf(nextEntry.marker, contentStart))
      .filter(boundary => boundary >= 0)
      .sort((left, right) => left - right)

    const end = markerBoundaries[0] ?? translatedText.length
    if (entries[index + 1] && markerBoundaries.length === 0) {
      cloudlog({ message: 'Translation segment boundary missing from model output', index, marker: entry.marker })
      translations.set(entry.source, entry.source)
      return
    }

    const segmentText = translatedText
      .slice(contentStart, end)
      .trim()

    const restored = restoreTranslationTokens(segmentText || entry.source, entry.tokens)
    translations.set(entry.source, restored || entry.source)
  })

  return translations
}

function getTranslationIpRateLimit(c: Context) {
  const envLimit = getEnv(c, 'RATE_LIMIT_TRANSLATION_IP')
  if (envLimit) {
    const parsed = Number.parseInt(envLimit, 10)
    if (!Number.isNaN(parsed) && parsed > 0)
      return parsed
  }
  return DEFAULT_TRANSLATION_IP_RATE_LIMIT
}

async function recordTranslationRequest(c: Context): Promise<TranslationRateLimitStatus> {
  const ip = getClientIP(c)
  if (ip === 'unknown') {
    cloudlog({
      requestId: c.get('requestId'),
      message: 'Translation IP rate limit skipped: unknown IP',
    })
    return { limited: false }
  }

  const cacheHelper = new CacheHelper(c)
  const cacheKey = cacheHelper.buildRequest(TRANSLATION_IP_RATE_PATH, { ip })
  const existing = await cacheHelper.matchJson<TranslationRateLimitEntry>(cacheKey)
  const entry: TranslationRateLimitEntry = {
    count: (existing?.count ?? 0) + 1,
    resetAt: Date.now() + TRANSLATION_IP_RATE_TTL_SECONDS * 1000,
  }

  await cacheHelper.putJson(cacheKey, entry, TRANSLATION_IP_RATE_TTL_SECONDS)

  const limit = getTranslationIpRateLimit(c)
  const limited = entry.count >= limit
  if (limited) {
    cloudlog({
      requestId: c.get('requestId'),
      message: 'Translation IP rate limited',
      ip,
      count: entry.count,
      limit,
    })
  }

  return { limited, resetAt: entry.resetAt, ip }
}

async function sha256Hex(value: string) {
  const buffer = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

async function translateStrings(ai: { run: (model: string, input: unknown) => Promise<unknown> }, strings: string[], targetLanguage: string) {
  const entries = createProtectedEntries(strings)
  const batches = buildBatches(entries)
  const translations = new Map<string, string>()

  // Keep Workers AI calls serialized so large pages do not fan out bursty
  // buildSegmentedText/ai.run requests and trip translation rate limits.
  for (const batch of batches) {
    const segmentedText = buildSegmentedText(batch)
    const result = await ai.run(TRANSLATION_MODEL, {
      text: segmentedText,
      source_lang: 'en',
      target_lang: targetLanguage,
    }) as { translated_text?: string }

    const translatedText = typeof result?.translated_text === 'string'
      ? result.translated_text
      : ''

    parseSegmentedTranslation(translatedText, batch).forEach((value, key) => {
      translations.set(key, value)
    })
  }

  return Object.fromEntries(translations)
}

export const app = honoFactory.createApp()

app.use('*', useCors)

app.post('/page', async (c) => {
  if (!c.env.AI) {
    throw quickError(503, 'translation_unavailable', 'Workers AI binding is not configured')
  }

  const body = await parseBody<TranslationBody>(c)
  const targetLanguage = typeof body.targetLanguage === 'string' ? body.targetLanguage.trim().toLowerCase() : ''
  if (!SUPPORTED_LANGUAGES.has(targetLanguage)) {
    throw quickError(400, 'unsupported_translation_language', 'Target language is not supported')
  }

  const strings = normalizeTranslationStrings(body.strings)
  const rateLimitStatus = await recordTranslationRequest(c)
  if (rateLimitStatus.limited) {
    const retryAfter = rateLimitStatus.resetAt
      ? Math.max(1, Math.ceil((rateLimitStatus.resetAt - Date.now()) / 1000))
      : TRANSLATION_IP_RATE_TTL_SECONDS
    c.header('Retry-After', String(retryAfter))
    throw quickError(429, 'translation_rate_limited', 'Too many translation requests')
  }

  const requestHash = await sha256Hex(JSON.stringify({
    model: TRANSLATION_MODEL,
    pagePath: body.pagePath ?? '',
    targetLanguage,
    strings,
  }))

  const cacheHelper = new CacheHelper(c)
  const cacheRequest = cacheHelper.buildRequest('/translation/page-cache', {
    hash: requestHash,
    lang: targetLanguage,
  })

  const cached = await cacheHelper.matchJson<TranslationResponsePayload>(cacheRequest)
  c.header('Cache-Control', `public, max-age=0, s-maxage=${CACHE_TTL_SECONDS}`)

  if (cached)
    return c.json(cached)

  const translations = strings.length > 0
    ? await translateStrings(c.env.AI, strings, targetLanguage)
    : {}

  const payload: TranslationResponsePayload = {
    requestHash,
    model: TRANSLATION_MODEL,
    translations,
  }

  await cacheHelper.putJson(cacheRequest, payload, CACHE_TTL_SECONDS)

  return c.json(payload)
})
