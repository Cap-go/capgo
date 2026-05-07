import type { Context } from 'hono'
import type { RateLimitStatus } from './rate_limit.ts'
import { CacheHelper } from './cache.ts'
import { cloudlog } from './logging.ts'
import { getClientIP } from './rate_limit.ts'
import { getEnv } from './utils.ts'

const UPDATE_ENUMERATION_BUCKET_PATH = '/rate-limit/update-enumeration/bucket'
const UPDATE_ENUMERATION_COUNT_PATH = '/rate-limit/update-enumeration/count'
const UPDATE_ENUMERATION_LIMIT_PATH = '/rate-limit/update-enumeration/limited'
const UPDATE_ENUMERATION_TTL_SECONDS = 60 * 15
const DEFAULT_UPDATE_ENUMERATION_MISS_LIMIT = 5
const UPDATE_ENUMERATION_BUCKET_COUNT = 256
const MAX_TRACKED_APP_IDS_PER_BUCKET = 64

interface UpdateEnumerationData {
  appIds: string[]
  resetAt: number
}

interface UpdateEnumerationLimitData {
  resetAt: number
}

interface UpdateEnumerationCountData {
  count: number
  resetAt: number
}

function getUpdateEnumerationMissLimit(c: Context) {
  const envLimit = getEnv(c, 'RATE_LIMIT_UPDATE_ENUMERATION_MISSES')
  if (envLimit) {
    const parsed = Number.parseInt(envLimit, 10)
    if (!Number.isNaN(parsed) && parsed > 0)
      return parsed
  }
  return DEFAULT_UPDATE_ENUMERATION_MISS_LIMIT
}

function getUpdateEnumerationHashSecret(c: Context) {
  return getEnv(c, 'RATE_LIMIT_UPDATE_ENUMERATION_HASH_SECRET')
    || getEnv(c, 'JWT_SECRET')
    || getEnv(c, 'API_SECRET')
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return bytesToHex(new Uint8Array(digest))
}

async function hmacSha256Hex(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))
  return bytesToHex(new Uint8Array(digest))
}

async function hashAppId(c: Context, appId: string) {
  const normalized = appId.trim().toLowerCase()
  const secret = getUpdateEnumerationHashSecret(c)
  if (secret)
    return await hmacSha256Hex(normalized, secret)

  return await sha256Hex(normalized)
}

function getUpdateEnumerationBucket(appIdHash: string) {
  const prefix = appIdHash.slice(0, 8)
  return (Number.parseInt(prefix, 16) % UPDATE_ENUMERATION_BUCKET_COUNT).toString()
}

function buildUpdateEnumerationCacheEntry(c: Context) {
  const ip = getClientIP(c)
  if (ip === 'unknown') {
    cloudlog({
      requestId: c.get('requestId'),
      message: 'Update enumeration guard skipped: unknown IP',
    })
    return null
  }

  const helper = new CacheHelper(c)
  return { helper, ip }
}

function buildUpdateEnumerationBucketRequest(helper: CacheHelper, ip: string, bucket: string) {
  return helper.buildRequest(UPDATE_ENUMERATION_BUCKET_PATH, { ip, bucket })
}

function buildUpdateEnumerationCountRequest(helper: CacheHelper, ip: string) {
  return helper.buildRequest(UPDATE_ENUMERATION_COUNT_PATH, { ip })
}

function buildUpdateEnumerationLimitRequest(helper: CacheHelper, ip: string) {
  return helper.buildRequest(UPDATE_ENUMERATION_LIMIT_PATH, { ip })
}

export async function isUpdateEnumerationLimited(c: Context): Promise<RateLimitStatus> {
  try {
    const cacheEntry = buildUpdateEnumerationCacheEntry(c)
    if (!cacheEntry)
      return { limited: false }

    const existingLimit = await cacheEntry.helper.matchJson<UpdateEnumerationLimitData>(
      buildUpdateEnumerationLimitRequest(cacheEntry.helper, cacheEntry.ip),
    )
    if (existingLimit)
      return { limited: true, resetAt: existingLimit.resetAt }
  }
  catch (error) {
    cloudlog({
      requestId: c.get('requestId'),
      message: 'Update enumeration guard limit read failed',
      error,
    })
  }

  return { limited: false }
}

function appendAppIdHash(existingData: UpdateEnumerationData | null, appIdHash: string, resetAt: number) {
  const existingAppIds = existingData?.appIds ?? []
  const appIds = existingAppIds.includes(appIdHash)
    ? existingAppIds
    : [...existingAppIds, appIdHash].slice(-MAX_TRACKED_APP_IDS_PER_BUCKET)
  return { appIds, resetAt }
}

export async function recordUpdateEnumerationMiss(c: Context, appId: string): Promise<RateLimitStatus> {
  if (!appId?.trim())
    return { limited: false }

  const appIdHash = await hashAppId(c, appId)
  const bucket = getUpdateEnumerationBucket(appIdHash)
  const resetAt = Date.now() + UPDATE_ENUMERATION_TTL_SECONDS * 1000
  let cacheEntry: ReturnType<typeof buildUpdateEnumerationCacheEntry>
  let missState: UpdateEnumerationCountData = { count: 0, resetAt }

  try {
    cacheEntry = buildUpdateEnumerationCacheEntry(c)
    if (!cacheEntry)
      return { limited: false }

    const limitRequest = buildUpdateEnumerationLimitRequest(cacheEntry.helper, cacheEntry.ip)
    const existingLimit = await cacheEntry.helper.matchJson<UpdateEnumerationLimitData>(limitRequest)
    if (existingLimit)
      return { limited: true, resetAt: existingLimit.resetAt }

    const bucketRequest = buildUpdateEnumerationBucketRequest(cacheEntry.helper, cacheEntry.ip, bucket)
    const countRequest = buildUpdateEnumerationCountRequest(cacheEntry.helper, cacheEntry.ip)
    const existingBucket = await cacheEntry.helper.matchJson<UpdateEnumerationData>(bucketRequest)
    const existingCount = await cacheEntry.helper.matchJson<UpdateEnumerationCountData>(countRequest)
    const alreadyTracked = existingBucket?.appIds.includes(appIdHash) ?? false
    const currentCount = existingCount?.count ?? existingBucket?.appIds.length ?? 0
    const missCount = alreadyTracked ? currentCount : currentCount + 1
    const missResetAt = Math.max(existingCount?.resetAt ?? 0, existingBucket?.resetAt ?? 0, resetAt)

    // Bucket selection uses a server-side keyed hash when available, and the
    // bucket payload stores exact app hashes so collisions cannot hide probes.
    await cacheEntry.helper.putJson(bucketRequest, appendAppIdHash(existingBucket, appIdHash, resetAt), UPDATE_ENUMERATION_TTL_SECONDS)
    missState = { count: missCount, resetAt: missResetAt }
    await cacheEntry.helper.putJson(countRequest, missState, UPDATE_ENUMERATION_TTL_SECONDS)
  }
  catch (error) {
    cloudlog({
      requestId: c.get('requestId'),
      message: 'Update enumeration guard bucket write failed while recording miss',
      error,
    })
    return { limited: false }
  }

  const limit = getUpdateEnumerationMissLimit(c)
  const limited = missState.count >= limit
  if (limited) {
    await cacheEntry.helper.putJson(
      buildUpdateEnumerationLimitRequest(cacheEntry.helper, cacheEntry.ip),
      { resetAt: missState.resetAt },
      UPDATE_ENUMERATION_TTL_SECONDS,
    )
  }

  cloudlog({
    requestId: c.get('requestId'),
    message: 'Recorded update enumeration miss',
    appIdHash: appIdHash.slice(0, 12),
    bucket,
    count: missState.count,
    limit,
    limited,
  })

  return { limited, resetAt: missState.resetAt }
}

export function updateEnumerationLimitedResponse(c: Context) {
  return c.json({ error: 'on_premise_app' }, 429)
}
