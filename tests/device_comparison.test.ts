import type { DeviceExistingRowLike } from '../supabase/functions/_backend/utils/deviceComparison.ts'
import type { DeviceWithoutCreatedAt } from '../supabase/functions/_backend/utils/types.ts'
import { describe, expect, it } from 'vitest'
import {
  buildNormalizedDeviceForWrite,
  hasComparableDeviceChanged,
  nullableString as normalizeOptionalString,
  toComparableDevice,
  toComparableExisting,
} from '../supabase/functions/_backend/utils/deviceComparison.ts'

// Helper to simulate D1 storage behavior
// This matches what cloudflare.ts writes to D1
function simulateD1Storage(device: DeviceWithoutCreatedAt): DeviceExistingRowLike {
  const comparable = toComparableDevice(device)

  // Write the comparable values directly - defaults are already applied in toComparableDevice()
  return {
    platform: comparable.platform,
    plugin_version: comparable.plugin_version,
    os_version: comparable.os_version,
    version_build: comparable.version_build,
    custom_id: comparable.custom_id, // Already has '' default from toComparableDevice()
    version_name: comparable.version_name, // Already has 'unknown' default from toComparableDevice()
    is_prod: comparable.is_prod ? 1 : 0,
    is_emulator: comparable.is_emulator ? 1 : 0,
    default_channel: comparable.default_channel,
    key_id: comparable.key_id,
  }
}

describe('deviceComparison utilities', () => {
  describe('normalizeOptionalString', () => {
    it('should normalize undefined to null', () => {
      expect(normalizeOptionalString(undefined)).toBe(null)
    })

    it('should normalize null to null', () => {
      expect(normalizeOptionalString(null)).toBe(null)
    })

    it('should normalize empty string to null', () => {
      expect(normalizeOptionalString('')).toBe(null)
    })

    it('should keep non-empty strings', () => {
      expect(normalizeOptionalString('test')).toBe('test')
    })

    it('should keep whitespace-only strings', () => {
      expect(normalizeOptionalString('  ')).toBe('  ')
    })
  })

  describe('toComparableDevice', () => {
    it('should convert a device with all fields', () => {
      const device: DeviceWithoutCreatedAt = {
        device_id: 'test-device',
        app_id: 'test-app',
        platform: 'android',
        plugin_version: '1.0.0',
        os_version: '14',
        version_build: '100',
        custom_id: 'custom-123',
        version_name: 'v1.0.0',
        is_prod: true,
        is_emulator: false,
        default_channel: 'production',
      }

      const comparable = toComparableDevice(device)

      expect(comparable).toEqual({
        platform: 'android',
        plugin_version: '1.0.0',
        os_version: '14',
        version_build: '100',
        custom_id: 'custom-123',
        version_name: 'v1.0.0',
        is_prod: true,
        is_emulator: false,
        default_channel: 'production',
        key_id: null,
      })
    })

    it('should normalize empty strings and apply D1 defaults', () => {
      const device: DeviceWithoutCreatedAt = {
        device_id: 'test-device',
        app_id: 'test-app',
        platform: 'ios',
        plugin_version: '',
        os_version: '',
        version_build: '',
        custom_id: '',
        version_name: '',
        is_prod: false,
        is_emulator: false,
        default_channel: '',
      }

      const comparable = toComparableDevice(device)

      expect(comparable).toEqual({
        platform: 'ios',
        plugin_version: '', // D1 NOT NULL
        os_version: '', // D1 NOT NULL
        version_build: 'builtin', // D1 DEFAULT 'builtin'
        custom_id: '', // D1 DEFAULT '' NOT NULL
        version_name: null, // D1 NULLABLE
        is_prod: false,
        is_emulator: false,
        default_channel: null, // D1 NULLABLE
        key_id: null,
      })
    })

    it('should handle undefined/null fields and apply D1 defaults', () => {
      const device = {
        device_id: 'test-device',
        app_id: 'test-app',
        updated_at: new Date().toISOString(),
        platform: null,
        plugin_version: undefined,
        os_version: null,
        version_build: undefined,
        custom_id: null,
        version_name: undefined,
        is_prod: undefined,
        is_emulator: undefined,
        default_channel: null,
      } as unknown as DeviceWithoutCreatedAt

      const comparable = toComparableDevice(device)

      expect(comparable).toEqual({
        platform: null,
        plugin_version: '', // D1 NOT NULL
        os_version: '', // D1 NOT NULL
        version_build: 'builtin', // D1 DEFAULT 'builtin'
        custom_id: '', // D1 DEFAULT '' NOT NULL
        version_name: null, // D1 NULLABLE
        is_prod: false,
        is_emulator: false,
        default_channel: null, // D1 NULLABLE
        key_id: null,
      })
    })
  })

  describe('toComparableExisting', () => {
    it('should convert existing device with all fields', () => {
      const existing: DeviceExistingRowLike = {
        platform: 'android',
        plugin_version: '1.0.0',
        os_version: '14',
        version_build: '100',
        custom_id: 'custom-123',
        version_name: 'v1.0.0',
        is_prod: true,
        is_emulator: false,
        default_channel: 'production',
      }

      const comparable = toComparableExisting(existing)

      expect(comparable).toEqual({
        platform: 'android',
        plugin_version: '1.0.0',
        os_version: '14',
        version_build: '100',
        custom_id: 'custom-123',
        version_name: 'v1.0.0',
        is_prod: true,
        is_emulator: false,
        default_channel: 'production',
        key_id: null,
      })
    })

    it('should handle numeric is_prod and is_emulator (database format)', () => {
      const existing: DeviceExistingRowLike = {
        platform: 'ios',
        is_prod: 1,
        is_emulator: 0,
      }

      const comparable = toComparableExisting(existing)

      expect(comparable.is_prod).toBe(true)
      expect(comparable.is_emulator).toBe(false)
    })

    it('should handle null/undefined for booleans', () => {
      const existing: DeviceExistingRowLike = {
        platform: 'android',
        is_prod: null,
        is_emulator: undefined,
      }

      const comparable = toComparableExisting(existing)

      expect(comparable.is_prod).toBe(false)
      expect(comparable.is_emulator).toBe(false)
    })

    it('should handle null existing device with D1 defaults', () => {
      const comparable = toComparableExisting(null)

      expect(comparable).toEqual({
        platform: null,
        plugin_version: '', // D1 NOT NULL
        os_version: '', // D1 NOT NULL
        version_build: 'builtin', // D1 DEFAULT 'builtin'
        custom_id: '', // D1 DEFAULT '' NOT NULL
        version_name: null, // D1 NULLABLE
        is_prod: false,
        is_emulator: false,
        default_channel: null, // D1 NULLABLE
        key_id: null,
      })
    })

    it('should handle undefined existing device with D1 defaults', () => {
      const comparable = toComparableExisting(undefined)

      expect(comparable).toEqual({
        platform: null,
        plugin_version: '', // D1 NOT NULL
        os_version: '', // D1 NOT NULL
        version_build: 'builtin', // D1 DEFAULT 'builtin'
        custom_id: '', // D1 DEFAULT '' NOT NULL
        version_name: null, // D1 NULLABLE
        is_prod: false,
        is_emulator: false,
        default_channel: null, // D1 NULLABLE
        key_id: null,
      })
    })
  })

  describe('hasComparableDeviceChanged', () => {
    it('should return false when devices are identical', () => {
      const existing: DeviceExistingRowLike = {
        platform: 'android',
        plugin_version: '1.0.0',
        os_version: '14',
        version_build: '100',
        custom_id: 'custom-123',
        version_name: 'v1.0.0',
        is_prod: true,
        is_emulator: false,
        default_channel: 'production',
      }

      const device: DeviceWithoutCreatedAt = {
        device_id: 'test-device',
        app_id: 'test-app',
        platform: 'android',
        plugin_version: '1.0.0',
        os_version: '14',
        version_build: '100',
        custom_id: 'custom-123',
        version_name: 'v1.0.0',
        is_prod: true,
        is_emulator: false,
        default_channel: 'production',
      }

      expect(hasComparableDeviceChanged(existing, device)).toBe(false)
    })

    it('should return true when plugin_version changes', () => {
      const existing: DeviceExistingRowLike = {
        platform: 'android',
        plugin_version: '1.0.0',
        is_prod: false,
        is_emulator: false,
      }

      const device: DeviceWithoutCreatedAt = {
        device_id: 'test-device',
        app_id: 'test-app',
        platform: 'android',
        plugin_version: '2.0.0',
        is_prod: false,
        is_emulator: false,
      }

      expect(hasComparableDeviceChanged(existing, device)).toBe(true)
    })

    it('should return true when os_version changes', () => {
      const existing: DeviceExistingRowLike = {
        platform: 'ios',
        os_version: '16.0',
        is_prod: false,
        is_emulator: false,
      }

      const device: DeviceWithoutCreatedAt = {
        device_id: 'test-device',
        app_id: 'test-app',
        platform: 'ios',
        os_version: '17.0',
        is_prod: false,
        is_emulator: false,
      }

      expect(hasComparableDeviceChanged(existing, device)).toBe(true)
    })

    it('should return true when is_prod changes', () => {
      const existing: DeviceExistingRowLike = {
        platform: 'android',
        is_prod: false,
        is_emulator: false,
      }

      const device: DeviceWithoutCreatedAt = {
        device_id: 'test-device',
        app_id: 'test-app',
        platform: 'android',
        is_prod: true,
        is_emulator: false,
      }

      expect(hasComparableDeviceChanged(existing, device)).toBe(true)
    })

    it('should return true when is_emulator changes', () => {
      const existing: DeviceExistingRowLike = {
        platform: 'android',
        is_prod: false,
        is_emulator: false,
      }

      const device: DeviceWithoutCreatedAt = {
        device_id: 'test-device',
        app_id: 'test-app',
        platform: 'android',
        is_prod: false,
        is_emulator: true,
      }

      expect(hasComparableDeviceChanged(existing, device)).toBe(true)
    })

    it('should handle numeric boolean conversion from database', () => {
      const existing: DeviceExistingRowLike = {
        platform: 'android',
        is_prod: 1, // Database numeric boolean
        is_emulator: 0,
      }

      const device: DeviceWithoutCreatedAt = {
        device_id: 'test-device',
        app_id: 'test-app',
        platform: 'android',
        is_prod: true, // JavaScript boolean
        is_emulator: false,
      }

      expect(hasComparableDeviceChanged(existing, device)).toBe(false)
    })

    it('should return false when empty string equals null', () => {
      const existing: DeviceExistingRowLike = {
        platform: 'android',
        plugin_version: '',
        is_prod: false,
        is_emulator: false,
      }

      const device: DeviceWithoutCreatedAt = {
        device_id: 'test-device',
        app_id: 'test-app',
        platform: 'android',
        plugin_version: null,
        is_prod: false,
        is_emulator: false,
      }

      expect(hasComparableDeviceChanged(existing, device)).toBe(false)
    })

    it('should return false when undefined equals null', () => {
      const existing: DeviceExistingRowLike = {
        platform: 'android',
        plugin_version: undefined,
        is_prod: false,
        is_emulator: false,
      }

      const device: DeviceWithoutCreatedAt = {
        device_id: 'test-device',
        app_id: 'test-app',
        platform: 'android',
        plugin_version: null,
        is_prod: false,
        is_emulator: false,
      }

      expect(hasComparableDeviceChanged(existing, device)).toBe(false)
    })

    it('should handle null existing device (new device)', () => {
      const device: DeviceWithoutCreatedAt = {
        device_id: 'test-device',
        app_id: 'test-app',
        platform: 'android',
        plugin_version: '1.0.0',
        is_prod: false,
        is_emulator: false,
      }

      // Should return true because plugin_version is different (null vs '1.0.0')
      expect(hasComparableDeviceChanged(null, device)).toBe(true)
    })

    it('should handle default_channel changes', () => {
      const existing: DeviceExistingRowLike = {
        platform: 'android',
        default_channel: 'production',
        is_prod: false,
        is_emulator: false,
      }

      const device: DeviceWithoutCreatedAt = {
        device_id: 'test-device',
        app_id: 'test-app',
        platform: 'android',
        default_channel: 'development',
        is_prod: false,
        is_emulator: false,
      }

      expect(hasComparableDeviceChanged(existing, device)).toBe(true)
    })

    it('should handle custom_id changes', () => {
      const existing: DeviceExistingRowLike = {
        platform: 'android',
        custom_id: 'old-custom',
        is_prod: false,
        is_emulator: false,
      }

      const device: DeviceWithoutCreatedAt = {
        device_id: 'test-device',
        app_id: 'test-app',
        platform: 'android',
        custom_id: 'new-custom',
        is_prod: false,
        is_emulator: false,
      }

      expect(hasComparableDeviceChanged(existing, device)).toBe(true)
    })

    it('should handle platform changes', () => {
      const existing: DeviceExistingRowLike = {
        platform: 'android',
        is_prod: false,
        is_emulator: false,
      }

      const device: DeviceWithoutCreatedAt = {
        device_id: 'test-device',
        app_id: 'test-app',
        platform: 'ios',
        is_prod: false,
        is_emulator: false,
      }

      expect(hasComparableDeviceChanged(existing, device)).toBe(true)
    })

    it('should handle version_build changes', () => {
      const existing: DeviceExistingRowLike = {
        platform: 'android',
        version_build: '100',
        is_prod: false,
        is_emulator: false,
      }

      const device: DeviceWithoutCreatedAt = {
        device_id: 'test-device',
        app_id: 'test-app',
        platform: 'android',
        version_build: '101',
        is_prod: false,
        is_emulator: false,
      }

      expect(hasComparableDeviceChanged(existing, device)).toBe(true)
    })

    it('should handle version_name changes', () => {
      const existing: DeviceExistingRowLike = {
        platform: 'android',
        version_name: 'v1.0.0',
        is_prod: false,
        is_emulator: false,
      }

      const device: DeviceWithoutCreatedAt = {
        device_id: 'test-device',
        app_id: 'test-app',
        platform: 'android',
        version_name: 'v2.0.0',
        is_prod: false,
        is_emulator: false,
      }

      expect(hasComparableDeviceChanged(existing, device)).toBe(true)
    })

    it('should handle edge case: all fields null/undefined/empty', () => {
      const existing: DeviceExistingRowLike = {
        platform: null,
        plugin_version: null,
        os_version: undefined,
        version_build: '',
        custom_id: null,
        version_name: undefined,
        is_prod: null,
        is_emulator: undefined,
        default_channel: '',
      }

      const device = {
        device_id: 'test-device',
        app_id: 'test-app',
        updated_at: new Date().toISOString(),
        platform: undefined,
        plugin_version: undefined,
        os_version: null,
        version_build: null,
        custom_id: '',
        version_name: '',
        is_prod: undefined,
        is_emulator: null,
        default_channel: null,
      } as unknown as DeviceWithoutCreatedAt

      expect(hasComparableDeviceChanged(existing, device)).toBe(false)
    })
  })

  describe('buildNormalizedDeviceForWrite', () => {
    it('should build normalized device with all fields', () => {
      const device: DeviceWithoutCreatedAt = {
        device_id: 'test-device',
        app_id: 'test-app',
        platform: 'android',
        plugin_version: '1.0.0',
        os_version: '14',
        version_build: '100',
        custom_id: 'custom-123',
        version_name: 'v1.0.0',
        is_prod: true,
        is_emulator: false,
        default_channel: 'production',
      }

      const normalized = buildNormalizedDeviceForWrite(device)

      expect(normalized).toEqual({
        version_name: 'v1.0.0',
        platform: 'android',
        plugin_version: '1.0.0',
        os_version: '14',
        version_build: '100',
        custom_id: 'custom-123',
        is_prod: true,
        is_emulator: false,
        key_id: null,
      })
    })

    it('should normalize empty strings and apply D1 defaults', () => {
      const device: DeviceWithoutCreatedAt = {
        device_id: 'test-device',
        app_id: 'test-app',
        platform: 'ios',
        plugin_version: '',
        os_version: '',
        version_build: '',
        custom_id: '',
        version_name: '',
        is_prod: false,
        is_emulator: false,
      }

      const normalized = buildNormalizedDeviceForWrite(device)

      expect(normalized).toEqual({
        version_name: null, // D1 NULLABLE
        platform: 'ios',
        plugin_version: '', // D1 NOT NULL
        os_version: '', // D1 NOT NULL
        version_build: 'builtin', // D1 DEFAULT 'builtin'
        custom_id: '', // D1 DEFAULT '' NOT NULL
        is_prod: false,
        is_emulator: false,
        key_id: null,
      })
    })

    it('should not include default_channel in write data', () => {
      const device: DeviceWithoutCreatedAt = {
        device_id: 'test-device',
        app_id: 'test-app',
        platform: 'android',
        default_channel: 'production',
        is_prod: false,
        is_emulator: false,
      }

      const normalized = buildNormalizedDeviceForWrite(device)

      expect(normalized).not.toHaveProperty('default_channel')
    })

    it('should not include device_id and app_id in write data', () => {
      const device: DeviceWithoutCreatedAt = {
        device_id: 'test-device',
        app_id: 'test-app',
        platform: 'android',
        is_prod: false,
        is_emulator: false,
      }

      const normalized = buildNormalizedDeviceForWrite(device)

      expect(normalized).not.toHaveProperty('device_id')
      expect(normalized).not.toHaveProperty('app_id')
    })
  })

  describe('d1 write/read cycle simulation - real world scenarios', () => {
    it('should NOT detect change after D1 write/read cycle with null values', () => {
      // Initial device from client with null/undefined values
      const deviceFromClient: DeviceWithoutCreatedAt = {
        device_id: 'test-device-1',
        app_id: 'test-app',
        platform: 'android',
        plugin_version: '1.0.0',
        os_version: null, // Client sends null
        version_build: null,
        custom_id: undefined, // Client doesn't send
        version_name: 'v1.0.0',
        is_prod: true,
        is_emulator: false,
        default_channel: undefined, // Client doesn't send
      }

      // Simulate what D1 stores (based on cloudflare.ts lines 167-181)
      const storedInD1 = simulateD1Storage(deviceFromClient)

      // Next request: same device from client
      const deviceFromClientAgain: DeviceWithoutCreatedAt = {
        device_id: 'test-device-1',
        app_id: 'test-app',
        platform: 'android',
        plugin_version: '1.0.0',
        os_version: null,
        version_build: null,
        custom_id: undefined,
        version_name: 'v1.0.0',
        is_prod: true,
        is_emulator: false,
        default_channel: undefined,
      }

      // This should be FALSE (no change) to avoid unnecessary writes
      const changed = hasComparableDeviceChanged(storedInD1, deviceFromClientAgain)
      expect(changed).toBe(false)
    })

    it('should NOT detect change when custom_id is empty string vs undefined', () => {
      const deviceFromClient: DeviceWithoutCreatedAt = {
        device_id: 'test-device-2',
        app_id: 'test-app',
        platform: 'android',
        custom_id: '', // Empty string
        is_prod: false,
        is_emulator: false,
      }

      const storedInD1 = simulateD1Storage(deviceFromClient)

      // Next request with undefined
      const deviceAgain: DeviceWithoutCreatedAt = {
        device_id: 'test-device-2',
        app_id: 'test-app',
        platform: 'android',
        custom_id: undefined,
        is_prod: false,
        is_emulator: false,
      }

      expect(hasComparableDeviceChanged(storedInD1, deviceAgain)).toBe(false)
    })

    it('should NOT detect change with typical production device payload', () => {
      // Typical real-world device payload from Capacitor plugin
      const typicalDevice: DeviceWithoutCreatedAt = {
        device_id: '12345-abcde',
        app_id: 'com.example.app',
        platform: 'ios',
        plugin_version: '6.3.3',
        os_version: '17.5.1',
        version_build: '1.0.0',
        custom_id: '',
        version_name: '1.0.0',
        is_prod: true,
        is_emulator: false,
        default_channel: 'production',
      }

      const storedInD1 = simulateD1Storage(typicalDevice)

      // Same device on next update check
      const sameDeviceAgain: DeviceWithoutCreatedAt = {
        device_id: '12345-abcde',
        app_id: 'com.example.app',
        platform: 'ios',
        plugin_version: '6.3.3',
        os_version: '17.5.1',
        version_build: '1.0.0',
        custom_id: '',
        version_name: '1.0.0',
        is_prod: true,
        is_emulator: false,
        default_channel: 'production',
      }

      expect(hasComparableDeviceChanged(storedInD1, sameDeviceAgain)).toBe(false)
    })

    it('should DETECT change when plugin_version actually changes', () => {
      const device: DeviceWithoutCreatedAt = {
        device_id: 'test-device',
        app_id: 'test-app',
        platform: 'android',
        plugin_version: '6.0.0',
        is_prod: true,
        is_emulator: false,
      }

      const storedInD1 = simulateD1Storage(device)

      // Plugin updated
      const updatedDevice: DeviceWithoutCreatedAt = {
        device_id: 'test-device',
        app_id: 'test-app',
        platform: 'android',
        plugin_version: '6.1.0', // Changed!
        is_prod: true,
        is_emulator: false,
      }

      expect(hasComparableDeviceChanged(storedInD1, updatedDevice)).toBe(true)
    })

    it('should DETECT change when os_version changes', () => {
      const device: DeviceWithoutCreatedAt = {
        device_id: 'test-device',
        app_id: 'test-app',
        platform: 'ios',
        os_version: '17.0',
        is_prod: true,
        is_emulator: false,
      }

      const storedInD1 = simulateD1Storage(device)

      // OS updated
      const updatedDevice: DeviceWithoutCreatedAt = {
        device_id: 'test-device',
        app_id: 'test-app',
        platform: 'ios',
        os_version: '17.5', // Changed!
        is_prod: true,
        is_emulator: false,
      }

      expect(hasComparableDeviceChanged(storedInD1, updatedDevice)).toBe(true)
    })

    it('should DETECT change when switching from prod to dev', () => {
      const device: DeviceWithoutCreatedAt = {
        device_id: 'test-device',
        app_id: 'test-app',
        platform: 'android',
        is_prod: true,
        is_emulator: false,
      }

      const storedInD1 = simulateD1Storage(device)

      // Switched to dev build
      const devDevice: DeviceWithoutCreatedAt = {
        device_id: 'test-device',
        app_id: 'test-app',
        platform: 'android',
        is_prod: false, // Changed!
        is_emulator: false,
      }

      expect(hasComparableDeviceChanged(storedInD1, devDevice)).toBe(true)
    })

    it('should expose bug: default_channel empty string vs null causes false positive', () => {
      // This test exposes the bug in cloudflare.ts line 180
      const device: DeviceWithoutCreatedAt = {
        device_id: 'test-device',
        app_id: 'test-app',
        platform: 'android',
        plugin_version: '1.0.0',
        is_prod: true,
        is_emulator: false,
        default_channel: '', // Empty string from client
      }

      const storedInD1 = simulateD1Storage(device)
      // D1 stores: default_channel = '' (from device.default_channel ?? null)

      // Next request: undefined
      const deviceAgain: DeviceWithoutCreatedAt = {
        device_id: 'test-device',
        app_id: 'test-app',
        platform: 'android',
        plugin_version: '1.0.0',
        is_prod: true,
        is_emulator: false,
        default_channel: undefined, // undefined from client
      }

      // What gets stored: undefined ?? null = null
      // But D1 has '' from first write
      // Comparison: toComparableExisting('') = null, toComparableDevice(undefined) = null
      // Should be FALSE (no change)

      const changed = hasComparableDeviceChanged(storedInD1, deviceAgain)

      // BUG: This might be TRUE because:
      // storedInD1.default_channel = '' (from device.default_channel ?? null when device had '')
      // But when compared, both normalize to null, so should be false
      expect(changed).toBe(false)
    })
  })

  describe('key_id field tests', () => {
    describe('device tracking with key_id present', () => {
      it('should include key_id in comparable device', () => {
        const device: DeviceWithoutCreatedAt = {
          device_id: 'test-device',
          app_id: 'test-app',
          platform: 'android',
          plugin_version: '1.0.0',
          is_prod: true,
          is_emulator: false,
          key_id: 'encryption-key-123',
        }

        const comparable = toComparableDevice(device)

        expect(comparable.key_id).toBe('encryption-key-123')
      })

      it('should include key_id in normalized device for write', () => {
        const device: DeviceWithoutCreatedAt = {
          device_id: 'test-device',
          app_id: 'test-app',
          platform: 'android',
          plugin_version: '1.0.0',
          is_prod: true,
          is_emulator: false,
          key_id: 'encryption-key-456',
        }

        const normalized = buildNormalizedDeviceForWrite(device)

        expect(normalized.key_id).toBe('encryption-key-456')
      })

      it('should track devices with key_id correctly', () => {
        const device: DeviceWithoutCreatedAt = {
          device_id: 'device-with-key',
          app_id: 'test-app',
          platform: 'ios',
          plugin_version: '2.0.0',
          os_version: '17.0',
          version_build: '200',
          custom_id: 'custom-abc',
          version_name: 'v2.0.0',
          is_prod: true,
          is_emulator: false,
          default_channel: 'production',
          key_id: 'my-encryption-key',
        }

        const comparable = toComparableDevice(device)

        expect(comparable).toEqual({
          platform: 'ios',
          plugin_version: '2.0.0',
          os_version: '17.0',
          version_build: '200',
          custom_id: 'custom-abc',
          version_name: 'v2.0.0',
          is_prod: true,
          is_emulator: false,
          default_channel: 'production',
          key_id: 'my-encryption-key',
        })
      })
    })

    describe('device tracking with key_id null/missing (backward compatibility)', () => {
      it('should handle null key_id', () => {
        const device: DeviceWithoutCreatedAt = {
          device_id: 'test-device',
          app_id: 'test-app',
          platform: 'android',
          plugin_version: '1.0.0',
          is_prod: true,
          is_emulator: false,
          key_id: null,
        }

        const comparable = toComparableDevice(device)

        expect(comparable.key_id).toBe(null)
      })

      it('should handle undefined key_id', () => {
        const device: DeviceWithoutCreatedAt = {
          device_id: 'test-device',
          app_id: 'test-app',
          platform: 'android',
          plugin_version: '1.0.0',
          is_prod: true,
          is_emulator: false,
          key_id: undefined,
        }

        const comparable = toComparableDevice(device)

        expect(comparable.key_id).toBe(null)
      })

      it('should handle empty string key_id', () => {
        const device: DeviceWithoutCreatedAt = {
          device_id: 'test-device',
          app_id: 'test-app',
          platform: 'android',
          plugin_version: '1.0.0',
          is_prod: true,
          is_emulator: false,
          key_id: '',
        }

        const comparable = toComparableDevice(device)

        expect(comparable.key_id).toBe(null)
      })

      it('should handle missing key_id field (backward compatibility)', () => {
        const device = {
          device_id: 'test-device',
          app_id: 'test-app',
          platform: 'android',
          plugin_version: '1.0.0',
          is_prod: true,
          is_emulator: false,
          // key_id is not present at all
        } as DeviceWithoutCreatedAt

        const comparable = toComparableDevice(device)

        expect(comparable.key_id).toBe(null)
      })

      it('should normalize device for write with null key_id', () => {
        const device: DeviceWithoutCreatedAt = {
          device_id: 'test-device',
          app_id: 'test-app',
          platform: 'android',
          plugin_version: '1.0.0',
          is_prod: true,
          is_emulator: false,
          key_id: null,
        }

        const normalized = buildNormalizedDeviceForWrite(device)

        expect(normalized.key_id).toBe(null)
      })
    })

    describe('device change detection includes key_id changes', () => {
      it('should detect change when key_id is added', () => {
        const existing: DeviceExistingRowLike = {
          platform: 'android',
          plugin_version: '1.0.0',
          is_prod: false,
          is_emulator: false,
          key_id: null,
        }

        const device: DeviceWithoutCreatedAt = {
          device_id: 'test-device',
          app_id: 'test-app',
          platform: 'android',
          plugin_version: '1.0.0',
          is_prod: false,
          is_emulator: false,
          key_id: 'new-encryption-key',
        }

        expect(hasComparableDeviceChanged(existing, device)).toBe(true)
      })

      it('should detect change when key_id is removed', () => {
        const existing: DeviceExistingRowLike = {
          platform: 'android',
          plugin_version: '1.0.0',
          is_prod: false,
          is_emulator: false,
          key_id: 'old-encryption-key',
        }

        const device: DeviceWithoutCreatedAt = {
          device_id: 'test-device',
          app_id: 'test-app',
          platform: 'android',
          plugin_version: '1.0.0',
          is_prod: false,
          is_emulator: false,
          key_id: null,
        }

        expect(hasComparableDeviceChanged(existing, device)).toBe(true)
      })

      it('should detect change when key_id value changes', () => {
        const existing: DeviceExistingRowLike = {
          platform: 'android',
          plugin_version: '1.0.0',
          is_prod: false,
          is_emulator: false,
          key_id: 'key-version-1',
        }

        const device: DeviceWithoutCreatedAt = {
          device_id: 'test-device',
          app_id: 'test-app',
          platform: 'android',
          plugin_version: '1.0.0',
          is_prod: false,
          is_emulator: false,
          key_id: 'key-version-2',
        }

        expect(hasComparableDeviceChanged(existing, device)).toBe(true)
      })

      it('should NOT detect change when key_id remains the same', () => {
        const existing: DeviceExistingRowLike = {
          platform: 'android',
          plugin_version: '1.0.0',
          is_prod: false,
          is_emulator: false,
          key_id: 'same-key',
        }

        const device: DeviceWithoutCreatedAt = {
          device_id: 'test-device',
          app_id: 'test-app',
          platform: 'android',
          plugin_version: '1.0.0',
          is_prod: false,
          is_emulator: false,
          key_id: 'same-key',
        }

        expect(hasComparableDeviceChanged(existing, device)).toBe(false)
      })

      it('should NOT detect change when key_id is null in both', () => {
        const existing: DeviceExistingRowLike = {
          platform: 'android',
          plugin_version: '1.0.0',
          is_prod: false,
          is_emulator: false,
          key_id: null,
        }

        const device: DeviceWithoutCreatedAt = {
          device_id: 'test-device',
          app_id: 'test-app',
          platform: 'android',
          plugin_version: '1.0.0',
          is_prod: false,
          is_emulator: false,
          key_id: null,
        }

        expect(hasComparableDeviceChanged(existing, device)).toBe(false)
      })

      it('should handle key_id normalization (empty string vs null)', () => {
        const existing: DeviceExistingRowLike = {
          platform: 'android',
          plugin_version: '1.0.0',
          is_prod: false,
          is_emulator: false,
          key_id: '', // Empty string
        }

        const device: DeviceWithoutCreatedAt = {
          device_id: 'test-device',
          app_id: 'test-app',
          platform: 'android',
          plugin_version: '1.0.0',
          is_prod: false,
          is_emulator: false,
          key_id: null, // null
        }

        // Both normalize to null, so no change
        expect(hasComparableDeviceChanged(existing, device)).toBe(false)
      })

      it('should handle key_id normalization (undefined vs null)', () => {
        const existing: DeviceExistingRowLike = {
          platform: 'android',
          plugin_version: '1.0.0',
          is_prod: false,
          is_emulator: false,
          key_id: undefined, // undefined
        }

        const device: DeviceWithoutCreatedAt = {
          device_id: 'test-device',
          app_id: 'test-app',
          platform: 'android',
          plugin_version: '1.0.0',
          is_prod: false,
          is_emulator: false,
          key_id: null, // null
        }

        // Both normalize to null, so no change
        expect(hasComparableDeviceChanged(existing, device)).toBe(false)
      })
    })

    describe('D1 write/read cycle simulation with key_id', () => {
      it('should NOT detect change after D1 write/read cycle with key_id', () => {
        const deviceFromClient: DeviceWithoutCreatedAt = {
          device_id: 'test-device-key',
          app_id: 'test-app',
          platform: 'android',
          plugin_version: '1.0.0',
          os_version: '14',
          version_build: '100',
          custom_id: 'custom-123',
          version_name: 'v1.0.0',
          is_prod: true,
          is_emulator: false,
          default_channel: 'production',
          key_id: 'my-encryption-key',
        }

        // Simulate D1 storage
        const storedInD1 = simulateD1Storage(deviceFromClient)

        // Next request: same device
        const deviceFromClientAgain: DeviceWithoutCreatedAt = {
          device_id: 'test-device-key',
          app_id: 'test-app',
          platform: 'android',
          plugin_version: '1.0.0',
          os_version: '14',
          version_build: '100',
          custom_id: 'custom-123',
          version_name: 'v1.0.0',
          is_prod: true,
          is_emulator: false,
          default_channel: 'production',
          key_id: 'my-encryption-key',
        }

        const changed = hasComparableDeviceChanged(storedInD1, deviceFromClientAgain)
        expect(changed).toBe(false)
      })

      it('should NOT detect change when key_id transitions from null to empty string', () => {
        const deviceFromClient: DeviceWithoutCreatedAt = {
          device_id: 'test-device',
          app_id: 'test-app',
          platform: 'android',
          plugin_version: '1.0.0',
          is_prod: true,
          is_emulator: false,
          key_id: null,
        }

        const storedInD1 = simulateD1Storage(deviceFromClient)

        // Next request with empty string
        const deviceAgain: DeviceWithoutCreatedAt = {
          device_id: 'test-device',
          app_id: 'test-app',
          platform: 'android',
          plugin_version: '1.0.0',
          is_prod: true,
          is_emulator: false,
          key_id: '',
        }

        expect(hasComparableDeviceChanged(storedInD1, deviceAgain)).toBe(false)
      })

      it('should NOT detect change when key_id transitions from undefined to null', () => {
        const deviceFromClient: DeviceWithoutCreatedAt = {
          device_id: 'test-device',
          app_id: 'test-app',
          platform: 'android',
          plugin_version: '1.0.0',
          is_prod: true,
          is_emulator: false,
          key_id: undefined,
        }

        const storedInD1 = simulateD1Storage(deviceFromClient)

        // Next request with null
        const deviceAgain: DeviceWithoutCreatedAt = {
          device_id: 'test-device',
          app_id: 'test-app',
          platform: 'android',
          plugin_version: '1.0.0',
          is_prod: true,
          is_emulator: false,
          key_id: null,
        }

        expect(hasComparableDeviceChanged(storedInD1, deviceAgain)).toBe(false)
      })

      it('should DETECT change when key_id rotates', () => {
        const deviceFromClient: DeviceWithoutCreatedAt = {
          device_id: 'test-device',
          app_id: 'test-app',
          platform: 'android',
          plugin_version: '1.0.0',
          is_prod: true,
          is_emulator: false,
          key_id: 'encryption-key-v1',
        }

        const storedInD1 = simulateD1Storage(deviceFromClient)

        // Key rotation happens
        const deviceAfterRotation: DeviceWithoutCreatedAt = {
          device_id: 'test-device',
          app_id: 'test-app',
          platform: 'android',
          plugin_version: '1.0.0',
          is_prod: true,
          is_emulator: false,
          key_id: 'encryption-key-v2',
        }

        expect(hasComparableDeviceChanged(storedInD1, deviceAfterRotation)).toBe(true)
      })

      it('should handle typical production device with key_id', () => {
        const typicalDevice: DeviceWithoutCreatedAt = {
          device_id: '12345-abcde',
          app_id: 'com.example.app',
          platform: 'ios',
          plugin_version: '6.3.3',
          os_version: '17.5.1',
          version_build: '1.0.0',
          custom_id: '',
          version_name: '1.0.0',
          is_prod: true,
          is_emulator: false,
          default_channel: 'production',
          key_id: 'prod-encryption-key',
        }

        const storedInD1 = simulateD1Storage(typicalDevice)

        // Same device on next update check
        const sameDeviceAgain: DeviceWithoutCreatedAt = {
          device_id: '12345-abcde',
          app_id: 'com.example.app',
          platform: 'ios',
          plugin_version: '6.3.3',
          os_version: '17.5.1',
          version_build: '1.0.0',
          custom_id: '',
          version_name: '1.0.0',
          is_prod: true,
          is_emulator: false,
          default_channel: 'production',
          key_id: 'prod-encryption-key',
        }

        expect(hasComparableDeviceChanged(storedInD1, sameDeviceAgain)).toBe(false)
      })
    })

    describe('toComparableExisting with key_id', () => {
      it('should handle existing device with key_id', () => {
        const existing: DeviceExistingRowLike = {
          platform: 'android',
          plugin_version: '1.0.0',
          os_version: '14',
          version_build: '100',
          custom_id: 'custom-123',
          version_name: 'v1.0.0',
          is_prod: true,
          is_emulator: false,
          default_channel: 'production',
          key_id: 'test-key-id',
        }

        const comparable = toComparableExisting(existing)

        expect(comparable.key_id).toBe('test-key-id')
      })

      it('should handle null existing device with key_id field', () => {
        const comparable = toComparableExisting(null)

        expect(comparable.key_id).toBe(null)
      })

      it('should handle undefined existing device with key_id field', () => {
        const comparable = toComparableExisting(undefined)

        expect(comparable.key_id).toBe(null)
      })

      it('should normalize empty string key_id to null', () => {
        const existing: DeviceExistingRowLike = {
          platform: 'android',
          key_id: '',
        }

        const comparable = toComparableExisting(existing)

        expect(comparable.key_id).toBe(null)
      })

      it('should normalize undefined key_id to null', () => {
        const existing: DeviceExistingRowLike = {
          platform: 'android',
          key_id: undefined,
        }

        const comparable = toComparableExisting(existing)

        expect(comparable.key_id).toBe(null)
      })
    })

    it('should handle D1 NOT NULL constraints correctly', () => {
      // D1 requires plugin_version, os_version, default_channel as NOT NULL
      const device: DeviceWithoutCreatedAt = {
        device_id: 'test-device',
        app_id: 'test-app',
        platform: 'android',
        plugin_version: null,
        os_version: null,
        default_channel: null,
        is_prod: true,
        is_emulator: false,
      }

      const storedInD1 = simulateD1Storage(device)

      // D1 schema: plugin_version & os_version are NOT NULL → ''
      // D1 schema: default_channel is NULLABLE → null
      expect(storedInD1.plugin_version).toBe('')
      expect(storedInD1.os_version).toBe('')
      expect(storedInD1.default_channel).toBe(null)
    })

    it('should handle typical update check scenario without false positives', () => {
      // Device makes 100 update checks with same info
      const device: DeviceWithoutCreatedAt = {
        device_id: 'frequent-checker',
        app_id: 'test-app',
        platform: 'android',
        plugin_version: '6.3.3',
        os_version: '14',
        version_build: '1.0.0',
        custom_id: '',
        version_name: '1.0.0',
        is_prod: true,
        is_emulator: false,
        default_channel: 'production',
      }

      // First write
      const storedInD1 = simulateD1Storage(device)

      // Next 99 requests should NOT trigger writes
      for (let i = 0; i < 99; i++) {
        const sameDevice: DeviceWithoutCreatedAt = {
          device_id: 'frequent-checker',
          app_id: 'test-app',
          platform: 'android',
          plugin_version: '6.3.3',
          os_version: '14',
          version_build: '1.0.0',
          custom_id: '',
          version_name: '1.0.0',
          is_prod: true,
          is_emulator: false,
          default_channel: 'production',
        }

        const changed = hasComparableDeviceChanged(storedInD1, sameDevice)
        expect(changed).toBe(false) // Should NEVER trigger write
      }
    })
  })
})
