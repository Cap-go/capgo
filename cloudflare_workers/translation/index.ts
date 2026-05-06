import type { D1Database, ExecutionContext, MessageBatch, Queue } from '@cloudflare/workers-types'
import type { Context } from 'hono'
import type { MessageEntry, TranslationQueuePayload, TranslationStoreEntry } from '../../supabase/functions/_backend/public/translation.ts'
import {
  buildBatches,
  buildTranslationCacheRequests,
  cacheReadyTranslationPayload,
  claimedTranslationBatchIndex,
  claimTranslationBatch,
  currentSourceChecksum,
  enqueueTranslationBatch,
  getTranslationModel,
  isPendingTranslationStale,
  normalizeBatchIndex,
  readTranslationStoreEntry,
  readyPayloadFromStore,
  releaseTranslationBatchClaim,
  sourceMessageCatalog,
  SUPPORTED_LANGUAGES,
  writeTranslationStoreEntry,
} from '../../supabase/functions/_backend/public/translation.ts'
import { CacheHelper } from '../../supabase/functions/_backend/utils/cache.ts'
import { BRES, honoFactory, parseBody, quickError } from '../../supabase/functions/_backend/utils/hono.ts'
import { cloudlog, cloudlogErr, serializeError } from '../../supabase/functions/_backend/utils/logging.ts'

const TRANSLATION_ATTEMPTS = 3
const PLACEHOLDER_PATTERN = /\{[\w.]+\}|%\w+%?|\$\d+/g

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
  DB_STOREAPPS: D1Database
  TRANSLATION_MESSAGES_QUEUE?: Queue<unknown>
}

function getTargetLanguageName(targetLanguage: string) {
  return LANGUAGE_NAMES[targetLanguage] ?? targetLanguage
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

async function processTranslationQueueBatch(c: Context, body: TranslationQueuePayload) {
  const targetLanguage = typeof body.targetLanguage === 'string' ? body.targetLanguage.trim().toLowerCase() : ''
  if (!SUPPORTED_LANGUAGES.has(targetLanguage) || targetLanguage === 'en') {
    cloudlogErr({
      requestId: c.get('requestId'),
      message: 'Ignoring unsupported queued translation language',
      targetLanguage,
    })
    return
  }

  const checksum = await currentSourceChecksum()
  if (body.checksum !== checksum) {
    cloudlog({
      requestId: c.get('requestId'),
      message: 'Ignoring stale queued translation message',
      queuedChecksum: body.checksum,
      checksum,
      targetLanguage,
    })
    return
  }

  const model = typeof body.model === 'string' && body.model.trim() ? body.model : getTranslationModel(c)
  const ai = c.env.AI as AiBinding | undefined
  if (!ai)
    quickError(503, 'translation_unavailable', 'Workers AI binding is not configured')

  const cacheHelper = new CacheHelper(c)
  const { readyRequest } = buildTranslationCacheRequests(cacheHelper, checksum, targetLanguage)
  const cached = await cacheHelper.matchJson(readyRequest)
  if (cached)
    return

  const storedEntry = await readTranslationStoreEntry(c, checksum, targetLanguage)
  if (!storedEntry)
    return

  if (storedEntry.status === 'ready') {
    await cacheReadyTranslationPayload(c, cacheHelper, readyRequest, readyPayloadFromStore(storedEntry), targetLanguage)
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

    const released = await releaseTranslationBatchClaim(c, checksum, targetLanguage, batchIndex)
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
      updatedAt: Math.floor(Date.now() / 1000),
    }
    await writeTranslationStoreEntry(c, readyEntry)
    await cacheReadyTranslationPayload(c, cacheHelper, readyRequest, readyPayloadFromStore(readyEntry), targetLanguage)
    return
  }

  if (batchIndex < nextBatchIndex)
    return

  if (batchIndex !== nextBatchIndex) {
    await enqueueTranslationBatch(c, {
      batchIndex: nextBatchIndex,
      checksum,
      model,
      targetLanguage,
    })
    return
  }

  const claimed = await claimTranslationBatch(c, checksum, targetLanguage, batchIndex)
  if (!claimed)
    return

  const batch = batches[batchIndex]
  if (!batch) {
    await releaseTranslationBatchClaim(c, checksum, targetLanguage, batchIndex).catch(() => {})
    return
  }

  let translatedBatch: Record<string, string>
  try {
    translatedBatch = await translateBatch(ai, model, targetLanguage, batch)
  }
  catch (error) {
    await releaseTranslationBatchClaim(c, checksum, targetLanguage, batchIndex).catch(() => {})
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
        updatedAt: Math.floor(Date.now() / 1000),
      }
      await writeTranslationStoreEntry(c, readyEntry)
      await cacheReadyTranslationPayload(c, cacheHelper, readyRequest, readyPayloadFromStore(readyEntry), targetLanguage)
      cloudlog({
        requestId: c.get('requestId'),
        message: 'Message catalog translation cached',
        targetLanguage,
        batchCount: batches.length,
      })
      return
    }

    await writeTranslationStoreEntry(c, {
      checksum,
      messages: mergedMessages,
      model,
      nextBatchIndex: followingBatchIndex,
      status: 'pending',
      targetLanguage,
      updatedAt: Math.floor(Date.now() / 1000),
    })
    await enqueueTranslationBatch(c, {
      batchIndex: followingBatchIndex,
      checksum,
      model,
      targetLanguage,
    })
  }
  catch (error) {
    await writeTranslationStoreEntry(c, {
      checksum,
      messages: translatedMessages,
      model,
      nextBatchIndex: batchIndex,
      status: 'pending',
      targetLanguage,
      updatedAt: Math.floor(Date.now() / 1000),
    }).catch(() => {})
    throw error
  }
}

const translationMessagesQueue = honoFactory.createApp()

translationMessagesQueue.post('/', async (c) => {
  const body = await parseBody<TranslationQueuePayload>(c)
  await processTranslationQueueBatch(c, body)
  return c.json(BRES)
})

export default {
  fetch: translationMessagesQueue.fetch,
  async queue(batch: MessageBatch<TranslationQueuePayload>, env: TranslationWorkerBindings, ctx: ExecutionContext) {
    for (const message of batch.messages) {
      let responseStatus: number | undefined
      try {
        const response = await translationMessagesQueue.fetch(new Request('https://translation-messages.queue/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(message.body),
        }), env, ctx)
        responseStatus = response.status
        if (!response.ok)
          throw new Error(`Translation queue consumer failed with ${response.status}`)

        message.ack()
      }
      catch (error) {
        cloudlogErr({
          message: 'Translation queue consumer error',
          error: serializeError(error),
          queueMessage: message.body,
          responseStatus,
        })
        message.retry({ delaySeconds: 30 })
      }
    }
  },
}

export const __translationWorkerTestUtils__ = {
  keepTranslation,
  parseTranslationObject,
}
