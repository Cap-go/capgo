import type { Context } from 'hono'
import type { PluginNotificationQueueItem } from './plugin_notification_queue.ts'
import { parsePluginNotificationQueueItem, PLUGIN_NOTIFICATION_QUEUE_PREFIX } from './plugin_notification_queue.ts'
import { cloudlog, cloudlogErr, serializeError } from './logging.ts'
import { getEnv } from './utils.ts'

const PLUGIN_NOTIFICATION_FLUSH_LIMIT = 100
const PLUGIN_NOTIFICATION_PROCESSING_PREFIX = 'plugin:notif:processing:v1:'
const PLUGIN_NOTIFICATION_PROCESSING_TTL_SECONDS = 120

export interface PluginNotificationFlushResult {
  status: 'ok'
  scanned: number
  transferred: number
  deleted: number
  failed: number
}

function getPluginNotificationTriggerUrl(c: Context) {
  const cfUrl = getEnv(c, 'CLOUDFLARE_FUNCTION_URL')
  if (cfUrl)
    return `${cfUrl}/triggers/plugin_notifications`

  const supabaseUrl = getEnv(c, 'SUPABASE_URL')
  if (supabaseUrl)
    return `${supabaseUrl}/functions/v1/triggers/plugin_notifications`

  return null
}

async function postPluginNotificationBatch(c: Context, items: PluginNotificationQueueItem[]) {
  const url = getPluginNotificationTriggerUrl(c)
  const apiSecret = getEnv(c, 'API_SECRET')
  if (!url || !apiSecret) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Plugin notification trigger config missing', hasUrl: Boolean(url), hasApiSecret: Boolean(apiSecret) })
    return false
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apisecret': apiSecret,
    },
    body: JSON.stringify({ items }),
  })

  if (response.ok)
    return true

  const body = await response.text().catch(() => '')
  cloudlogErr({ requestId: c.get('requestId'), message: 'Plugin notification trigger transfer failed', status: response.status, statusText: response.statusText, body })
  return false
}

function buildProcessingKey(queueKey: string) {
  const suffix = queueKey.startsWith(PLUGIN_NOTIFICATION_QUEUE_PREFIX)
    ? queueKey.slice(PLUGIN_NOTIFICATION_QUEUE_PREFIX.length)
    : encodeURIComponent(queueKey)
  return `${PLUGIN_NOTIFICATION_PROCESSING_PREFIX}${suffix}`
}

async function reserveQueueItem(store: KVNamespace, queueKey: string) {
  const processingKey = buildProcessingKey(queueKey)
  const existingLock = await store.get(processingKey)
  if (existingLock)
    return null

  await store.put(processingKey, new Date().toISOString(), { expirationTtl: PLUGIN_NOTIFICATION_PROCESSING_TTL_SECONDS })
  return processingKey
}

async function releaseProcessingKeys(store: KVNamespace, processingKeys: string[]) {
  for (const key of processingKeys) {
    await store.delete(key)
  }
}

async function deleteQueueKeys(store: KVNamespace, itemKeys: string[]) {
  let deleted = 0
  for (const key of itemKeys) {
    await store.delete(key)
    deleted++
  }
  return deleted
}

async function releaseProcessingKeysSafely(c: Context, store: KVNamespace, processingKeys: string[]) {
  try {
    await releaseProcessingKeys(store, processingKeys)
  }
  catch (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Plugin notification queue lock release failed', error: serializeError(error) })
  }
}

async function processBatch(
  c: Context,
  store: KVNamespace,
  items: PluginNotificationQueueItem[],
  itemKeys: string[],
  processingKeys: string[],
): Promise<{ transferred: number, deleted: number, failed: number }> {
  try {
    const accepted = await postPluginNotificationBatch(c, items)
    if (!accepted) {
      await releaseProcessingKeysSafely(c, store, processingKeys)
      return { transferred: 0, deleted: 0, failed: items.length }
    }

    const deleted = await deleteQueueKeys(store, itemKeys)
    await releaseProcessingKeysSafely(c, store, processingKeys)
    return { transferred: items.length, deleted, failed: 0 }
  }
  catch (error) {
    await releaseProcessingKeysSafely(c, store, processingKeys)
    cloudlogErr({ requestId: c.get('requestId'), message: 'Plugin notification queue transfer failed', error: serializeError(error) })
    return { transferred: 0, deleted: 0, failed: items.length }
  }
}

export async function flushQueuedPluginNotifications(c: Context, limit = PLUGIN_NOTIFICATION_FLUSH_LIMIT): Promise<PluginNotificationFlushResult> {
  const store = c.env.CHANNEL_SELF_STORE
  if (!store) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'Plugin notification KV queue missing during flush' })
    return { status: 'ok', scanned: 0, transferred: 0, deleted: 0, failed: 0 }
  }

  let scanned = 0
  let transferred = 0
  let deleted = 0
  let failed = 0
  let cursor: string | undefined

  do {
    const remaining = limit - scanned
    if (remaining <= 0)
      break

    const listed = await store.list({
      prefix: PLUGIN_NOTIFICATION_QUEUE_PREFIX,
      cursor,
      limit: Math.min(100, remaining),
    })
    cursor = listed.cursor

    const items: PluginNotificationQueueItem[] = []
    const itemKeys: string[] = []
    const processingKeys: string[] = []
    for (const key of listed.keys) {
      scanned++
      const raw = await store.get(key.name)
      if (!raw) {
        await store.delete(key.name)
        deleted++
        continue
      }

      const item = parsePluginNotificationQueueItem(c, key.name, raw)
      if (!item) {
        await store.delete(key.name)
        deleted++
        continue
      }

      const processingKey = await reserveQueueItem(store, key.name)
      if (!processingKey)
        continue

      items.push(item)
      itemKeys.push(key.name)
      processingKeys.push(processingKey)
    }

    if (items.length > 0) {
      const result = await processBatch(c, store, items, itemKeys, processingKeys)
      transferred += result.transferred
      deleted += result.deleted
      failed += result.failed
    }

    if (listed.list_complete)
      break
  } while (cursor)

  cloudlog({ requestId: c.get('requestId'), message: 'Plugin notification queue flush finished', scanned, transferred, deleted, failed })
  return { status: 'ok', scanned, transferred, deleted, failed }
}
