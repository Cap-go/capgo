import { describe, expect, it, vi } from 'vitest'

const { cloudlogMock } = vi.hoisted(() => ({
  cloudlogMock: vi.fn(),
}))

vi.mock('../supabase/functions/_backend/utils/logging.ts', () => ({
  cloudlog: cloudlogMock,
  cloudlogErr: vi.fn(),
  serializeError: vi.fn(error => error),
}))

function createContext(flags: Partial<Record<'skipSupabaseStatsFallback' | 'skipSupabaseNotificationWrites' | 'queuePluginNotifications' | 'skipChannelSelfPostgresFallback' | 'requireReadReplica', boolean>> = {}, env: Record<string, any> = {}) {
  return {
    env,
    get: (key: string) => {
      if (key in flags)
        return flags[key as keyof typeof flags]
      if (key === 'requestId')
        return 'request-id'
      return undefined
    },
    req: {
      raw: {
        cf: {},
        headers: new Headers(),
      },
      url: 'http://localhost/test',
    },
    res: {
      headers: new Headers(),
    },
  } as any
}

function createPluginPolicyContext() {
  return createContext({
    skipSupabaseStatsFallback: true,
    skipSupabaseNotificationWrites: true,
    queuePluginNotifications: true,
    skipChannelSelfPostgresFallback: true,
    requireReadReplica: true,
  })
}

describe('plugin Supabase write policy', () => {
  it.concurrent('fails closed instead of falling back from read replica to primary', async () => {
    const { getPgClient } = await import('../supabase/functions/_backend/utils/pg.ts')

    expect(() => getPgClient(createPluginPolicyContext(), true)).toThrow('Read replica is required for this endpoint')
  })

  it.concurrent('skips Supabase stats fallbacks when Cloudflare analytics bindings are absent', async () => {
    const { createStatsBandwidth, createStatsDevices, createStatsLogs, createStatsLogsExternal, createStatsMau, createStatsVersion } = await import('../supabase/functions/_backend/utils/stats.ts')
    const context = createPluginPolicyContext()

    await expect(createStatsMau(context, 'device-1', 'com.test.app', 'org-1', 'ios', '1.0.0')).resolves.toBeUndefined()
    await expect(createStatsVersion(context, '1.0.0', 'com.test.app', 'get')).resolves.toBeUndefined()
    await expect(createStatsLogs(context, 'com.test.app', 'device-1', 'get', '1.0.0')).resolves.toBeUndefined()
    await expect(createStatsLogsExternal(context, 'com.test.app', 'device-1', 'get', '1.0.0')).resolves.toBeUndefined()
    await expect(createStatsDevices(context, {
      app_id: 'com.test.app',
      device_id: '00000000-0000-4000-8000-000000000001',
      version_name: '1.0.0',
      version_build: '1.0.0',
      platform: 'ios',
      plugin_version: '7.0.0',
      os_version: '17.0',
      custom_id: '',
      is_prod: true,
      is_emulator: false,
      default_channel: null,
      updated_at: new Date().toISOString(),
    })).resolves.toBeUndefined()
    await expect(createStatsBandwidth(context, 'device-1', 'com.test.app', 42)).resolves.toBeUndefined()
  })

  it.concurrent('skips notification table writes for plugin requests', async () => {
    const { claimNotifOrgOnce, sendNotifOrgOnce } = await import('../supabase/functions/_backend/utils/notifications.ts')
    const { sendNotifToOrgMembersOnce } = await import('../supabase/functions/_backend/utils/org_email_notifications.ts')
    const context = createPluginPolicyContext()

    await expect(claimNotifOrgOnce(context, 'org:missing_payment', 'org-1', 'uniq-1')).resolves.toBe(false)
    await expect(sendNotifOrgOnce(context, 'org:missing_payment', {}, 'org-1', 'uniq-1', 'owner@example.com', {} as any)).resolves.toEqual({ sent: false, cleanupFailed: false })
    await expect(sendNotifToOrgMembersOnce(context, 'org:missing_payment', 'usage_limit', {}, 'org-1', 'uniq-1', {} as any)).resolves.toBe(false)
  })

  it.concurrent('blocks legacy channel_self PostgreSQL storage fallback in the Worker route', async () => {
    const { Hono } = await import('hono/tiny')
    const { app: channelSelfApp } = await import('../supabase/functions/_backend/plugins/channel_self.ts')
    const wrapper = new Hono()
    wrapper.use('*', async (c, next) => {
      ;(c as any).set('skipSupabaseStatsFallback', true)
      ;(c as any).set('skipSupabaseNotificationWrites', true)
      ;(c as any).set('queuePluginNotifications', true)
      ;(c as any).set('skipChannelSelfPostgresFallback', true)
      ;(c as any).set('requireReadReplica', true)
      await next()
    })
    wrapper.route('/channel_self', channelSelfApp)

    const response = await wrapper.request('/channel_self', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: 'com.test.app',
        device_id: '00000000-0000-4000-8000-000000000001',
        version_name: '1.0.0',
        version_build: '1.0.0',
        version_os: '17.0',
        platform: 'ios',
        is_emulator: false,
        is_prod: true,
        plugin_version: '7.33.0',
        channel: 'beta',
      }),
    })

    await expect(response.json()).resolves.toMatchObject({
      error: 'channel_self_server_storage_unavailable',
    })
  })
  it.concurrent('queues cached org notifications into plugin KV', async () => {
    const put = vi.fn(async (_key: string, _raw: string, _options: unknown) => undefined)
    const context = createContext({ queuePluginNotifications: true }, { CHANNEL_SELF_STORE: { put } })
    const { sendNotifOrgCached } = await import('../supabase/functions/_backend/utils/notifications.ts')

    await expect(sendNotifOrgCached(context, 'org:missing_payment', { app_id: 'com.test.app' }, 'org-1', 'com.test.app', '0 0 * * 1', 'owner@example.com', {} as any)).resolves.toBe(false)

    expect(put).toHaveBeenCalledTimes(1)
    const [key, raw, options] = put.mock.calls[0]
    expect(key).toMatch(/^plugin:notif:v1:org:/)
    expect(JSON.parse(raw as string)).toMatchObject({
      type: 'org',
      eventName: 'org:missing_payment',
      orgId: 'org-1',
      uniqId: 'com.test.app',
      managementEmail: 'owner@example.com',
    })
    expect(options).toMatchObject({ expirationTtl: 604800 })
  })

  it.concurrent('queues cached org member notifications into plugin KV', async () => {
    const put = vi.fn(async (_key: string, _raw: string, _options: unknown) => undefined)
    const context = createContext({ queuePluginNotifications: true }, { CHANNEL_SELF_STORE: { put } })
    const { sendNotifToOrgMembersCached } = await import('../supabase/functions/_backend/utils/org_email_notifications.ts')

    await expect(sendNotifToOrgMembersCached(context, 'device:channel_self_set_rejected', 'channel_self_rejected', { app_id: 'com.test.app' }, 'org-1', 'com.test.app', '0 0 * * 0', {} as any)).resolves.toBe(false)

    expect(put).toHaveBeenCalledTimes(1)
    const [key, raw, options] = put.mock.calls[0]
    expect(key).toMatch(/^plugin:notif:v1:org_members:/)
    expect(JSON.parse(raw as string)).toMatchObject({
      type: 'org_members',
      eventName: 'device:channel_self_set_rejected',
      preferenceKey: 'channel_self_rejected',
      orgId: 'org-1',
      uniqId: 'com.test.app',
      audience: 'admins',
    })
    expect(options).toMatchObject({ expirationTtl: 604800 })
  })

})
