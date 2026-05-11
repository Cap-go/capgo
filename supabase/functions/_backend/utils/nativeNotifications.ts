import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from './hono.ts'
import { escapeSqlString, formatDateCF, normalizeAnalyticsLimit, runQueryToCFA } from './cloudflare.ts'
import { simpleError } from './hono.ts'
import { cloudlog, cloudlogErr, serializeError } from './logging.ts'
import { getEnv } from './utils.ts'

const NOTIFICATION_BUCKET_COUNT = 256
const NOTIFICATION_REGISTRY_RETENTION_DAYS = 92
const DEFAULT_NOTIFICATION_REGISTRY_DATASET = 'notification_registry'
const DEFAULT_NOTIFICATION_EVENTS_DATASET = 'notification_events'
const MAX_TAGS = 32
const MAX_TAG_LENGTH = 64
const MAX_ATTRIBUTES_BLOB_LENGTH = 2048

const textEncoder = new TextEncoder()

export type NativeNotificationPlatform = 'ios' | 'android'
export type NativeNotificationProvider = 'fcm' | 'apns'
export type NativeNotificationPermission = 'unknown' | 'prompt' | 'granted' | 'denied'
export type NativeNotificationEvent
  = | 'queued'
    | 'sent'
    | 'provider_accepted'
    | 'received'
    | 'opened'
    | 'failed'
    | 'permission_changed'
    | 'background_started'
    | 'background_finished'

export interface NativeNotificationTarget {
  externalId?: string
  recipientKey?: string
  deviceKey?: string
  tag?: string
  broadcast?: boolean
}

export interface NativeNotificationProviderConfig {
  provider: NativeNotificationProvider
  status: string
  config: Record<string, unknown>
  secretRef?: string | null
}

export interface NativeNotificationRegisterInput {
  appId: string
  externalId: string
  nativeInstallId: string
  pushToken: string
  provider: NativeNotificationProvider
  platform: NativeNotificationPlatform
  locale?: string
  timezone?: string
  appVersion?: string
  pluginVersion?: string
  tags?: string[]
  attributes?: Record<string, unknown>
  permission?: NativeNotificationPermission
  badge?: number
  active?: boolean
  consent?: boolean
}

export interface NativeNotificationResolvedIdentity {
  appId: string
  recipientKey: string
  deviceKey: string
  bucket: string
  index: string
}

export interface NativeNotificationRegistryRow {
  device_key: string
  recipient_key: string
  encrypted_token: string
  token_hash: string
  provider: NativeNotificationProvider
  platform: NativeNotificationPlatform
  locale: string
  timezone: string
  app_version: string
  plugin_version: string
  tags: string
  attributes: string
  active: number
  badge: number
  permission: number
  consent: number
  updated_at: string
}

export interface NativeNotificationEventInput {
  appId: string
  event: NativeNotificationEvent
  campaignId?: string
  notificationId?: string
  externalId?: string
  nativeInstallId?: string
  recipientKey?: string
  deviceKey?: string
  provider?: NativeNotificationProvider
  platform?: NativeNotificationPlatform
  error?: string
  badge?: number
}

export interface NativeNotificationQueueMessage {
  kind: 'send' | 'badge' | 'update_check'
  appId: string
  campaignId: string
  payload: Record<string, unknown>
  devices: NativeNotificationRegistryRow[]
  badge?: number
  providerConfigs?: NativeNotificationProviderConfig[]
  attempt?: number
}

export interface NativeNotificationStatsRow {
  event: NativeNotificationEvent | string
  count: number
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  let encoded = btoa(binary).split('+').join('-').split('/').join('_')
  while (encoded.endsWith('='))
    encoded = encoded.slice(0, -1)
  return encoded
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++)
    bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(value))
  return toHex(digest)
}

async function hmacHex(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, textEncoder.encode(value))
  return toHex(signature)
}

async function aesKeyFromSecret(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(secret))
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

function getNotificationHashSecret(c: Context): string {
  const secret = getEnv(c, 'NOTIFICATIONS_HMAC_SECRET') || getEnv(c, 'API_SECRET')
  if (!secret)
    throw simpleError('missing_notifications_hmac_secret', 'Missing notification HMAC secret')
  return secret
}

function getNotificationTokenSecret(c: Context): string {
  const secret = getEnv(c, 'NOTIFICATIONS_TOKEN_SECRET') || getEnv(c, 'API_SECRET')
  if (!secret)
    throw simpleError('missing_notifications_token_secret', 'Missing notification token secret')
  return secret
}

function safeDatasetName(name: string, fallback: string): string {
  return /^\w+$/.test(name) ? name : fallback
}

function getRegistryDataset(c: Context): string {
  return safeDatasetName(getEnv(c, 'NOTIFICATION_REGISTRY_DATASET') || DEFAULT_NOTIFICATION_REGISTRY_DATASET, DEFAULT_NOTIFICATION_REGISTRY_DATASET)
}

function getEventsDataset(c: Context): string {
  return safeDatasetName(getEnv(c, 'NOTIFICATION_EVENTS_DATASET') || DEFAULT_NOTIFICATION_EVENTS_DATASET, DEFAULT_NOTIFICATION_EVENTS_DATASET)
}

function permissionToNumber(permission: NativeNotificationPermission | undefined): number {
  switch (permission) {
    case 'granted': return 2
    case 'denied': return 3
    case 'prompt': return 1
    default: return 0
  }
}

function trimText(value: string | undefined, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function normalizeTags(tags: string[] | undefined): string {
  if (!Array.isArray(tags))
    return ''
  const normalized = [...new Set(tags
    .filter(tag => typeof tag === 'string')
    .map(tag => tag.trim().toLowerCase().replace(/[^a-z0-9_.:-]/g, '_').slice(0, MAX_TAG_LENGTH))
    .filter(Boolean))]
    .slice(0, MAX_TAGS)
  return normalized.length ? `|${normalized.join('|')}|` : ''
}

function normalizeAttributes(attributes: Record<string, unknown> | undefined): string {
  if (!attributes || typeof attributes !== 'object')
    return ''
  const json = JSON.stringify(attributes)
  return json.length > MAX_ATTRIBUTES_BLOB_LENGTH ? '' : json
}

export function getNotificationBucket(key: string): string {
  const prefix = key.toLowerCase().replace(/[^a-f0-9]/g, '').slice(0, 2)
  return prefix.padEnd(2, '0')
}

export function getAllNotificationBuckets(): string[] {
  return Array.from({ length: NOTIFICATION_BUCKET_COUNT }, (_, index) => index.toString(16).padStart(2, '0'))
}

export function getNotificationIndex(appId: string, bucket: string): string {
  return `${appId}:${bucket}`
}

export async function deriveNativeNotificationIdentity(
  c: Context,
  appId: string,
  externalId: string,
  nativeInstallId: string,
): Promise<NativeNotificationResolvedIdentity> {
  const secret = getNotificationHashSecret(c)
  const recipientKey = await hmacHex(secret, `recipient:${appId}:${externalId}`)
  const deviceKey = await hmacHex(secret, `device:${appId}:${nativeInstallId}`)
  const bucket = getNotificationBucket(recipientKey)
  return {
    appId,
    recipientKey,
    deviceKey,
    bucket,
    index: getNotificationIndex(appId, bucket),
  }
}

export async function deriveRecipientKey(c: Context, appId: string, externalId: string): Promise<string> {
  return hmacHex(getNotificationHashSecret(c), `recipient:${appId}:${externalId}`)
}

export async function deriveDeviceKey(c: Context, appId: string, nativeInstallId: string): Promise<string> {
  return hmacHex(getNotificationHashSecret(c), `device:${appId}:${nativeInstallId}`)
}

export async function encryptNotificationToken(c: Context, token: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await aesKeyFromSecret(getNotificationTokenSecret(c))
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, textEncoder.encode(token))
  return `v1:${toBase64Url(iv)}:${toBase64Url(new Uint8Array(encrypted))}`
}

export async function decryptNotificationToken(c: Context, encryptedToken: string): Promise<string> {
  const [version, ivValue, cipherValue] = encryptedToken.split(':')
  if (version !== 'v1' || !ivValue || !cipherValue)
    throw simpleError('invalid_notification_token_ciphertext', 'Invalid notification token ciphertext')
  const key = await aesKeyFromSecret(getNotificationTokenSecret(c))
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(fromBase64Url(ivValue)) }, key, new Uint8Array(fromBase64Url(cipherValue)))
  return new TextDecoder().decode(decrypted)
}

export async function trackNotificationRegistrationCF(c: Context<MiddlewareKeyVariables>, input: NativeNotificationRegisterInput) {
  if (!c.env.NOTIFICATION_REGISTRY) {
    cloudlog({ requestId: c.get('requestId'), message: 'NOTIFICATION_REGISTRY not available, skipping native notification registration' })
    return await deriveNativeNotificationIdentity(c, input.appId, input.externalId, input.nativeInstallId)
  }

  const identity = await deriveNativeNotificationIdentity(c, input.appId, input.externalId, input.nativeInstallId)
  const encryptedToken = await encryptNotificationToken(c, input.pushToken)
  const tokenHash = await sha256Hex(input.pushToken)

  c.env.NOTIFICATION_REGISTRY.writeDataPoint({
    blobs: [
      identity.deviceKey,
      identity.recipientKey,
      encryptedToken,
      tokenHash,
      input.provider,
      input.platform,
      trimText(input.locale, 32),
      trimText(input.timezone, 64),
      trimText(input.appVersion, 80),
      trimText(input.pluginVersion, 32),
      normalizeTags(input.tags),
      normalizeAttributes(input.attributes),
    ],
    doubles: [
      input.active === false ? 0 : 1,
      Math.max(0, Math.trunc(input.badge ?? 0)),
      permissionToNumber(input.permission),
      input.consent === false ? 0 : 1,
    ],
    indexes: [identity.index],
  })

  return identity
}

export function buildNotificationRegistryLookupQuery(params: {
  dataset: string
  appId: string
  buckets: string[]
  recipientKey?: string
  deviceKey?: string
  tag?: string
  limit?: number
  now?: Date
}) {
  const since = new Date((params.now?.getTime() ?? Date.now()) - NOTIFICATION_REGISTRY_RETENTION_DAYS * 24 * 60 * 60 * 1000)
  const indexes = params.buckets.map(bucket => `'${escapeSqlString(getNotificationIndex(params.appId, bucket))}'`).join(', ')
  const innerConditions = [
    `index1 IN (${indexes})`,
    `timestamp >= toDateTime('${formatDateCF(since)}')`,
  ]
  const outerConditions = ['active = 1', 'consent = 1']

  if (params.recipientKey)
    outerConditions.push(`recipient_key = '${escapeSqlString(params.recipientKey)}'`)
  if (params.deviceKey)
    outerConditions.push(`device_key = '${escapeSqlString(params.deviceKey)}'`)
  if (params.tag)
    outerConditions.push(`position('|${escapeSqlString(params.tag.toLowerCase())}|' IN tags) > 0`)

  const limit = normalizeAnalyticsLimit(params.limit, 1000)
  return `SELECT *
FROM (
  SELECT
    argMax(blob1, timestamp) AS device_key,
    argMax(blob2, timestamp) AS recipient_key,
    argMax(blob3, timestamp) AS encrypted_token,
    argMax(blob4, timestamp) AS token_hash,
    argMax(blob5, timestamp) AS provider,
    argMax(blob6, timestamp) AS platform,
    argMax(blob7, timestamp) AS locale,
    argMax(blob8, timestamp) AS timezone,
    argMax(blob9, timestamp) AS app_version,
    argMax(blob10, timestamp) AS plugin_version,
    argMax(blob11, timestamp) AS tags,
    argMax(blob12, timestamp) AS attributes,
    argMax(double1, timestamp) AS active,
    argMax(double2, timestamp) AS badge,
    argMax(double3, timestamp) AS permission,
    argMax(double4, timestamp) AS consent,
    max(timestamp) AS updated_at
  FROM ${params.dataset}
  WHERE ${innerConditions.join(' AND ')}
  GROUP BY blob1
)
WHERE ${outerConditions.join(' AND ')}
ORDER BY updated_at DESC
LIMIT ${limit}`
}

function resolveNotificationBuckets(params: {
  buckets?: string[]
  recipientKey?: string
  deviceKey?: string
}) {
  if (params.buckets?.length)
    return params.buckets
  if (params.recipientKey)
    return [getNotificationBucket(params.recipientKey)]
  if (params.deviceKey)
    return [getNotificationBucket(params.deviceKey)]
  return getAllNotificationBuckets()
}

export async function readNotificationRegistrationsCF(c: Context<MiddlewareKeyVariables>, params: {
  appId: string
  recipientKey?: string
  deviceKey?: string
  tag?: string
  buckets?: string[]
  limit?: number
}) {
  if (!getEnv(c, 'CF_ANALYTICS_TOKEN') || !getEnv(c, 'CF_ACCOUNT_ANALYTICS_ID'))
    return [] as NativeNotificationRegistryRow[]

  const query = buildNotificationRegistryLookupQuery({
    dataset: getRegistryDataset(c),
    appId: params.appId,
    buckets: resolveNotificationBuckets(params),
    recipientKey: params.recipientKey,
    deviceKey: params.deviceKey,
    tag: params.tag,
    limit: params.limit,
  })

  cloudlog({ requestId: c.get('requestId'), message: 'readNotificationRegistrationsCF query', query })
  try {
    return await runQueryToCFA<NativeNotificationRegistryRow>(c, query)
  }
  catch (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'readNotificationRegistrationsCF error', error: serializeError(error) })
    return [] as NativeNotificationRegistryRow[]
  }
}

export function buildNotificationStatsQuery(params: {
  dataset: string
  appId: string
  campaignId?: string
  days?: number
  now?: Date
}) {
  const days = Math.min(Math.max(Math.trunc(params.days ?? 30), 1), 92)
  const since = new Date((params.now?.getTime() ?? Date.now()) - days * 24 * 60 * 60 * 1000)
  const appIndex = escapeSqlString(params.appId)
  const indexCondition = params.campaignId
    ? `index1 = '${appIndex}:${escapeSqlString(params.campaignId)}'`
    : `(index1 = '${appIndex}' OR startsWith(index1, '${appIndex}:'))`

  return `SELECT blob1 AS event, count() AS count\n`
    + `FROM ${params.dataset}\n`
    + `WHERE timestamp >= toDateTime('${formatDateCF(since)}')\n`
    + `  AND ${indexCondition}\n`
    + `GROUP BY blob1\n`
    + `ORDER BY count DESC`
}

export async function readNotificationStatsCF(c: Context<MiddlewareKeyVariables>, params: {
  appId: string
  campaignId?: string
  days?: number
}) {
  if (!getEnv(c, 'CF_ANALYTICS_TOKEN') || !getEnv(c, 'CF_ACCOUNT_ANALYTICS_ID'))
    return [] as NativeNotificationStatsRow[]
  const query = buildNotificationStatsQuery({
    dataset: getEventsDataset(c),
    appId: params.appId,
    campaignId: params.campaignId,
    days: params.days,
  })
  try {
    return await runQueryToCFA<NativeNotificationStatsRow>(c, query)
  }
  catch (error) {
    cloudlogErr({ requestId: c.get('requestId'), message: 'readNotificationStatsCF error', error: serializeError(error) })
    return [] as NativeNotificationStatsRow[]
  }
}

export async function trackNotificationEventCF(c: Context<MiddlewareKeyVariables>, input: NativeNotificationEventInput) {
  if (!c.env.NOTIFICATION_EVENTS)
    return

  let recipientKey = input.recipientKey ?? ''
  let deviceKey = input.deviceKey ?? ''
  if (!recipientKey && input.externalId)
    recipientKey = await deriveRecipientKey(c, input.appId, input.externalId)
  if (!deviceKey && input.nativeInstallId)
    deviceKey = await deriveDeviceKey(c, input.appId, input.nativeInstallId)

  const index = input.campaignId ? `${input.appId}:${input.campaignId}` : input.appId
  c.env.NOTIFICATION_EVENTS.writeDataPoint({
    blobs: [
      input.event,
      input.campaignId ?? '',
      input.notificationId ?? '',
      deviceKey,
      recipientKey,
      input.provider ?? '',
      input.error ?? '',
      input.platform ?? '',
    ],
    doubles: [Math.max(0, Math.trunc(input.badge ?? 0))],
    indexes: [index.slice(0, 96)],
  })
}

export async function enqueueNativeNotification(c: Context<MiddlewareKeyVariables>, message: NativeNotificationQueueMessage) {
  const queue = c.env.NOTIFICATION_QUEUE as { send?: (body: NativeNotificationQueueMessage) => Promise<void> } | undefined
  if (!queue?.send)
    return false
  await queue.send(message)
  return true
}
