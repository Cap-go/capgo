import { beforeEach, describe, expect, it, vi } from 'vitest'

const getPgClientMock = vi.fn(() => ({ client: 'pg' }))
const getDrizzleClientMock = vi.fn(() => ({}))
const getAppOwnerPostgresMock = vi.fn()
const getChannelsPgMock = vi.fn()
const getChannelDeviceOverridePgMock = vi.fn()

;(globalThis as any).EdgeRuntime = undefined

vi.mock('../supabase/functions/_backend/utils/appStatus.ts', () => ({
  getAppStatus: vi.fn(() => Promise.resolve({ status: 'cloud', allow_device_custom_id: true })),
  setAppStatus: vi.fn(() => Promise.resolve()),
}))

vi.mock('../supabase/functions/_backend/utils/channelSelfRateLimit.ts', () => ({
  checkChannelSelfIPRateLimit: vi.fn(() => Promise.resolve({ limited: false })),
  isChannelSelfRateLimited: vi.fn(() => Promise.resolve({ limited: false })),
  recordChannelSelfIPRequest: vi.fn(() => Promise.resolve()),
  recordChannelSelfRequest: vi.fn(() => Promise.resolve()),
}))

vi.mock('../supabase/functions/_backend/utils/discord.ts', () => ({
  sendDiscordAlert500: vi.fn(() => Promise.resolve()),
  sendDiscordAlert: vi.fn(() => Promise.resolve()),
}))

vi.mock('../supabase/functions/_backend/utils/notifications.ts', () => ({
  sendNotifOrgCached: vi.fn(() => Promise.resolve()),
}))

vi.mock('../supabase/functions/_backend/utils/org_email_notifications.ts', () => ({
  sendNotifToOrgMembersCached: vi.fn(() => Promise.resolve()),
}))

vi.mock('../supabase/functions/_backend/utils/pg.ts', () => ({
  closeClient: vi.fn(() => Promise.resolve()),
  deleteChannelDevicePg: vi.fn(() => Promise.resolve(true)),
  getAppByIdPg: vi.fn(),
  getAppOwnerPostgres: getAppOwnerPostgresMock,
  getChannelByNamePg: vi.fn(),
  getChannelDeviceOverridePg: getChannelDeviceOverridePgMock,
  getChannelsPg: getChannelsPgMock,
  getCompatibleChannelsPg: vi.fn(),
  getDrizzleClient: getDrizzleClientMock,
  getMainChannelsPg: vi.fn(),
  getPgClient: getPgClientMock,
  setReplicationLagHeader: vi.fn(() => Promise.resolve()),
  upsertChannelDevicePg: vi.fn(() => Promise.resolve(true)),
}))

vi.mock('../supabase/functions/_backend/utils/stats.ts', () => ({
  sendStatsAndDevice: vi.fn(() => Promise.resolve()),
}))

function putBody(pluginVersion: string) {
  return {
    app_id: 'com.test.app',
    device_id: '11111111-1111-4111-8111-111111111111',
    platform: 'ios',
    version_name: '1.0.0',
    version_build: '1.0.0',
    is_emulator: false,
    is_prod: true,
    plugin_version: pluginVersion,
  }
}

async function fetchPut(pluginVersion: string) {
  const { app } = await import('../supabase/functions/_backend/plugins/channel_self.ts')
  return app.fetch(new Request('http://localhost/', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(putBody(pluginVersion)),
  }), {}, { waitUntil: () => { } } as any)
}

describe('channel_self PUT database routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getAppOwnerPostgresMock.mockResolvedValue({
      allow_device_custom_id: true,
      owner_org: 'test-org',
      orgs: { management_email: 'owner@example.com' },
      plan_valid: true,
    })
    getChannelsPgMock.mockResolvedValue([
      {
        android: true,
        electron: true,
        ios: true,
        name: 'production',
      },
    ])
    getChannelDeviceOverridePgMock.mockResolvedValue(null)
  })

  it('uses primary for old plugin channel_devices read-after-write consistency', async () => {
    const response = await fetchPut('7.33.0')

    expect(response.status).toBe(200)
    expect(getPgClientMock).toHaveBeenCalledWith(expect.anything(), false)
  })

  it('uses replica for new plugin local channel storage reads', async () => {
    const response = await fetchPut('7.34.0')

    expect(response.status).toBe(200)
    expect(getPgClientMock).toHaveBeenCalledWith(expect.anything(), true)
  })
})
