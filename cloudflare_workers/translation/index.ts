import type { D1Database, ExecutionContext, MessageBatch, Queue } from '@cloudflare/workers-types'
import sourceMessages from '../../messages/en.json' with { type: 'json' }

const CACHE_TTL_SECONDS = 5 * 60
const PENDING_TRANSLATION_STORE_TTL_SECONDS = 60 * 60
const DEFAULT_TRANSLATION_MODEL = '@cf/meta/llama-3.1-8b-instruct-fast'
const MAX_BATCH_CHARACTERS = 6_000
const MAX_BATCH_ITEMS = 60
const TRANSLATION_ATTEMPTS = 3
const TRANSLATION_CACHE_PATH = '/translation/messages-cache'
const TRANSLATION_STORE_CLEANUP_INTERVAL_SECONDS = 60
const TRANSLATION_REQUEUE_AFTER_SECONDS = 60
const TRANSLATION_STORE_TABLE = 'translation_messages_cache'
const CLAIMED_TRANSLATION_BATCH_INDEX_OFFSET = 1_000_000_000
const PLACEHOLDER_PATTERN = /\{[\w.]+\}|%\w+%?|\$\d+/g

const SUPPORTED_LANGUAGES = new Set([
  'de',
  'en',
  'es',
  'fr',
  'hi',
  'id',
  'it',
  'ja',
  'ko',
  'pl',
  'pt',
  'pt-br',
  'ru',
  'tr',
  'vi',
  'zh',
  'zh-cn',
])

const LANGUAGE_NAMES: Record<string, string> = {
  'de': 'German',
  'en': 'English',
  'es': 'Spanish',
  'fr': 'French',
  'hi': 'Hindi',
  'id': 'Indonesian',
  'it': 'Italian',
  'ja': 'Japanese',
  'ko': 'Korean',
  'pl': 'Polish',
  'pt': 'Portuguese',
  'pt-br': 'Brazilian Portuguese',
  'ru': 'Russian',
  'tr': 'Turkish',
  'vi': 'Vietnamese',
  'zh': 'Simplified Chinese',
  'zh-cn': 'Simplified Chinese',
}

interface AiBinding {
  run: (model: string, input: unknown) => Promise<unknown>
}

interface TranslationWorkerBindings {
  AI?: AiBinding
  DB_STOREAPPS?: D1Database
  ENV_NAME?: string
  TRANSLATION_MESSAGES_QUEUE?: Queue<Required<TranslationQueuePayload>>
  TRANSLATION_MODEL?: string
}

interface TranslationBody {
  targetLanguage?: string
}

interface TranslationMessagesResponsePayload {
  checksum: string
  messages: Record<string, string>
  model: string
  status: 'ready'
}

type TranslationStoreStatus = 'pending' | 'ready'

interface TranslationStoreEntry {
  checksum: string
  messages: Record<string, string>
  model: string
  nextBatchIndex: number
  status: TranslationStoreStatus
  targetLanguage: string
  updatedAt: number
}

interface TranslationQueuePayload {
  batchIndex?: number
  checksum?: string
  model?: string
  targetLanguage?: string
}

type MessageEntry = [string, string]

class PublicHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

const sourceMessageCatalog = sourceMessages as Record<string, string>
const sourceCatalogChecksumPromise = sha256Hex(JSON.stringify(sourceMessageCatalog))
let translationStoreInitialized = false
let lastTranslationStoreCleanupAt = 0

function fail(status: number, code: string, message: string): never {
  throw new PublicHttpError(status, code, message)
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Origin': '*',
  }
}

function jsonResponse(data: unknown, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(),
      'Content-Type': 'application/json',
      ...headers,
    },
  })
}

function errorResponse(status: number, code: string, message: string) {
  return jsonResponse({ error: code, message }, status)
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack,
    }
  }
  return error
}

function cloudlog(payload: Record<string, unknown>) {
  console.log(JSON.stringify(payload))
}

function cloudlogErr(payload: Record<string, unknown>) {
  console.error(JSON.stringify(payload))
}

async function parseJsonBody<T>(request: Request): Promise<T> {
  try {
    return await request.json() as T
  }
  catch {
    return {} as T
  }
}

function requestIdFrom(request: Request) {
  return request.headers.get('x-request-id') ?? crypto.randomUUID()
}

function getTranslationModel(env: TranslationWorkerBindings) {
  return env.TRANSLATION_MODEL || DEFAULT_TRANSLATION_MODEL
}

function getTargetLanguageName(targetLanguage: string) {
  return LANGUAGE_NAMES[targetLanguage] ?? targetLanguage
}

async function sha256Hex(value: string) {
  const buffer = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

function recordOf(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function extractContentText(content: unknown): string {
  if (typeof content === 'string')
    return content
  if (!Array.isArray(content))
    return ''

  return content.map((item) => {
    if (typeof item === 'string')
      return item
    const itemRecord = recordOf(item)
    return typeof itemRecord?.text === 'string' ? itemRecord.text : ''
  }).join('')
}

function extractAiText(result: unknown): string {
  if (typeof result === 'string')
    return result

  const resultRecord = recordOf(result)
  if (!resultRecord)
    return ''

  for (const key of ['response', 'text', 'result', 'output']) {
    const value = resultRecord[key]
    if (typeof value === 'string')
      return value
    const valueRecord = recordOf(value)
    if (valueRecord)
      return extractAiText(valueRecord)
    if (Array.isArray(value))
      return extractContentText(value)
  }

  const choices = resultRecord.choices
  if (Array.isArray(choices)) {
    for (const choice of choices) {
      const choiceRecord = recordOf(choice)
      if (typeof choiceRecord?.text === 'string')
        return choiceRecord.text
      const message = recordOf(choiceRecord?.message)
      const text = extractContentText(message?.content)
      if (text)
        return text
    }
  }

  return ''
}

function parseTranslationObject(value: unknown): Record<string, string> | null {
  const record = recordOf(value)
  if (record) {
    const translations = recordOf(record.translations)
    if (translations && Object.values(translations).every(entry => typeof entry === 'string'))
      return translations as Record<string, string>
    if (Object.values(record).every(entry => typeof entry === 'string'))
      return record as Record<string, string>
  }

  if (typeof value !== 'string')
    return null

  const trimmed = value.trim()
  if (!trimmed)
    return null

  try {
    return parseTranslationObject(JSON.parse(trimmed))
  }
  catch {
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start < 0 || end <= start)
      return null
    try {
      return parseTranslationObject(JSON.parse(trimmed.slice(start, end + 1)))
    }
    catch {
      return null
    }
  }
}

function placeholders(value: string) {
  return value.match(PLACEHOLDER_PATTERN) ?? []
}

function keepTranslation(source: string, translated: unknown) {
  if (typeof translated !== 'string')
    return source

  const normalized = translated.trim()
  if (!normalized)
    return source

  const requiredPlaceholders = placeholders(source)
  if (!requiredPlaceholders.every(token => normalized.includes(token)))
    return source

  return normalized
}

function buildBatches(messages: Record<string, string>) {
  const batches: MessageEntry[][] = []
  let current: MessageEntry[] = []
  let currentCharacters = 0

  for (const entry of Object.entries(messages)) {
    const nextCharacters = entry[0].length + entry[1].length
    if (current.length > 0 && (current.length >= MAX_BATCH_ITEMS || currentCharacters + nextCharacters > MAX_BATCH_CHARACTERS)) {
      batches.push(current)
      current = []
      currentCharacters = 0
    }

    current.push(entry)
    currentCharacters += nextCharacters
  }

  if (current.length > 0)
    batches.push(current)

  return batches
}

function translationSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      translations: {
        type: 'object',
        additionalProperties: {
          type: 'string',
        },
      },
    },
    required: ['translations'],
  }
}

async function translateBatch(ai: AiBinding, model: string, targetLanguage: string, batch: MessageEntry[]) {
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= TRANSLATION_ATTEMPTS; attempt += 1) {
    try {
      const result = await ai.run(model, {
        temperature: 0,
        max_tokens: 8192,
        response_format: {
          type: 'json_schema',
          json_schema: translationSchema(),
        },
        messages: [
          {
            role: 'system',
            content: [
              `Translate Capgo application UI messages from English to ${getTargetLanguageName(targetLanguage)}.`,
              'Return JSON only, with a translations object keyed by the exact input keys.',
              'Translate user-facing text naturally. Keep product names, code, URLs, commands, numbers, and placeholders unchanged.',
              'Every placeholder like {count}, %name%, or $1 must be copied exactly.',
            ].join(' '),
          },
          {
            role: 'user',
            content: JSON.stringify({
              messages: Object.fromEntries(batch),
            }),
          },
        ],
      })

      const translations = parseTranslationObject(extractAiText(result) || result)
      if (!translations)
        throw new Error('Workers AI returned invalid JSON')

      if (!batch.some(([key]) => typeof translations[key] === 'string'))
        throw new Error('Workers AI returned no translated messages')

      return Object.fromEntries(
        batch.map(([key, source]) => [key, keepTranslation(source, translations[key])] as const),
      )
    }
    catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      cloudlog({
        message: 'Message translation batch failed',
        targetLanguage,
        attempt,
        batchSize: batch.length,
        error: lastError.message,
      })
    }
  }

  throw lastError ?? new Error('Message translation failed')
}

function messageCatalogOf(value: unknown): Record<string, string> {
  if (typeof value === 'string') {
    try {
      return messageCatalogOf(JSON.parse(value))
    }
    catch {
      return {}
    }
  }

  const record = recordOf(value)
  if (!record)
    return {}

  return Object.fromEntries(
    Object.entries(record).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  )
}

function getTranslationStore(env: TranslationWorkerBindings) {
  if (!env.DB_STOREAPPS)
    fail(503, 'translation_unavailable', 'Cloudflare D1 translation store is not configured')

  return env.DB_STOREAPPS
}

function getTranslationQueue(env: TranslationWorkerBindings) {
  if (!env.TRANSLATION_MESSAGES_QUEUE)
    fail(503, 'translation_unavailable', 'Cloudflare translation queue is not configured')

  return env.TRANSLATION_MESSAGES_QUEUE
}

async function ensureTranslationStore(db: D1Database) {
  if (translationStoreInitialized)
    return

  await db.prepare(
    `CREATE TABLE IF NOT EXISTS ${TRANSLATION_STORE_TABLE} (
       target_language TEXT NOT NULL,
       checksum TEXT NOT NULL,
       model TEXT NOT NULL,
       status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'ready')),
       messages TEXT NOT NULL DEFAULT '{}',
       next_batch_index INTEGER NOT NULL DEFAULT 0 CHECK(next_batch_index >= 0),
       expires_at INTEGER NOT NULL,
       created_at INTEGER NOT NULL DEFAULT (unixepoch()),
       updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
       PRIMARY KEY (target_language, checksum)
     )`,
  ).run()
  await db.prepare(
    `CREATE INDEX IF NOT EXISTS idx_${TRANSLATION_STORE_TABLE}_expires_at
     ON ${TRANSLATION_STORE_TABLE} (expires_at)`,
  ).run()
  translationStoreInitialized = true
}

function parseTranslationStoreEntry(row: unknown): TranslationStoreEntry | null {
  const record = recordOf(row)
  if (!record)
    return null

  const status = record.status
  const checksum = record.checksum
  const model = record.model
  const targetLanguage = record.target_language
  const nextBatchIndex = Number(record.next_batch_index)
  const updatedAt = Number(record.updated_at)
  if ((status !== 'pending' && status !== 'ready') || typeof checksum !== 'string' || typeof model !== 'string' || typeof targetLanguage !== 'string' || !Number.isInteger(nextBatchIndex) || !Number.isFinite(updatedAt))
    return null

  return {
    checksum,
    messages: messageCatalogOf(record.messages),
    model,
    nextBatchIndex,
    status,
    targetLanguage,
    updatedAt,
  }
}

function readyPayloadFromStore(entry: TranslationStoreEntry): TranslationMessagesResponsePayload {
  return {
    checksum: entry.checksum,
    messages: entry.messages,
    model: entry.model,
    status: 'ready',
  }
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000)
}

function isPendingTranslationStale(entry: TranslationStoreEntry) {
  return entry.status === 'pending' && nowSeconds() - entry.updatedAt >= TRANSLATION_REQUEUE_AFTER_SECONDS
}

function claimedTranslationBatchIndex(nextBatchIndex: number) {
  return nextBatchIndex >= CLAIMED_TRANSLATION_BATCH_INDEX_OFFSET ? nextBatchIndex - CLAIMED_TRANSLATION_BATCH_INDEX_OFFSET : null
}

function translationBatchIndexFromStore(nextBatchIndex: number) {
  return claimedTranslationBatchIndex(nextBatchIndex) ?? nextBatchIndex
}

function translationBatchClaimMarker(batchIndex: number) {
  return CLAIMED_TRANSLATION_BATCH_INDEX_OFFSET + batchIndex
}

async function deleteExpiredTranslationStoreEntries(db: D1Database) {
  const now = nowSeconds()
  if (now - lastTranslationStoreCleanupAt < TRANSLATION_STORE_CLEANUP_INTERVAL_SECONDS)
    return

  await db.prepare(`DELETE FROM ${TRANSLATION_STORE_TABLE} WHERE expires_at <= unixepoch()`).run()
  lastTranslationStoreCleanupAt = now
}

async function readTranslationStoreEntry(env: TranslationWorkerBindings, checksum: string, targetLanguage: string) {
  const db = getTranslationStore(env)
  await ensureTranslationStore(db)
  await deleteExpiredTranslationStoreEntries(db)
  const row = await db.prepare(
    `SELECT checksum, messages, model, next_batch_index, status, target_language, updated_at
     FROM ${TRANSLATION_STORE_TABLE}
     WHERE target_language = ?
       AND checksum = ?
       AND expires_at > unixepoch()
     LIMIT 1`,
  ).bind(targetLanguage, checksum).first()

  return parseTranslationStoreEntry(row)
}

function translationStoreTtlSeconds(entry: Pick<TranslationStoreEntry, 'status'>) {
  return entry.status === 'pending' ? PENDING_TRANSLATION_STORE_TTL_SECONDS : CACHE_TTL_SECONDS
}

async function upsertTranslationStoreEntry(db: D1Database, entry: TranslationStoreEntry, ttlSeconds = translationStoreTtlSeconds(entry)) {
  await db.prepare(
    `INSERT INTO ${TRANSLATION_STORE_TABLE} (
       target_language,
       checksum,
       model,
       status,
       messages,
       next_batch_index,
       expires_at,
       updated_at
     )
     VALUES (?, ?, ?, ?, ?, ?, unixepoch() + ?, unixepoch())
     ON CONFLICT (target_language, checksum) DO UPDATE
     SET model = excluded.model,
         status = excluded.status,
         messages = excluded.messages,
         next_batch_index = excluded.next_batch_index,
         expires_at = excluded.expires_at,
         updated_at = unixepoch()`,
  ).bind(entry.targetLanguage, entry.checksum, entry.model, entry.status, JSON.stringify(entry.messages), entry.nextBatchIndex, ttlSeconds).run()
}

async function writeTranslationStoreEntry(env: TranslationWorkerBindings, entry: TranslationStoreEntry) {
  const db = getTranslationStore(env)
  await ensureTranslationStore(db)
  await deleteExpiredTranslationStoreEntries(db)
  await upsertTranslationStoreEntry(db, entry)
}

async function insertPendingTranslationStoreEntry(env: TranslationWorkerBindings, entry: TranslationStoreEntry) {
  const db = getTranslationStore(env)
  await ensureTranslationStore(db)
  await deleteExpiredTranslationStoreEntries(db)
  const result = await db.prepare(
    `INSERT INTO ${TRANSLATION_STORE_TABLE} (
       target_language,
       checksum,
       model,
       status,
       messages,
       next_batch_index,
       expires_at,
       updated_at
     )
     VALUES (?, ?, ?, ?, ?, ?, unixepoch() + ?, unixepoch())
     ON CONFLICT (target_language, checksum) DO UPDATE
     SET model = excluded.model,
         status = excluded.status,
         messages = excluded.messages,
         next_batch_index = excluded.next_batch_index,
         expires_at = excluded.expires_at,
         updated_at = unixepoch()
     WHERE ${TRANSLATION_STORE_TABLE}.expires_at <= unixepoch()`,
  ).bind(entry.targetLanguage, entry.checksum, entry.model, entry.status, JSON.stringify(entry.messages), entry.nextBatchIndex, PENDING_TRANSLATION_STORE_TTL_SECONDS).run()

  return result.meta.changes > 0
}

async function touchTranslationStoreEntry(env: TranslationWorkerBindings, entry: TranslationStoreEntry) {
  const db = getTranslationStore(env)
  await ensureTranslationStore(db)
  await db.prepare(
    `UPDATE ${TRANSLATION_STORE_TABLE}
     SET expires_at = unixepoch() + ?,
         updated_at = unixepoch()
     WHERE target_language = ?
       AND checksum = ?`,
  ).bind(PENDING_TRANSLATION_STORE_TTL_SECONDS, entry.targetLanguage, entry.checksum).run()
}

async function claimTranslationBatch(env: TranslationWorkerBindings, checksum: string, targetLanguage: string, batchIndex: number) {
  const db = getTranslationStore(env)
  await ensureTranslationStore(db)
  const result = await db.prepare(
    `UPDATE ${TRANSLATION_STORE_TABLE}
     SET next_batch_index = ?,
         expires_at = unixepoch() + ?,
         updated_at = unixepoch()
     WHERE target_language = ?
       AND checksum = ?
       AND status = 'pending'
       AND next_batch_index = ?
       AND expires_at > unixepoch()`,
  ).bind(translationBatchClaimMarker(batchIndex), PENDING_TRANSLATION_STORE_TTL_SECONDS, targetLanguage, checksum, batchIndex).run()

  return result.meta.changes > 0
}

async function releaseTranslationBatchClaim(env: TranslationWorkerBindings, checksum: string, targetLanguage: string, batchIndex: number) {
  const db = getTranslationStore(env)
  await ensureTranslationStore(db)
  const result = await db.prepare(
    `UPDATE ${TRANSLATION_STORE_TABLE}
     SET next_batch_index = ?,
         expires_at = unixepoch() + ?,
         updated_at = unixepoch()
     WHERE target_language = ?
       AND checksum = ?
       AND status = 'pending'
       AND next_batch_index = ?`,
  ).bind(batchIndex, PENDING_TRANSLATION_STORE_TTL_SECONDS, targetLanguage, checksum, translationBatchClaimMarker(batchIndex)).run()

  return result.meta.changes > 0
}

async function deleteTranslationStoreEntry(env: TranslationWorkerBindings, entry: TranslationStoreEntry) {
  const db = getTranslationStore(env)
  await ensureTranslationStore(db)
  await db.prepare(
    `DELETE FROM ${TRANSLATION_STORE_TABLE}
     WHERE target_language = ?
       AND checksum = ?`,
  ).bind(entry.targetLanguage, entry.checksum).run()
}

function workerCache() {
  return (caches as CacheStorage & { default: Cache }).default
}

function buildTranslationCacheRequest(checksum: string, targetLanguage: string) {
  const url = new URL(TRANSLATION_CACHE_PATH, 'https://translation-cache.capgo.local')
  url.searchParams.set('checksum', checksum)
  url.searchParams.set('lang', targetLanguage)
  return new Request(url.toString())
}

async function matchReadyTranslationPayload(request: Request) {
  const cached = await workerCache().match(request)
  if (!cached)
    return null

  try {
    return await cached.json() as TranslationMessagesResponsePayload
  }
  catch {
    return null
  }
}

async function cacheReadyTranslationPayload(requestId: string | undefined, readyRequest: Request, payload: TranslationMessagesResponsePayload, targetLanguage: string) {
  try {
    await workerCache().put(readyRequest, new Response(JSON.stringify(payload), {
      headers: {
        'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}`,
        'Content-Type': 'application/json',
      },
    }))
  }
  catch (error) {
    cloudlogErr({
      requestId,
      message: 'Unable to cache ready translation payload',
      error: serializeError(error),
      targetLanguage,
      cacheKey: readyRequest.url,
    })
  }
}

async function enqueueTranslationBatch(env: TranslationWorkerBindings, payload: Required<TranslationQueuePayload>, requestId?: string) {
  const queue = getTranslationQueue(env)
  await queue.send(payload, { contentType: 'json' })
  cloudlog({
    requestId,
    message: 'Queued message catalog translation batch',
    batchIndex: payload.batchIndex,
    targetLanguage: payload.targetLanguage,
  })
}

async function queueTranslationIfNeeded(env: TranslationWorkerBindings, payload: Required<TranslationQueuePayload>, requestId?: string) {
  const pendingEntry: TranslationStoreEntry = {
    checksum: payload.checksum,
    messages: {},
    model: payload.model,
    nextBatchIndex: payload.batchIndex,
    status: 'pending',
    targetLanguage: payload.targetLanguage,
    updatedAt: nowSeconds(),
  }

  const claimed = await insertPendingTranslationStoreEntry(env, pendingEntry)
  if (!claimed) {
    const existingEntry = await readTranslationStoreEntry(env, payload.checksum, payload.targetLanguage)
    if (existingEntry)
      return existingEntry

    fail(503, 'translation_unavailable', 'Translation queue is not available')
  }

  try {
    await enqueueTranslationBatch(env, payload, requestId)
  }
  catch (error) {
    await deleteTranslationStoreEntry(env, pendingEntry).catch(() => {})
    throw error
  }

  return pendingEntry
}

function normalizeBatchIndex(value: unknown) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0)
    return 0
  return value
}

function currentSourceChecksum() {
  return sourceCatalogChecksumPromise
}

async function handleTranslationMessages(request: Request, env: TranslationWorkerBindings) {
  const requestId = requestIdFrom(request)
  const body = await parseJsonBody<TranslationBody>(request)
  const targetLanguage = typeof body.targetLanguage === 'string' ? body.targetLanguage.trim().toLowerCase() : ''
  if (!SUPPORTED_LANGUAGES.has(targetLanguage))
    fail(400, 'unsupported_translation_language', 'Target language is not supported')

  if (targetLanguage === 'en')
    fail(400, 'unsupported_translation_language', 'English messages are already bundled')

  const checksum = await currentSourceChecksum()
  const model = getTranslationModel(env)
  const readyRequest = buildTranslationCacheRequest(checksum, targetLanguage)

  const cached = await matchReadyTranslationPayload(readyRequest)
  if (cached) {
    return jsonResponse(cached, 200, {
      'Cache-Control': `public, max-age=0, s-maxage=${CACHE_TTL_SECONDS}`,
    })
  }

  const storedEntry = await readTranslationStoreEntry(env, checksum, targetLanguage)
  if (storedEntry?.status === 'ready') {
    const payload = readyPayloadFromStore(storedEntry)
    await cacheReadyTranslationPayload(requestId, readyRequest, payload, targetLanguage)
    return jsonResponse(payload, 200, {
      'Cache-Control': `public, max-age=0, s-maxage=${CACHE_TTL_SECONDS}`,
    })
  }

  if (storedEntry?.status === 'pending') {
    if (isPendingTranslationStale(storedEntry)) {
      try {
        await enqueueTranslationBatch(env, {
          batchIndex: translationBatchIndexFromStore(storedEntry.nextBatchIndex),
          checksum,
          model: storedEntry.model,
          targetLanguage,
        }, requestId)
        if (claimedTranslationBatchIndex(storedEntry.nextBatchIndex) === null)
          await touchTranslationStoreEntry(env, storedEntry)
      }
      catch (error) {
        cloudlogErr({
          requestId,
          message: 'Unable to requeue stale message catalog translation',
          error: serializeError(error),
          targetLanguage,
        })
        fail(503, 'translation_unavailable', 'Translation queue is not available')
      }
    }

    return jsonResponse({ checksum, status: 'pending' }, 202, {
      'Cache-Control': 'no-store',
      'Retry-After': '10',
    })
  }

  try {
    const queuedEntry = await queueTranslationIfNeeded(env, {
      batchIndex: 0,
      checksum,
      model,
      targetLanguage,
    }, requestId)

    if (queuedEntry.status === 'ready') {
      const payload = readyPayloadFromStore(queuedEntry)
      await cacheReadyTranslationPayload(requestId, readyRequest, payload, targetLanguage)
      return jsonResponse(payload, 200, {
        'Cache-Control': `public, max-age=0, s-maxage=${CACHE_TTL_SECONDS}`,
      })
    }
  }
  catch (error) {
    cloudlogErr({
      requestId,
      message: 'Unable to queue message catalog translation',
      error: serializeError(error),
      targetLanguage,
    })
    fail(503, 'translation_unavailable', 'Translation queue is not available')
  }

  return jsonResponse({ checksum, status: 'pending' }, 202, {
    'Cache-Control': 'no-store',
    'Retry-After': '10',
  })
}

async function processTranslationQueueBatch(env: TranslationWorkerBindings, body: TranslationQueuePayload, requestId?: string) {
  const targetLanguage = typeof body.targetLanguage === 'string' ? body.targetLanguage.trim().toLowerCase() : ''
  if (!SUPPORTED_LANGUAGES.has(targetLanguage) || targetLanguage === 'en') {
    cloudlogErr({
      requestId,
      message: 'Ignoring unsupported queued translation language',
      targetLanguage,
    })
    return
  }

  const checksum = await currentSourceChecksum()
  if (body.checksum !== checksum) {
    cloudlog({
      requestId,
      message: 'Ignoring stale queued translation message',
      queuedChecksum: body.checksum,
      checksum,
      targetLanguage,
    })
    return
  }

  const model = typeof body.model === 'string' && body.model.trim() ? body.model : getTranslationModel(env)
  const ai = env.AI
  if (!ai)
    fail(503, 'translation_unavailable', 'Workers AI binding is not configured')

  const readyRequest = buildTranslationCacheRequest(checksum, targetLanguage)
  const cached = await matchReadyTranslationPayload(readyRequest)
  if (cached)
    return

  const storedEntry = await readTranslationStoreEntry(env, checksum, targetLanguage)
  if (!storedEntry)
    return

  if (storedEntry.status === 'ready') {
    await cacheReadyTranslationPayload(requestId, readyRequest, readyPayloadFromStore(storedEntry), targetLanguage)
    return
  }

  if (storedEntry.status !== 'pending')
    return

  const batches = buildBatches(sourceMessageCatalog)
  const translatedMessages = storedEntry.messages
  let nextBatchIndex = storedEntry.nextBatchIndex
  const batchIndex = normalizeBatchIndex(body.batchIndex)
  const claimedBatchIndex = claimedTranslationBatchIndex(nextBatchIndex)

  if (claimedBatchIndex !== null) {
    if (batchIndex !== claimedBatchIndex)
      return
    if (!isPendingTranslationStale(storedEntry))
      return

    const released = await releaseTranslationBatchClaim(env, checksum, targetLanguage, batchIndex)
    if (!released)
      return

    nextBatchIndex = claimedBatchIndex
  }

  if (nextBatchIndex >= batches.length) {
    const readyEntry: TranslationStoreEntry = {
      checksum,
      messages: translatedMessages,
      model,
      nextBatchIndex,
      status: 'ready',
      targetLanguage,
      updatedAt: nowSeconds(),
    }
    await writeTranslationStoreEntry(env, readyEntry)
    await cacheReadyTranslationPayload(requestId, readyRequest, readyPayloadFromStore(readyEntry), targetLanguage)
    return
  }

  if (batchIndex < nextBatchIndex)
    return

  if (batchIndex !== nextBatchIndex) {
    await enqueueTranslationBatch(env, {
      batchIndex: nextBatchIndex,
      checksum,
      model,
      targetLanguage,
    }, requestId)
    return
  }

  const claimed = await claimTranslationBatch(env, checksum, targetLanguage, batchIndex)
  if (!claimed)
    return

  const batch = batches[batchIndex]
  if (!batch) {
    await releaseTranslationBatchClaim(env, checksum, targetLanguage, batchIndex).catch(() => {})
    return
  }

  let translatedBatch: Record<string, string>
  try {
    translatedBatch = await translateBatch(ai, model, targetLanguage, batch)
  }
  catch (error) {
    await releaseTranslationBatchClaim(env, checksum, targetLanguage, batchIndex).catch(() => {})
    throw error
  }

  const mergedMessages = {
    ...translatedMessages,
    ...translatedBatch,
  }
  const followingBatchIndex = batchIndex + 1

  try {
    if (followingBatchIndex >= batches.length) {
      const readyEntry: TranslationStoreEntry = {
        checksum,
        messages: mergedMessages,
        model,
        nextBatchIndex: followingBatchIndex,
        status: 'ready',
        targetLanguage,
        updatedAt: nowSeconds(),
      }
      await writeTranslationStoreEntry(env, readyEntry)
      await cacheReadyTranslationPayload(requestId, readyRequest, readyPayloadFromStore(readyEntry), targetLanguage)
      cloudlog({
        requestId,
        message: 'Message catalog translation cached',
        targetLanguage,
        batchCount: batches.length,
      })
      return
    }

    await writeTranslationStoreEntry(env, {
      checksum,
      messages: mergedMessages,
      model,
      nextBatchIndex: followingBatchIndex,
      status: 'pending',
      targetLanguage,
      updatedAt: nowSeconds(),
    })
    await enqueueTranslationBatch(env, {
      batchIndex: followingBatchIndex,
      checksum,
      model,
      targetLanguage,
    }, requestId)
  }
  catch (error) {
    await writeTranslationStoreEntry(env, {
      checksum,
      messages: translatedMessages,
      model,
      nextBatchIndex: batchIndex,
      status: 'pending',
      targetLanguage,
      updatedAt: nowSeconds(),
    }).catch(() => {})
    throw error
  }
}

async function fetchHandler(request: Request, env: TranslationWorkerBindings) {
  if (request.method === 'OPTIONS')
    return new Response(null, { status: 204, headers: corsHeaders() })

  const url = new URL(request.url)
  if (request.method === 'POST' && (url.pathname === '/translation/messages' || url.pathname === '/messages'))
    return handleTranslationMessages(request, env)

  return errorResponse(404, 'not_found', 'Not found')
}

export default {
  async fetch(request: Request, env: TranslationWorkerBindings) {
    try {
      return await fetchHandler(request, env)
    }
    catch (error) {
      if (error instanceof PublicHttpError)
        return errorResponse(error.status, error.code, error.message)

      cloudlogErr({
        requestId: requestIdFrom(request),
        message: 'Translation worker request failed',
        error: serializeError(error),
      })
      return errorResponse(500, 'internal_error', 'Internal server error')
    }
  },
  async queue(batch: MessageBatch<TranslationQueuePayload>, env: TranslationWorkerBindings, _ctx: ExecutionContext) {
    for (const message of batch.messages) {
      try {
        await processTranslationQueueBatch(env, message.body)
        message.ack()
      }
      catch (error) {
        cloudlogErr({
          message: 'Translation queue consumer error',
          error: serializeError(error),
          queueMessage: message.body,
        })
        message.retry({ delaySeconds: 30 })
      }
    }
  },
}

export const __translationWorkerTestUtils__ = {
  buildBatches,
  claimedTranslationBatchIndex,
  keepTranslation,
  normalizeBatchIndex,
  parseTranslationObject,
  translationBatchClaimMarker,
  translationBatchIndexFromStore,
  translationStoreTtlSeconds,
}
