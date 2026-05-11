import type { MessageBatch } from '@cloudflare/workers-types'
import type {
  NativeNotificationProvider,
  NativeNotificationProviderConfig,
  NativeNotificationQueueMessage,
  NativeNotificationRegistryRow,
} from './nativeNotifications.ts'
import { getNotificationBucket, getNotificationIndex } from './nativeNotifications.ts'

type NotificationEnv = Record<string, unknown>
const MAX_NOTIFICATION_RETRY_ATTEMPTS = 3

interface SendOutcome {
  ok: boolean
  transient: boolean
  invalidToken?: boolean
  notificationId?: string
  error?: string
}

const textEncoder = new TextEncoder()

function readEnv(env: NotificationEnv, name: string): string {
  const value = env[name]
  if (typeof value === 'string')
    return value
  if (value && typeof value === 'object' && 'value' in value && typeof (value as { value?: unknown }).value === 'string')
    return (value as { value: string }).value
  return ''
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

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const base64 = pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '')
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++)
    bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

function jsonBase64Url(value: Record<string, unknown>): string {
  return toBase64Url(textEncoder.encode(JSON.stringify(value)))
}

async function aesKeyFromSecret(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(secret))
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['decrypt'])
}

async function decryptToken(env: NotificationEnv, encryptedToken: string): Promise<string> {
  const secret = readEnv(env, 'NOTIFICATIONS_TOKEN_SECRET') || readEnv(env, 'API_SECRET')
  if (!secret)
    throw new Error('Missing notification token secret')
  const [version, ivValue, cipherValue] = encryptedToken.split(':')
  if (version !== 'v1' || !ivValue || !cipherValue)
    throw new Error('Invalid notification token ciphertext')
  const key = await aesKeyFromSecret(secret)
  try {
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(fromBase64Url(ivValue)) }, key, new Uint8Array(fromBase64Url(cipherValue)))
    return new TextDecoder().decode(decrypted)
  }
  catch {
    throw new Error('Invalid notification token ciphertext')
  }
}

function getString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function getBoolean(value: unknown): boolean {
  return value === true || value === 'true'
}

function parseSecretValue(env: NotificationEnv, secretRef: string | null | undefined): unknown {
  if (!secretRef)
    return null
  const raw = readEnv(env, secretRef)
  if (!raw)
    return null
  try {
    return JSON.parse(raw)
  }
  catch {
    return raw
  }
}

function getProviderConfig(message: NativeNotificationQueueMessage, provider: NativeNotificationProvider): NativeNotificationProviderConfig | null {
  return message.providerConfigs?.find(config => config.provider === provider && config.status === 'configured') ?? null
}

function normalizeData(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return {}
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, dataValue]) => [key, typeof dataValue === 'string' ? dataValue : JSON.stringify(dataValue)]))
}

function buildCollapseId(message: NativeNotificationQueueMessage): string {
  const collapseId = getString(message.payload.collapseId)
  return (collapseId || message.campaignId).slice(0, 64)
}

async function signRsaJwt(header: Record<string, unknown>, claims: Record<string, unknown>, privateKeyPem: string): Promise<string> {
  const unsigned = `${jsonBase64Url(header)}.${jsonBase64Url(claims)}`
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(privateKeyPem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, textEncoder.encode(unsigned))
  return `${unsigned}.${toBase64Url(new Uint8Array(signature))}`
}

async function signEcJwt(header: Record<string, unknown>, claims: Record<string, unknown>, privateKeyPem: string): Promise<string> {
  const unsigned = `${jsonBase64Url(header)}.${jsonBase64Url(claims)}`
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(privateKeyPem),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, textEncoder.encode(unsigned))
  return `${unsigned}.${toBase64Url(new Uint8Array(signature))}`
}

async function getFcmAccessToken(env: NotificationEnv, providerConfig: NativeNotificationProviderConfig): Promise<string> {
  const secretValue = parseSecretValue(env, providerConfig.secretRef)
  const secretObject = secretValue && typeof secretValue === 'object' ? secretValue as Record<string, unknown> : {}
  const directAccessToken = readEnv(env, 'FCM_ACCESS_TOKEN') || getString(secretObject.access_token)
  if (directAccessToken)
    return directAccessToken
  const privateKey = getString(secretObject.private_key) || getString(secretValue)
  const clientEmail = getString(secretObject.client_email) || getString(providerConfig.config.serviceAccountEmail)
  if (!privateKey || !clientEmail)
    throw new Error('Missing FCM service account secret')

  const now = Math.floor(Date.now() / 1000)
  const assertion = await signRsaJwt({ alg: 'RS256', typ: 'JWT' }, {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }, privateKey)

  const form = new URLSearchParams()
  form.set('grant_type', 'urn:ietf:params:oauth:grant-type:jwt-bearer')
  form.set('assertion', assertion)
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  })
  const json = await response.json() as { access_token?: string, error?: string }
  if (!response.ok || !json.access_token)
    throw new Error(json.error || 'Unable to get FCM access token')
  return json.access_token
}

function buildFcmBody(token: string, message: NativeNotificationQueueMessage) {
  const data = normalizeData(message.payload.data)
  if (message.kind === 'update_check') {
    data.capgoAction = 'update_check'
    data.capgoUpdateInstallMode = getString(message.payload.installMode) || 'next'
    const channel = getString(message.payload.channel)
    if (channel)
      data.capgoUpdateChannel = channel
  }
  const title = getString(message.payload.title)
  const body = getString(message.payload.body)
  const background = getBoolean(message.payload.background) || getBoolean(message.payload.silent) || message.payload.kind === 'background' || message.kind === 'update_check'
  const fcmMessage: Record<string, unknown> = {
    token,
    data: {
      ...data,
      capgoCampaignId: message.campaignId,
    },
  }

  if (title || body) {
    fcmMessage.notification = {
      title,
      body,
    }
  }

  if (message.kind === 'badge') {
    fcmMessage.apns = {
      headers: { 'apns-push-type': 'alert' },
      payload: { aps: { badge: message.badge ?? 0 } },
    }
    fcmMessage.android = {
      notification: { notification_count: message.badge ?? 0 },
    }
  }
  else if (background) {
    fcmMessage.apns = {
      headers: {
        'apns-push-type': 'background',
        'apns-priority': '5',
        'apns-collapse-id': buildCollapseId(message),
      },
      payload: { aps: { 'content-available': 1 } },
    }
    fcmMessage.android = {
      priority: 'high',
      collapse_key: buildCollapseId(message),
    }
  }

  return { message: fcmMessage }
}

interface FcmErrorDetail {
  '@type'?: string
  'errorCode'?: string
  'fieldViolations'?: Array<{ field?: string }>
}

interface FcmSendError {
  name?: string
  error?: {
    status?: string
    message?: string
    details?: FcmErrorDetail[]
  }
}

function isFcmTokenFieldViolation(detail: FcmErrorDetail): boolean {
  return Array.isArray(detail.fieldViolations) && detail.fieldViolations.some((violation) => {
    const field = violation.field ?? ''
    return field === 'message.token' || field.endsWith('.token')
  })
}

function isInvalidFcmToken(json: FcmSendError): boolean {
  const status = json.error?.status ?? ''
  if (status === 'UNREGISTERED')
    return true
  if (status !== 'INVALID_ARGUMENT')
    return false
  return (json.error?.details ?? []).some(detail =>
    detail.errorCode === 'UNREGISTERED' || isFcmTokenFieldViolation(detail),
  )
}

async function sendFcm(env: NotificationEnv, providerConfig: NativeNotificationProviderConfig, token: string, message: NativeNotificationQueueMessage): Promise<SendOutcome> {
  const secretValue = parseSecretValue(env, providerConfig.secretRef)
  const secretObject = secretValue && typeof secretValue === 'object' ? secretValue as Record<string, unknown> : {}
  const projectId = getString(providerConfig.config.projectId) || getString(secretObject.project_id)
  if (!projectId)
    return { ok: false, transient: false, error: 'Missing FCM project id' }

  const accessToken = await getFcmAccessToken(env, providerConfig)
  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify(buildFcmBody(token, message)),
  })
  const json = await response.json().catch(() => ({})) as FcmSendError
  if (response.ok)
    return { ok: true, transient: false, notificationId: json.name }

  const status = json.error?.status ?? ''
  return {
    ok: false,
    transient: response.status === 429 || response.status >= 500,
    invalidToken: isInvalidFcmToken(json),
    error: json.error?.message || status || 'FCM rejected notification',
  }
}

async function buildApnsJwt(providerConfig: NativeNotificationProviderConfig, privateKey: string): Promise<string> {
  const teamId = getString(providerConfig.config.teamId)
  const keyId = getString(providerConfig.config.keyId)
  if (!teamId || !keyId)
    throw new Error('Missing APNs team id or key id')
  return signEcJwt({ alg: 'ES256', kid: keyId }, { iss: teamId, iat: Math.floor(Date.now() / 1000) }, privateKey)
}

function buildApnsPayload(message: NativeNotificationQueueMessage) {
  const data = normalizeData(message.payload.data)
  if (message.kind === 'update_check') {
    data.capgoAction = 'update_check'
    data.capgoUpdateInstallMode = getString(message.payload.installMode) || 'next'
    const channel = getString(message.payload.channel)
    if (channel)
      data.capgoUpdateChannel = channel
  }
  const title = getString(message.payload.title)
  const body = getString(message.payload.body)
  const background = getBoolean(message.payload.background) || getBoolean(message.payload.silent) || message.payload.kind === 'background' || message.kind === 'update_check'
  const aps: Record<string, unknown> = {}

  if (message.kind === 'badge') {
    aps.badge = message.badge ?? 0
  }
  else if (background) {
    aps['content-available'] = 1
  }
  else {
    aps.alert = { title, body }
    aps.sound = getString(message.payload.sound) || 'default'
  }

  return {
    ...data,
    capgoCampaignId: message.campaignId,
    aps,
  }
}

async function sendApns(env: NotificationEnv, providerConfig: NativeNotificationProviderConfig, token: string, message: NativeNotificationQueueMessage): Promise<SendOutcome> {
  const secretValue = parseSecretValue(env, providerConfig.secretRef)
  const secretObject = secretValue && typeof secretValue === 'object' ? secretValue as Record<string, unknown> : {}
  const privateKey = getString(secretObject.private_key) || getString(secretValue)
  const bundleId = getString(providerConfig.config.bundleId)
  if (!privateKey || !bundleId)
    return { ok: false, transient: false, error: 'Missing APNs key or bundle id' }

  const background = getBoolean(message.payload.background) || getBoolean(message.payload.silent) || message.payload.kind === 'background' || message.kind === 'update_check'
  const host = getBoolean(providerConfig.config.sandbox) || providerConfig.config.environment === 'sandbox'
    ? 'https://api.sandbox.push.apple.com'
    : 'https://api.push.apple.com'
  const response = await fetch(`${host}/3/device/${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: {
      'Authorization': `bearer ${await buildApnsJwt(providerConfig, privateKey)}`,
      'Content-Type': 'application/json',
      'apns-topic': bundleId,
      'apns-push-type': background ? 'background' : 'alert',
      'apns-priority': background ? '5' : '10',
      'apns-collapse-id': buildCollapseId(message),
    },
    body: JSON.stringify(buildApnsPayload(message)),
  })

  if (response.ok)
    return { ok: true, transient: false, notificationId: response.headers.get('apns-id') ?? undefined }

  const json = await response.json().catch(() => ({})) as { reason?: string }
  const reason = json.reason ?? 'APNs rejected notification'
  return {
    ok: false,
    transient: response.status === 429 || response.status >= 500,
    invalidToken: response.status === 410 || reason === 'Unregistered' || reason === 'BadDeviceToken',
    error: reason,
  }
}

function writeNotificationEvent(env: NotificationEnv, input: {
  appId: string
  campaignId: string
  event: string
  notificationId?: string
  device: NativeNotificationRegistryRow
  error?: string
  badge?: number
}) {
  const binding = env.NOTIFICATION_EVENTS as { writeDataPoint?: (point: { blobs: string[], doubles: number[], indexes: string[] }) => void } | undefined
  if (!binding?.writeDataPoint)
    return
  binding.writeDataPoint({
    blobs: [
      input.event,
      input.campaignId,
      input.notificationId ?? '',
      input.device.device_key,
      input.device.recipient_key,
      input.device.provider,
      input.error ?? '',
      input.device.platform,
    ],
    doubles: [Math.max(0, Math.trunc(input.badge ?? 0))],
    indexes: [(`${input.appId}:${input.campaignId}`).slice(0, 96)],
  })
}

function tombstoneDevice(env: NotificationEnv, appId: string, device: NativeNotificationRegistryRow) {
  const binding = env.NOTIFICATION_REGISTRY as { writeDataPoint?: (point: { blobs: string[], doubles: number[], indexes: string[] }) => void } | undefined
  if (!binding?.writeDataPoint)
    return
  const bucket = getNotificationBucket(device.recipient_key)
  binding.writeDataPoint({
    blobs: [
      device.device_key,
      device.recipient_key,
      '',
      device.token_hash ?? '',
      device.provider,
      device.platform,
      device.locale ?? '',
      device.timezone ?? '',
      device.app_version ?? '',
      device.plugin_version ?? '',
      device.tags ?? '',
      device.attributes ?? '',
    ],
    doubles: [0, Math.max(0, Math.trunc(device.badge ?? 0)), Number(device.permission ?? 0), 0],
    indexes: [getNotificationIndex(appId, bucket)],
  })
}

async function sendToDevice(env: NotificationEnv, message: NativeNotificationQueueMessage, device: NativeNotificationRegistryRow): Promise<SendOutcome> {
  const providerConfig = getProviderConfig(message, device.provider)
  if (!providerConfig)
    return { ok: false, transient: false, error: `Missing configured provider for ${device.provider}` }
  const token = await decryptToken(env, device.encrypted_token)
  if (device.provider === 'fcm')
    return sendFcm(env, providerConfig, token, message)
  if (device.provider === 'apns')
    return sendApns(env, providerConfig, token, message)
  return { ok: false, transient: false, error: `Unsupported provider ${device.provider}` }
}

function retryAttempt(message: NativeNotificationQueueMessage): number {
  const attempt = Number(message.attempt ?? 0)
  return Number.isFinite(attempt) ? Math.max(0, Math.trunc(attempt)) : 0
}

function canRetry(message: NativeNotificationQueueMessage): boolean {
  return retryAttempt(message) < MAX_NOTIFICATION_RETRY_ATTEMPTS
}

function shouldRetryThrownError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return ![
    'Invalid notification token ciphertext',
    'Missing notification token secret',
    'Missing FCM service account secret',
    'Missing APNs team id or key id',
  ].some(permanentError => message.includes(permanentError))
}

export async function processNativeNotificationQueueMessage(message: NativeNotificationQueueMessage, env: NotificationEnv): Promise<NativeNotificationRegistryRow[]> {
  const retryDevices: NativeNotificationRegistryRow[] = []
  const shouldRetry = canRetry(message)

  for (const device of message.devices) {
    try {
      const outcome = await sendToDevice(env, message, device)
      if (outcome.ok) {
        writeNotificationEvent(env, { appId: message.appId, campaignId: message.campaignId, event: 'sent', notificationId: outcome.notificationId, device, badge: message.badge })
        writeNotificationEvent(env, { appId: message.appId, campaignId: message.campaignId, event: 'provider_accepted', notificationId: outcome.notificationId, device, badge: message.badge })
        continue
      }

      writeNotificationEvent(env, { appId: message.appId, campaignId: message.campaignId, event: 'failed', device, error: outcome.error, badge: message.badge })
      if (outcome.invalidToken)
        tombstoneDevice(env, message.appId, device)
      if (shouldRetry && outcome.transient)
        retryDevices.push(device)
    }
    catch (error) {
      writeNotificationEvent(env, { appId: message.appId, campaignId: message.campaignId, event: 'failed', device, error: error instanceof Error ? error.message : 'notification send failed', badge: message.badge })
      if (shouldRetry && shouldRetryThrownError(error))
        retryDevices.push(device)
    }
  }

  return retryDevices
}

export async function processNativeNotificationQueueBatch(batch: MessageBatch<NativeNotificationQueueMessage>, env: NotificationEnv) {
  await Promise.all(batch.messages.map(async (queueMessage) => {
    try {
      const retryDevices = await processNativeNotificationQueueMessage(queueMessage.body, env)
      if (retryDevices.length) {
        const queue = env.NOTIFICATION_QUEUE as { send?: (body: NativeNotificationQueueMessage) => Promise<void> } | undefined
        if (!queue?.send)
          throw new Error('Notification retry queue is not configured')
        await queue.send({ ...queueMessage.body, attempt: retryAttempt(queueMessage.body) + 1, devices: retryDevices })
      }
      queueMessage.ack()
    }
    catch {
      queueMessage.retry()
    }
  }))
}
