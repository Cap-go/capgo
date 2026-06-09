import type { Database } from '../src/types/supabase.types'
import { describe, expect, it } from 'vitest'
import { useDeviceUpdateFormat } from '../src/composables/useDeviceUpdateFormat'

type DeviceRow = Database['public']['Tables']['devices']['Row']

describe('device update format helpers', () => {
  it.concurrent('preserves the stored default channel and includes the override channel', () => {
    const { transformDeviceToUpdateRequest } = useDeviceUpdateFormat()
    const device: DeviceRow = {
      app_id: 'lgbt.vibes.application',
      custom_id: '',
      default_channel: 'insiders',
      device_id: '31de6a5e-80a9-4348-9af1-31e1e9562583',
      id: 1,
      is_emulator: false,
      is_prod: true,
      key_id: null,
      os_version: '16',
      platform: 'android',
      plugin_version: '7.42.3',
      updated_at: '2026-06-08T14:14:00.000Z',
      version: null,
      version_build: '3.1.0',
      version_name: '3.1.0-insiders.59',
    }

    expect(transformDeviceToUpdateRequest(device, 'lgbt.vibes.application', device.default_channel ?? '', 'dev')).toMatchObject({
      app_id: 'lgbt.vibes.application',
      device_id: '31de6a5e-80a9-4348-9af1-31e1e9562583',
      defaultChannel: 'insiders',
      channel: 'dev',
    })
  })

  it.concurrent('omits the override channel when no override is set', () => {
    const { transformDeviceToUpdateRequest } = useDeviceUpdateFormat()
    const device = {
      app_id: 'lgbt.vibes.application',
      custom_id: '',
      default_channel: 'insiders',
      device_id: '31de6a5e-80a9-4348-9af1-31e1e9562583',
      id: 1,
      is_emulator: false,
      is_prod: true,
      key_id: null,
      os_version: '16',
      platform: 'android',
      plugin_version: '7.42.3',
      updated_at: '2026-06-08T14:14:00.000Z',
      version: null,
      version_build: '3.1.0',
      version_name: '3.1.0-insiders.59',
    } satisfies DeviceRow

    expect(transformDeviceToUpdateRequest(device, 'lgbt.vibes.application', device.default_channel ?? '')).toMatchObject({
      defaultChannel: 'insiders',
    })
    expect(transformDeviceToUpdateRequest(device, 'lgbt.vibes.application', device.default_channel ?? '')).not.toHaveProperty('channel')
  })
})
