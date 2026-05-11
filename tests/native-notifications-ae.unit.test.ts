import { describe, expect, it, vi } from 'vitest'
import {
  buildNotificationRegistryLookupQuery,
  buildNotificationStatsQuery,
  getAllNotificationBuckets,
  getNotificationBucket,
  getNotificationIndex,
} from '../supabase/functions/_backend/utils/nativeNotifications'
import { processNativeNotificationQueueMessage } from '../supabase/functions/_backend/utils/nativeNotificationSender'

const textEncoder = new TextEncoder()

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

async function encryptToken(secret: string, token: string) {
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(secret))
  const key = await crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt'])
  const iv = new Uint8Array(12)
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, textEncoder.encode(token))
  return 'v1:' + toBase64Url(iv) + ':' + toBase64Url(new Uint8Array(encrypted))
}

describe('native notification AE registry', () => {
  it('uses deterministic app bucket indexes and argMax latest-device lookup', () => {
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

  it('builds notification event stats from AE only', () => {
    const query = buildNotificationStatsQuery({
      dataset: 'notification_events',
      appId: 'com.demo.app',
      campaignId: 'campaign-1',
      days: 7,
      now: new Date('2026-05-06T00:00:00Z'),
    })

    expect(query).toContain('FROM notification_events')
    expect(query).toContain("index1 = 'com.demo.app:campaign-1'")
    expect(query).toContain('GROUP BY blob1')
  })
})
describe('native notification queue sender', () => {
  it('builds silent update-check payloads for Capgo updater', async () => {
    const requests: any[] = []
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      requests.push(JSON.parse(String(init?.body || '{}')))
      return new Response(JSON.stringify({ name: 'projects/demo/messages/1' }), { status: 200 })
    })

    const encryptedToken = await encryptToken('secret', 'push-token')
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
      devices: [{
        device_key: 'device-key',
        recipient_key: 'aa-recipient',
        encrypted_token: encryptedToken,
        token_hash: 'hash',
        provider: 'fcm',
        platform: 'android',
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
      }],
    }, {
      API_SECRET: 'secret',
      FCM_SECRET: JSON.stringify({ access_token: 'token', project_id: 'demo-project' }),
      NOTIFICATION_EVENTS: { writeDataPoint: () => undefined },
    })

    expect(retryDevices).toHaveLength(0)
    expect(requests[0].message.notification).toBeUndefined()
    expect(requests[0].message.data.capgoAction).toBe('update_check')
    expect(requests[0].message.data.capgoUpdateInstallMode).toBe('next')
    expect(requests[0].message.android.priority).toBe('high')
    expect(requests[0].message.apns.payload.aps['content-available']).toBe(1)
    fetchMock.mockRestore()
  })

  it('tombstones invalid FCM tokens in AE without a DB write', async () => {
    const events: any[] = []
    const registry: any[] = []
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response(JSON.stringify({ error: { status: 'UNREGISTERED', message: 'Token is gone' } }), { status: 404 })
    })

    const encryptedToken = await encryptToken('secret', 'push-token')
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
      devices: [{
        device_key: 'device-key',
        recipient_key: 'aa-recipient',
        encrypted_token: encryptedToken,
        token_hash: 'hash',
        provider: 'fcm',
        platform: 'android',
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
      }],
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
    fetchMock.mockRestore()
  })
})
