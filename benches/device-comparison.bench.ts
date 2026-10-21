import type { DeviceWithoutCreatedAt } from '../supabase/functions/_backend/utils/types.ts'
import { describe, test } from 'vitest'
import {
  buildNormalizedDeviceForWrite,
  hasComparableDeviceChanged,
  toComparableDevice,
  toComparableExisting,
} from '../supabase/functions/_backend/utils/deviceComparison.ts'

const fullDevice: DeviceWithoutCreatedAt = {
  app_id: 'com.example.app',
  device_id: 'device-abc-123',
  platform: 'android',
  plugin_version: '6.2.0',
  os_version: '14.0',
  version_build: '1.0.0',
  custom_id: 'user-42',
  version_name: '1.2.3',
  is_prod: true,
  is_emulator: false,
  default_channel: 'production',
  key_id: 'key-xyz',
  version: 12345,
  updated_at: '2026-01-01T00:00:00Z',
}

const existingRow = {
  platform: 'android' as const,
  plugin_version: '6.2.0',
  os_version: '14.0',
  version_build: '1.0.0',
  custom_id: 'user-42',
  version_name: '1.2.3',
  is_prod: true,
  is_emulator: false,
  default_channel: 'production',
  key_id: 'key-xyz',
}

const sparseDevice: DeviceWithoutCreatedAt = {
  app_id: 'com.example.app',
  device_id: 'device-abc-123',
  platform: 'ios',
  updated_at: '2026-01-01T00:00:00Z',
}

const sparseExisting = {
  platform: null,
  plugin_version: null,
  os_version: null,
} as const

describe('toComparableDevice', () => {
  test('full device object', async ({ bench }) => {
    await bench('full device object', () => {
      toComparableDevice(fullDevice)
    }).run()
  })

  test('sparse device with defaults', async ({ bench }) => {
    await bench('sparse device with defaults', () => {
      toComparableDevice(sparseDevice)
    }).run()
  })
})

describe('toComparableExisting', () => {
  test('full existing row', async ({ bench }) => {
    await bench('full existing row', () => {
      toComparableExisting(existingRow)
    }).run()
  })

  test('sparse existing row', async ({ bench }) => {
    await bench('sparse existing row', () => {
      toComparableExisting(sparseExisting)
    }).run()
  })

  test('null/undefined existing', async ({ bench }) => {
    await bench('null/undefined existing', () => {
      toComparableExisting(null)
      toComparableExisting(undefined)
    }).run()
  })
})

describe('hasComparableDeviceChanged', () => {
  test('no changes detected', async ({ bench }) => {
    await bench('no changes detected', () => {
      hasComparableDeviceChanged(existingRow, fullDevice)
    }).run()
  })

  test('changes detected (version_name differs)', async ({ bench }) => {
    await bench('changes detected (version_name differs)', () => {
      hasComparableDeviceChanged(existingRow, { ...fullDevice, version_name: '2.0.0' })
    }).run()
  })

  test('sparse existing vs full device', async ({ bench }) => {
    await bench('sparse existing vs full device', () => {
      hasComparableDeviceChanged(sparseExisting, fullDevice)
    }).run()
  })
})

describe('buildNormalizedDeviceForWrite', () => {
  test('full device', async ({ bench }) => {
    await bench('full device', () => {
      buildNormalizedDeviceForWrite(fullDevice)
    }).run()
  })

  test('sparse device', async ({ bench }) => {
    await bench('sparse device', () => {
      buildNormalizedDeviceForWrite(sparseDevice)
    }).run()
  })
})
