import { describe, expect, it } from 'vitest'
import { summarizePluginRequestForLog } from '../supabase/functions/_backend/utils/plugin_request_log.ts'

describe('plugin request logging', () => {
  it('keeps public plugin request logs metadata-only', () => {
    const summary = summarizePluginRequestForLog({
      app_id: 'com.example.app',
      device_id: 'device-secret-123',
      custom_id: 'customer@example.com',
      key_id: 'key-id-abc',
      channel: 'private-beta',
      defaultChannel: 'production',
      platform: 'ios',
      plugin_version: '8.0.0',
      version_build: '1.2.3',
      version_name: '1.2.3',
      version_os: '17.0',
      is_prod: true,
      is_emulator: false,
    })

    expect(summary).toEqual({
      app_id: 'com.example.app',
      platform: 'ios',
      plugin_version: '8.0.0',
      version_build: '1.2.3',
      version_name: '1.2.3',
      version_os: '17.0',
      is_prod: true,
      is_emulator: false,
      has_device_id: true,
      has_custom_id: true,
      has_key_id: true,
      has_channel: true,
      has_default_channel: true,
    })

    const serialized = JSON.stringify(summary)
    expect(serialized).not.toContain('device-secret-123')
    expect(serialized).not.toContain('customer@example.com')
    expect(serialized).not.toContain('key-id-abc')
    expect(serialized).not.toContain('private-beta')
    expect(serialized).not.toContain('production')
  })

  it('handles empty plugin requests without throwing', () => {
    expect(summarizePluginRequestForLog(undefined)).toMatchObject({
      has_device_id: false,
      has_custom_id: false,
      has_key_id: false,
      has_channel: false,
      has_default_channel: false,
    })
  })
})
