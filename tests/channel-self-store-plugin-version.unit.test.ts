import { describe, expect, it, vi } from 'vitest'

import { shouldSyncChannelSelfOverrideForPluginVersion, syncLegacyChannelSelfOverrideDeleteForDevice, syncLegacyChannelSelfOverrideForDevice } from '../supabase/functions/_backend/utils/channelSelfStore.ts'

function createContext(store: { put: ReturnType<typeof vi.fn>, delete: ReturnType<typeof vi.fn> }) {
  return {
    env: {
      CHANNEL_SELF_STORE: store,
    },
    get: vi.fn((key: string) => {
      if (key === 'requestId')
        return 'request-test'
      return undefined
    }),
    req: {
      url: 'https://api.capgo.test/updates',
    },
  }
}

function createStore() {
  return {
    delete: vi.fn(async (_key: string) => undefined),
    put: vi.fn(async (_key: string, _value: string) => undefined),
  }
}

function createDeviceClient(pluginVersion: string | null) {
  return {
    from(table: string) {
      expect(table).toBe('devices')
      return {
        select() {
          return this
        },
        eq() {
          return this
        },
        maybeSingle: vi.fn(async () => ({
          data: pluginVersion ? { plugin_version: pluginVersion } : null,
          error: null,
        })),
      }
    },
  }
}

describe('channel_self override KV plugin version gate', () => {
  it.each([
    ['5.33.9', true],
    ['5.34.0', false],
    ['6.33.9', true],
    ['6.34.0', false],
    ['7.33.9', true],
    ['7.34.0', false],
    ['7.42.0', false],
    ['8.0.0', false],
    ['', false],
    [null, false],
    ['invalid', false],
  ])('returns %s for %s', (pluginVersion, expected) => {
    expect(shouldSyncChannelSelfOverrideForPluginVersion(pluginVersion)).toBe(expected)
  })

  it('writes channel_self KV for legacy plugin devices', async () => {
    const store = createStore()

    await syncLegacyChannelSelfOverrideForDevice(createContext(store) as any, createDeviceClient('7.33.9') as any, {
      app_id: 'com.test.app',
      channel_id: 42,
      device_id: 'DEVICE-ID',
    })

    expect(store.put).toHaveBeenCalledTimes(1)
    expect(store.put.mock.calls[0][0]).toBe('channel_self:v1:com.test.app:device-id')
    expect(JSON.parse(store.put.mock.calls[0][1])).toMatchObject({
      app_id: 'com.test.app',
      channel_id: 42,
      device_id: 'device-id',
    })
  })

  it('does not write channel_self KV for new plugin devices', async () => {
    const store = createStore()

    await syncLegacyChannelSelfOverrideForDevice(createContext(store) as any, createDeviceClient('7.34.0') as any, {
      app_id: 'com.test.app',
      channel_id: 42,
      device_id: 'DEVICE-ID',
    })

    expect(store.put).not.toHaveBeenCalled()
  })

  it('deletes channel_self KV for legacy plugin devices', async () => {
    const store = createStore()

    await syncLegacyChannelSelfOverrideDeleteForDevice(createContext(store) as any, createDeviceClient('7.33.9') as any, 'com.test.app', 'DEVICE-ID')

    expect(store.delete).toHaveBeenCalledWith('channel_self:v1:com.test.app:device-id')
  })

  it('does not delete channel_self KV for new plugin devices', async () => {
    const store = createStore()

    await syncLegacyChannelSelfOverrideDeleteForDevice(createContext(store) as any, createDeviceClient('7.42.0') as any, 'com.test.app', 'DEVICE-ID')

    expect(store.delete).not.toHaveBeenCalled()
  })
})
