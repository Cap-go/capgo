import type { DeviceWithoutCreatedAt } from './types.ts'

const normalizeOptionalString = (value: string | null | undefined) => (value === undefined || value === null || value === '' ? null : value)

export interface DeviceComparable {
  // version: number | null
  platform: DeviceWithoutCreatedAt['platform'] | null
  plugin_version: string | null
  os_version: string | null
  version_build: string | null
  custom_id: string | null
  version_name: string | null
  is_prod: boolean
  is_emulator: boolean
  default_channel: string | null
}

export type DeviceExistingRowLike = {
  // version?: number | null
  platform?: DeviceWithoutCreatedAt['platform'] | null
  plugin_version?: string | null
  os_version?: string | null
  version_build?: string | null
  custom_id?: string | null
  version_name?: string | null
  is_prod?: boolean | number | null
  is_emulator?: boolean | number | null
  default_channel?: string | null
} | null | undefined

export function toComparableDevice(device: DeviceWithoutCreatedAt): DeviceComparable {
  return {
    // version: device.version ?? null,
    platform: device.platform ?? null,
    plugin_version: normalizeOptionalString(device.plugin_version),
    os_version: normalizeOptionalString(device.os_version),
    version_build: normalizeOptionalString(device.version_build),
    custom_id: normalizeOptionalString(device.custom_id),
    version_name: normalizeOptionalString(device.version_name),
    is_prod: device.is_prod ?? false,
    is_emulator: device.is_emulator ?? false,
    default_channel: normalizeOptionalString(device.default_channel),
  }
}

export function toComparableExisting(existing: DeviceExistingRowLike): DeviceComparable {
  return {
    // version: existing?.version ?? null,
    platform: existing?.platform ?? null,
    plugin_version: normalizeOptionalString(existing?.plugin_version as string | null | undefined),
    os_version: normalizeOptionalString(existing?.os_version as string | null | undefined),
    version_build: normalizeOptionalString(existing?.version_build as string | null | undefined),
    custom_id: normalizeOptionalString(existing?.custom_id as string | null | undefined),
    version_name: normalizeOptionalString(existing?.version_name as string | null | undefined),
    is_prod: existing?.is_prod === undefined || existing?.is_prod === null ? false : Boolean(existing.is_prod),
    is_emulator: existing?.is_emulator === undefined || existing?.is_emulator === null ? false : Boolean(existing.is_emulator),
    default_channel: normalizeOptionalString(existing?.default_channel as string | null | undefined),
  }
}

export function hasComparableDeviceChanged(existing: DeviceExistingRowLike, device: DeviceWithoutCreatedAt) {
  const comparableExisting = toComparableExisting(existing)
  const comparableDevice = toComparableDevice(device)

  return Object.entries(comparableDevice).some(([key, value]) => comparableExisting[key as keyof DeviceComparable] !== value)
}

export function buildNormalizedDeviceForWrite(device: DeviceWithoutCreatedAt) {
  const comparableDevice = toComparableDevice(device)

  return {
    // version: comparableDevice.version,
    version_name: comparableDevice.version_name,
    platform: comparableDevice.platform,
    plugin_version: comparableDevice.plugin_version,
    os_version: comparableDevice.os_version,
    version_build: comparableDevice.version_build,
    custom_id: comparableDevice.custom_id,
    is_prod: comparableDevice.is_prod,
    is_emulator: comparableDevice.is_emulator,
  }
}

export { normalizeOptionalString as nullableString }
