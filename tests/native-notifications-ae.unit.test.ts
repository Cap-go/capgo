import { afterAll, describe, expect, it, vi } from 'vitest'
import {
  buildNotificationRegistryLookupQuery,
  buildNotificationStatsQuery,
  createNotificationEventProof,
  createNotificationIdentityProof,
  enqueueNativeNotificationFanout,
  getAllNotificationBuckets,
  getNotificationBucket,
  getNotificationEventIndex,
  getNotificationIndex,
  verifyNotificationEventProof,
  verifyNotificationIdentityProof,
} from '../supabase/functions/_backend/utils/nativeNotifications'
import { processNativeNotificationQueueMessage } from '../supabase/functions/_backend/utils/nativeNotificationSender'

const textEncoder = new TextEncoder()

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCodePoint(byte)
  })
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '')
}

async function encryptToken(secret: string, token: string) {
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(secret))
  const key = await crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt'])
  const iv = new Uint8Array(12)
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, textEncoder.encode(token))
  return `v1:${toBase64Url(iv)}:${toBase64Url(new Uint8Array(encrypted))}`
}

function fcmDevice(encryptedToken: string) {
  return {
    device_key: 'device-key',
    recipient_key: 'aa-recipient',
    encrypted_token: encryptedToken,
    token_hash: 'hash',
    provider: 'fcm' as const,
    platform: 'android' as const,
    locale: '',
    timezone: '',
    app_version: '',
    plugin_version: '',
    tags: '',
    attributes: '',
    active: 1,
    badge: 0,
    permission: 2,
    consent: 1,
    updated_at: '',
  }
}

const fetchRequests = new Map<string, any[]>()
const analyticsRowsByApp = new Map<string, any[]>()
const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
  const url = String(_url)
  if (url.includes('/analytics_engine/sql')) {
    const query = String(init?.body || '')
    const appId = query.match(/index1 IN \('([^']+):[0-9a-f]{2}'/)?.[1] ?? ''
    return new Response(JSON.stringify({ data: analyticsRowsByApp.get(appId) ?? [] }), { status: 200 })
  }

  let requestBody: any = {}
  try {
    requestBody = JSON.parse(String(init?.body || '{}'))
  }
  catch {
    requestBody = {}
  }
  const token = typeof requestBody?.message?.token === 'string' ? requestBody.message.token : ''
  if (token) {
    const requests = fetchRequests.get(token) ?? []
    requests.push(requestBody)
    fetchRequests.set(token, requests)
  }

  if (token === 'push-token-invalid')
    return new Response(JSON.stringify({ error: { status: 'UNREGISTERED', message: 'Token is gone' } }), { status: 404 })
  if (token === 'push-token-invalid-payload') {
    return new Response(JSON.stringify({
      error: {
        status: 'INVALID_ARGUMENT',
        message: 'Invalid payload',
        details: [{
          '@type': 'type.googleapis.com/google.rpc.BadRequest',
          fieldViolations: [{ field: 'message.notification.title' }],
        }],
      },
    }), { status: 400 })
  }
  if (token === 'push-token-transient')
    return new Response(JSON.stringify({ error: { status: 'UNAVAILABLE', message: 'Try later' } }), { status: 503 })

  return new Response(JSON.stringify({ name: 'projects/demo/messages/1' }), { status: 200 })
})

afterAll(() => {
  fetchMock.mockRestore()
})

function requestsFor(token: string) {
  return fetchRequests.get(token) ?? []
}

describe('native notification AE registry', () => {
  it.concurrent('uses deterministic app bucket indexes and argMax latest-device lookup', () => {
    expect(getNotificationBucket('ff00')).toBe('ff')
    expect(getNotificationBucket('not-hex')).toBe('e0')
    expect(getAllNotificationBuckets()).toHaveLength(256)
    expect(getNotificationIndex('com.demo.app', '0a')).toBe('com.demo.app:0a')

    const query = buildNotificationRegistryLookupQuery({
      dataset: 'notification_registry',
      appId: 'com.demo.app',
      buckets: ['0a'],
      recipientKey: 'recipient-key',
      now: new Date('2026-05-06T00:00:00Z'),
    })

    expect(query).toContain('FROM notification_registry')
    expect(query).toContain("index1 IN ('com.demo.app:0a')")
    expect(query).toContain('argMax(blob3, timestamp) AS encrypted_token')
    expect(query).toContain('GROUP BY blob1')
    expect(query).toContain('active = 1')
    expect(query).toContain('consent = 1')
    expect(query).toContain("recipient_key = 'recipient-key'")
  })

  it.concurrent('searches every registry bucket for device-key-only lookups', () => {
    const query = buildNotificationRegistryLookupQuery({
      dataset: 'notification_registry',
      appId: 'com.demo.app',
      deviceKey: 'device-key',
      now: new Date('2026-05-06T00:00:00Z'),
    })

    expect(query).toContain("index1 IN ('com.demo.app:00'")
    expect(query).toContain("'com.demo.app:ff'")
    expect(query).toContain("device_key = 'device-key'")
  })

  it.concurrent('builds notification event stats from AE only', () => {
    const query = buildNotificationStatsQuery({
      dataset: 'notification_events',
      appId: 'com.demo.app',
      campaignId: 'campaign-1',
      days: 7,
      now: new Date('2026-05-06T00:00:00Z'),
    })

    expect(query).toContain('FROM notification_events')
    expect(query).toContain("index1 = 'com.demo.app:campaign-1'")
    expect(query).toContain("blob2 = 'campaign-1'")
    expect(query).toContain('GROUP BY blob1')
  })

  it.concurrent('normalizes notification event indexes consistently for long IDs', () => {
    const appId = 'com.demo.'.concat('a'.repeat(120))
    const campaignId = 'campaign-'.concat('b'.repeat(120))
    const expectedIndex = `${appId}:${campaignId}`.slice(0, 96)
    const query = buildNotificationStatsQuery({
      dataset: 'notification_events',
      appId,
      campaignId,
      days: 7,
      now: new Date('2026-05-06T00:00:00Z'),
    })

    expect(getNotificationEventIndex(appId, campaignId)).toBe(expectedIndex)
    expect(query).toContain(`index1 = '${expectedIndex}'`)
    expect(query).toContain(`blob2 = '${campaignId}'`)
  })

  it.concurrent('verifies server-minted identity and event proofs', async () => {
    vi.stubEnv('NOTIFICATIONS_HMAC_SECRET', 'secret')
    try {
      const context = {} as any
      const identityProof = await createNotificationIdentityProof(context, 'com.demo.app', 'user-1')
      const eventProof = await createNotificationEventProof(context, 'com.demo.app', 'recipient-key', 'device-key')

      expect(await verifyNotificationIdentityProof(context, 'com.demo.app', 'user-1', identityProof)).toBe(true)
      expect(await verifyNotificationIdentityProof(context, 'com.demo.app', 'user-2', identityProof)).toBe(false)
      expect(await verifyNotificationEventProof(context, 'com.demo.app', 'recipient-key', 'device-key', eventProof)).toBe(true)
      expect(await verifyNotificationEventProof(context, 'com.demo.app', 'recipient-key', 'other-device', eventProof)).toBe(false)
    }
    finally {
      vi.unstubAllEnvs()
    }
  })

  it.concurrent('keeps limited fanout in one queue job so the limit stays global', async () => {
    const messages: any[] = []
    const queued = await enqueueNativeNotificationFanout({
      env: {
        NOTIFICATION_QUEUE: {
          send: (message: any) => {
            messages.push(message)
            return Promise.resolve()
          },
        },
      },
    } as any, {
      kind: 'send',
      appId: 'com.demo.app',
      campaignId: 'campaign-limit',
      payload: {},
      target: { broadcast: true },
      limit: 1,
    }, ['00', '01'])

    expect(queued).toBe(true)
    expect(messages).toHaveLength(1)
    expect(messages[0].buckets).toEqual(['00', '01'])
    expect(messages[0].devices).toBeUndefined()
  })
})
describe('native notification queue sender', () => {
  it.concurrent('resolves bucket fanout devices from AE inside the worker', async () => {
    const token = 'push-token-ae'
    const encryptedToken = await encryptToken('secret', token)
    const device = {
      ...fcmDevice(encryptedToken),
      recipient_key: 'bb-recipient',
    }
    analyticsRowsByApp.set('com.demo.ae', [device])
    const events: any[] = []

    const retryDevices = await processNativeNotificationQueueMessage({
      kind: 'send',
      appId: 'com.demo.ae',
      campaignId: 'campaign-ae',
      payload: { title: 'Hello', body: 'AE' },
      target: { recipientKey: 'bb-recipient' },
      buckets: ['bb'],
      providerConfigs: [{
        provider: 'fcm',
        status: 'configured',
        secretRef: 'FCM_SECRET',
        config: { projectId: 'demo-project' },
      }],
    }, {
      API_SECRET: 'secret',
      CF_ANALYTICS_TOKEN: 'cf-token',
      CF_ACCOUNT_ANALYTICS_ID: 'cf-account',
      FCM_SECRET: JSON.stringify({ access_token: 'token', project_id: 'demo-project' }),
      NOTIFICATION_EVENTS: { writeDataPoint: (point: any) => events.push(point) },
    })

    expect(retryDevices).toHaveLength(0)
    expect(requestsFor(token)).toHaveLength(1)
    expect(events.some(point => point.blobs[0] === 'queued')).toBe(true)
    expect(events.some(point => point.blobs[0] === 'sent')).toBe(true)
  })

  it.concurrent('builds silent update-check payloads for Capgo updater', async () => {
    const token = 'push-token-update'
    const encryptedToken = await encryptToken('secret', token)
    const retryDevices = await processNativeNotificationQueueMessage({
      kind: 'update_check',
      appId: 'com.demo.app',
      campaignId: 'campaign-update',
      payload: { silent: true, background: true, installMode: 'next', data: {} },
      providerConfigs: [{
        provider: 'fcm',
        status: 'configured',
        secretRef: 'FCM_SECRET',
        config: { projectId: 'demo-project' },
      }],
      devices: [fcmDevice(encryptedToken)],
    }, {
      API_SECRET: 'secret',
      FCM_SECRET: JSON.stringify({ access_token: 'token', project_id: 'demo-project' }),
      NOTIFICATION_EVENTS: { writeDataPoint: () => undefined },
    })

    expect(retryDevices).toHaveLength(0)
    const requests = requestsFor(token)
    expect(requests[0].message.notification).toBeUndefined()
    expect(requests[0].message.data.capgoAction).toBe('update_check')
    expect(requests[0].message.data.capgoUpdateInstallMode).toBe('next')
    expect(requests[0].message.android.priority).toBe('high')
    expect(requests[0].message.apns.payload.aps['content-available']).toBe(1)
  })

  it.concurrent('tombstones invalid FCM tokens in AE without a DB write', async () => {
    const events: any[] = []
    const registry: any[] = []

    const encryptedToken = await encryptToken('secret', 'push-token-invalid')
    const retryDevices = await processNativeNotificationQueueMessage({
      kind: 'send',
      appId: 'com.demo.app',
      campaignId: 'campaign-1',
      payload: { title: 'Hello', body: 'World' },
      providerConfigs: [{
        provider: 'fcm',
        status: 'configured',
        secretRef: 'FCM_SECRET',
        config: { projectId: 'demo-project' },
      }],
      devices: [fcmDevice(encryptedToken)],
    }, {
      API_SECRET: 'secret',
      FCM_SECRET: JSON.stringify({ access_token: 'token', project_id: 'demo-project' }),
      NOTIFICATION_EVENTS: { writeDataPoint: (point: any) => events.push(point) },
      NOTIFICATION_REGISTRY: { writeDataPoint: (point: any) => registry.push(point) },
    })

    expect(retryDevices).toHaveLength(0)
    expect(events.some(point => point.blobs[0] === 'failed')).toBe(true)
    expect(registry).toHaveLength(1)
    expect(registry[0].doubles[0]).toBe(0)
    expect(registry[0].indexes[0]).toBe('com.demo.app:aa')
  })

  it.concurrent('does not tombstone non-token FCM invalid argument errors', async () => {
    const registry: any[] = []

    const encryptedToken = await encryptToken('secret', 'push-token-invalid-payload')
    const retryDevices = await processNativeNotificationQueueMessage({
      kind: 'send',
      appId: 'com.demo.app',
      campaignId: 'campaign-1',
      payload: { title: 'Hello', body: 'World' },
      providerConfigs: [{
        provider: 'fcm',
        status: 'configured',
        secretRef: 'FCM_SECRET',
        config: { projectId: 'demo-project' },
      }],
      devices: [fcmDevice(encryptedToken)],
    }, {
      API_SECRET: 'secret',
      FCM_SECRET: JSON.stringify({ access_token: 'token', project_id: 'demo-project' }),
      NOTIFICATION_EVENTS: { writeDataPoint: () => undefined },
      NOTIFICATION_REGISTRY: { writeDataPoint: (point: any) => registry.push(point) },
    })

    expect(retryDevices).toHaveLength(0)
    expect(registry).toHaveLength(0)
  })

  it.concurrent('does not retry permanent or exhausted notification send failures', async () => {
    const encryptedToken = await encryptToken('wrong-secret', 'push-token-permanent')
    const permanentRetryDevices = await processNativeNotificationQueueMessage({
      kind: 'send',
      appId: 'com.demo.app',
      campaignId: 'campaign-1',
      payload: { title: 'Hello', body: 'World' },
      providerConfigs: [{
        provider: 'fcm',
        status: 'configured',
        secretRef: 'FCM_SECRET',
        config: { projectId: 'demo-project' },
      }],
      devices: [fcmDevice(encryptedToken)],
    }, {
      API_SECRET: 'secret',
      FCM_SECRET: JSON.stringify({ access_token: 'token', project_id: 'demo-project' }),
      NOTIFICATION_EVENTS: { writeDataPoint: () => undefined },
    })

    const exhaustedRetryDevices = await processNativeNotificationQueueMessage({
      kind: 'send',
      appId: 'com.demo.app',
      campaignId: 'campaign-1',
      attempt: 3,
      payload: { title: 'Hello', body: 'World' },
      providerConfigs: [{
        provider: 'fcm',
        status: 'configured',
        secretRef: 'FCM_SECRET',
        config: { projectId: 'demo-project' },
      }],
      devices: [await encryptToken('secret', 'push-token-transient').then(fcmDevice)],
    }, {
      API_SECRET: 'secret',
      FCM_SECRET: JSON.stringify({ access_token: 'token', project_id: 'demo-project' }),
      NOTIFICATION_EVENTS: { writeDataPoint: () => undefined },
    })

    expect(permanentRetryDevices).toHaveLength(0)
    expect(exhaustedRetryDevices).toHaveLength(0)
  })
})
