import type { D1Database } from '@cloudflare/workers-types'
import type { Context } from 'hono'
import sourceMessages from '../../../../messages/en.json' with { type: 'json' }
import { CacheHelper } from '../utils/cache.ts'
import { honoFactory, parseBody, quickError, useCors } from '../utils/hono.ts'
import { cloudlog, cloudlogErr, serializeError } from '../utils/logging.ts'
import { getEnv } from '../utils/utils.ts'

export const CACHE_TTL_SECONDS = 5 * 60
const PENDING_TRANSLATION_STORE_TTL_SECONDS = 60 * 60
const DEFAULT_TRANSLATION_MODEL = '@cf/meta/llama-3.1-8b-instruct-fast'
const MAX_BATCH_CHARACTERS = 6_000
const MAX_BATCH_ITEMS = 60
const TRANSLATION_CACHE_PATH = '/translation/messages-cache'
const TRANSLATION_STORE_CLEANUP_INTERVAL_SECONDS = 60
const TRANSLATION_REQUEUE_AFTER_SECONDS = 60
const TRANSLATION_STORE_TABLE = 'translation_messages_cache'

export const SUPPORTED_LANGUAGES = new Set([
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

interface TranslationBody {
  targetLanguage?: string
}

export interface TranslationMessagesResponsePayload {
  checksum: string
  messages: Record<string, string>
  model: string
  status: 'ready'
}

export type TranslationStoreStatus = 'pending' | 'ready'

export interface TranslationStoreEntry {
  checksum: string
  messages: Record<string, string>
  model: string
  nextBatchIndex: number
  status: TranslationStoreStatus
  targetLanguage: string
  updatedAt: number
}

export interface TranslationQueuePayload {
  batchIndex?: number
  checksum?: string
  model?: string
  targetLanguage?: string
}

export type MessageEntry = [string, string]

export const sourceMessageCatalog = sourceMessages as Record<string, string>
let translationStoreInitialized = false
let lastTranslationStoreCleanupAt = 0

export function getTranslationModel(c: Context) {
  return getEnv(c, 'TRANSLATION_MODEL') || DEFAULT_TRANSLATION_MODEL
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

export function buildBatches(messages: Record<string, string>) {
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

export function buildTranslationCacheRequests(cacheHelper: CacheHelper, checksum: string, targetLanguage: string) {
  const params = {
    checksum,
    lang: targetLanguage,
  }

  return {
    readyRequest: cacheHelper.buildRequest(TRANSLATION_CACHE_PATH, params),
  }
}

export function normalizeBatchIndex(value: unknown) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0)
    return 0
  return value
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

function getTranslationStore(c: Context) {
  const store = c.env.DB_STOREAPPS
  if (!store)
    quickError(503, 'translation_unavailable', 'Cloudflare D1 translation store is not configured')

  return store as D1Database
}

function getTranslationQueue(c: Context) {
  const queue = c.env.TRANSLATION_MESSAGES_QUEUE
  if (!queue)
    quickError(503, 'translation_unavailable', 'Cloudflare translation queue is not configured')

  return queue
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

export function readyPayloadFromStore(entry: TranslationStoreEntry): TranslationMessagesResponsePayload {
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

export function isPendingTranslationStale(entry: TranslationStoreEntry) {
  return entry.status === 'pending' && nowSeconds() - entry.updatedAt >= TRANSLATION_REQUEUE_AFTER_SECONDS
}

export function claimedTranslationBatchIndex(nextBatchIndex: number) {
  return nextBatchIndex < 0 ? Math.abs(nextBatchIndex) - 1 : null
}

export function translationBatchIndexFromStore(nextBatchIndex: number) {
  return claimedTranslationBatchIndex(nextBatchIndex) ?? nextBatchIndex
}

function claimedTranslationBatchMarker(batchIndex: number) {
  return -batchIndex - 1
}

async function deleteExpiredTranslationStoreEntries(db: D1Database) {
  const now = nowSeconds()
  if (now - lastTranslationStoreCleanupAt < TRANSLATION_STORE_CLEANUP_INTERVAL_SECONDS)
    return

  await db.prepare(`DELETE FROM ${TRANSLATION_STORE_TABLE} WHERE expires_at <= unixepoch()`).run()
  lastTranslationStoreCleanupAt = now
}

export async function readTranslationStoreEntry(c: Context, checksum: string, targetLanguage: string) {
  const db = getTranslationStore(c)
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

export function translationStoreTtlSeconds(entry: Pick<TranslationStoreEntry, 'status'>) {
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

export async function writeTranslationStoreEntry(c: Context, entry: TranslationStoreEntry) {
  const db = getTranslationStore(c)
  await ensureTranslationStore(db)
  await deleteExpiredTranslationStoreEntries(db)
  await upsertTranslationStoreEntry(db, entry)
}

async function insertPendingTranslationStoreEntry(c: Context, entry: TranslationStoreEntry) {
  const db = getTranslationStore(c)
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

async function touchTranslationStoreEntry(c: Context, entry: TranslationStoreEntry) {
  const db = getTranslationStore(c)
  await ensureTranslationStore(db)
  await db.prepare(
    `UPDATE ${TRANSLATION_STORE_TABLE}
     SET expires_at = unixepoch() + ?,
         updated_at = unixepoch()
     WHERE target_language = ?
       AND checksum = ?`,
  ).bind(PENDING_TRANSLATION_STORE_TTL_SECONDS, entry.targetLanguage, entry.checksum).run()
}

export async function claimTranslationBatch(c: Context, checksum: string, targetLanguage: string, batchIndex: number) {
  const db = getTranslationStore(c)
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
  ).bind(claimedTranslationBatchMarker(batchIndex), PENDING_TRANSLATION_STORE_TTL_SECONDS, targetLanguage, checksum, batchIndex).run()

  return result.meta.changes > 0
}

export async function releaseTranslationBatchClaim(c: Context, checksum: string, targetLanguage: string, batchIndex: number) {
  const db = getTranslationStore(c)
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
  ).bind(batchIndex, PENDING_TRANSLATION_STORE_TTL_SECONDS, targetLanguage, checksum, claimedTranslationBatchMarker(batchIndex)).run()

  return result.meta.changes > 0
}

export async function cacheReadyTranslationPayload(c: Context, cacheHelper: CacheHelper, readyRequest: Request, payload: TranslationMessagesResponsePayload, targetLanguage: string) {
  try {
    await cacheHelper.putJson(readyRequest, payload, CACHE_TTL_SECONDS)
  }
  catch (error) {
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'Unable to cache ready translation payload',
      error: serializeError(error),
      targetLanguage,
      cacheKey: readyRequest.url,
    })
  }
}

export async function enqueueTranslationBatch(c: Context, payload: Required<TranslationQueuePayload>) {
  const queue = getTranslationQueue(c)
  await queue.send(payload, { contentType: 'json' })
  cloudlog({
    requestId: c.get('requestId'),
    message: 'Queued message catalog translation batch',
    batchIndex: payload.batchIndex,
    targetLanguage: payload.targetLanguage,
  })
}

async function deleteTranslationStoreEntry(c: Context, entry: TranslationStoreEntry) {
  const db = getTranslationStore(c)
  await ensureTranslationStore(db)
  await db.prepare(
    `DELETE FROM ${TRANSLATION_STORE_TABLE}
     WHERE target_language = ?
       AND checksum = ?`,
  ).bind(entry.targetLanguage, entry.checksum).run()
}

async function queueTranslationIfNeeded(c: Context, payload: Required<TranslationQueuePayload>) {
  const pendingEntry: TranslationStoreEntry = {
    checksum: payload.checksum,
    messages: {},
    model: payload.model,
    nextBatchIndex: payload.batchIndex,
    status: 'pending',
    targetLanguage: payload.targetLanguage,
    updatedAt: nowSeconds(),
  }

  const claimed = await insertPendingTranslationStoreEntry(c, pendingEntry)
  if (!claimed) {
    const existingEntry = await readTranslationStoreEntry(c, payload.checksum, payload.targetLanguage)
    if (existingEntry)
      return existingEntry

    quickError(503, 'translation_unavailable', 'Translation queue is not available')
  }

  try {
    await enqueueTranslationBatch(c, payload)
  }
  catch (error) {
    await deleteTranslationStoreEntry(c, pendingEntry).catch(() => {})
    throw error
  }

  return pendingEntry
}

export async function currentSourceChecksum() {
  return sha256Hex(JSON.stringify(sourceMessageCatalog))
}

export const app = honoFactory.createApp()
app.use('*', useCors)

app.post('/messages', async (c) => {
  const body = await parseBody<TranslationBody>(c)
  const targetLanguage = typeof body.targetLanguage === 'string' ? body.targetLanguage.trim().toLowerCase() : ''
  if (!SUPPORTED_LANGUAGES.has(targetLanguage))
    quickError(400, 'unsupported_translation_language', 'Target language is not supported')

  if (targetLanguage === 'en')
    quickError(400, 'unsupported_translation_language', 'English messages are already bundled')

  const checksum = await currentSourceChecksum()
  const model = getTranslationModel(c)
  const cacheHelper = new CacheHelper(c)
  const { readyRequest } = buildTranslationCacheRequests(cacheHelper, checksum, targetLanguage)

  const cached = await cacheHelper.matchJson<TranslationMessagesResponsePayload>(readyRequest)
  if (cached) {
    c.header('Cache-Control', `public, max-age=0, s-maxage=${CACHE_TTL_SECONDS}`)
    return c.json(cached)
  }

  const storedEntry = await readTranslationStoreEntry(c, checksum, targetLanguage)
  if (storedEntry?.status === 'ready') {
    const payload = readyPayloadFromStore(storedEntry)
    await cacheReadyTranslationPayload(c, cacheHelper, readyRequest, payload, targetLanguage)
    c.header('Cache-Control', `public, max-age=0, s-maxage=${CACHE_TTL_SECONDS}`)
    return c.json(payload)
  }

  if (storedEntry?.status === 'pending') {
    if (isPendingTranslationStale(storedEntry)) {
      try {
        await enqueueTranslationBatch(c, {
          batchIndex: translationBatchIndexFromStore(storedEntry.nextBatchIndex),
          checksum,
          model: storedEntry.model,
          targetLanguage,
        })
        await touchTranslationStoreEntry(c, storedEntry)
      }
      catch (error) {
        cloudlogErr({
          requestId: c.get('requestId'),
          message: 'Unable to requeue stale message catalog translation',
          error: serializeError(error),
          targetLanguage,
        })
        quickError(503, 'translation_unavailable', 'Translation queue is not available')
      }
    }

    c.header('Cache-Control', 'no-store')
    c.header('Retry-After', '10')
    return c.json({ checksum, status: 'pending' }, 202)
  }

  try {
    const queuedEntry = await queueTranslationIfNeeded(c, {
      batchIndex: 0,
      checksum,
      model,
      targetLanguage,
    })

    if (queuedEntry.status === 'ready') {
      const payload = readyPayloadFromStore(queuedEntry)
      await cacheReadyTranslationPayload(c, cacheHelper, readyRequest, payload, targetLanguage)
      c.header('Cache-Control', `public, max-age=0, s-maxage=${CACHE_TTL_SECONDS}`)
      return c.json(payload)
    }
  }
  catch (error) {
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'Unable to queue message catalog translation',
      error: serializeError(error),
      targetLanguage,
    })
    quickError(503, 'translation_unavailable', 'Translation queue is not available')
  }

  c.header('Cache-Control', 'no-store')
  c.header('Retry-After', '10')
  return c.json({ checksum, status: 'pending' }, 202)
})

export const __translationTestUtils__ = {
  buildBatches,
  claimedTranslationBatchIndex,
  normalizeBatchIndex,
  translationBatchIndexFromStore,
  translationStoreTtlSeconds,
}
