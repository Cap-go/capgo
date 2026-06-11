import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { closeClientMock, sendNotifOrgMock, sendNotifToOrgMembersMock } = vi.hoisted(() => ({
  closeClientMock: vi.fn(),
  sendNotifOrgMock: vi.fn(),
  sendNotifToOrgMembersMock: vi.fn(),
}))

vi.mock('../supabase/functions/_backend/utils/logging.ts', () => ({
  cloudlog: vi.fn(),
  cloudlogErr: vi.fn(),
  serializeError: vi.fn(error => error),
}))

vi.mock('../supabase/functions/_backend/utils/notifications.ts', () => ({
  sendNotifOrg: sendNotifOrgMock,
}))

vi.mock('../supabase/functions/_backend/utils/org_email_notifications.ts', () => ({
  sendNotifToOrgMembers: sendNotifToOrgMembersMock,
}))

vi.mock('../supabase/functions/_backend/utils/pg.ts', () => ({
  closeClient: closeClientMock,
  getDrizzleClient: vi.fn(pgClient => ({ pgClient })),
  getPgClient: vi.fn(() => ({ id: 'pg-client' })),
}))

const API_SECRET = 'testsecret'
const originalApiSecret = process.env.API_SECRET

function orgQueueItem() {
  return {
    type: 'org' as const,
    eventName: 'org:missing_payment',
    eventData: { app_id: 'com.test.app' },
    orgId: 'org-1',
    uniqId: 'com.test.app',
    cron: '0 0 * * 1',
    managementEmail: 'owner@example.com',
    enqueuedAt: new Date().toISOString(),
  }
}

async function requestPluginNotifications(items: unknown[]) {
  const { app } = await import('../supabase/functions/_backend/triggers/plugin_notifications.ts')
  return await app.request('http://local/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apisecret': API_SECRET,
    },
    body: JSON.stringify({ items }),
  })
}

describe('plugin notification trigger', () => {
  beforeEach(() => {
    process.env.API_SECRET = API_SECRET
    closeClientMock.mockResolvedValue(undefined)
    sendNotifOrgMock.mockReset()
    sendNotifToOrgMembersMock.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
    if (originalApiSecret === undefined)
      delete process.env.API_SECRET
    else
      process.env.API_SECRET = originalApiSecret
  })

  it('returns non-2xx when a queued org notification is not delivered', async () => {
    sendNotifOrgMock.mockResolvedValue(false)

    const response = await requestPluginNotifications([orgQueueItem()])
    const body = await response.text()

    expect(response.status).toBe(500)
    expect(body).toContain('Plugin notification batch failed')
    expect(sendNotifOrgMock).toHaveBeenCalledTimes(1)
    expect(closeClientMock).toHaveBeenCalledTimes(1)
  })

  it('accepts queued org notifications that are already throttled by cron', async () => {
    sendNotifOrgMock.mockResolvedValue({ sent: false, lastSendAt: new Date().toISOString() })

    const response = await requestPluginNotifications([orgQueueItem()])
    const body = await response.json() as { processed: number, failed: number }

    expect(response.status).toBe(200)
    expect(body).toMatchObject({ processed: 1, failed: 0 })
  })
})
