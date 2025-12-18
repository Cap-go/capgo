import type { DeviceWithoutCreatedAt } from './types.ts'
import { cloudlog } from './logging.ts'

const normalizeOptionalString = (value: string | null | undefined) => (value === undefined || value === null || value === '' ? null : value)

export interface DeviceComparable {
  // version: number | null
  platform: DeviceWithoutCreatedAt['platform'] | null
  plugin_version: string // D1 schema: NOT NULL
  os_version: string // D1 schema: NOT NULL
  version_build: string // D1 schema: DEFAULT 'builtin'
  custom_id: string // D1 schema: DEFAULT '' NOT NULL
  version_name: string | null // D1 schema: text (NULLABLE)
  is_prod: boolean
  is_emulator: boolean
  default_channel: string | null // D1 schema: TEXT (NULLABLE)
  key_id: string | null
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
  key_id?: string | null
} | null | undefined

export function toComparableDevice(device: DeviceWithoutCreatedAt): DeviceComparable {
  // Apply D1 schema defaults/constraints to ensure consistency between writes and comparisons
  // D1 schema has NOT NULL constraints on many fields that require handling
  const normalizedVersionName = normalizeOptionalString(device.version_name)
  const normalizedCustomId = normalizeOptionalString(device.custom_id)
  const normalizedPluginVersion = normalizeOptionalString(device.plugin_version)
  const normalizedOsVersion = normalizeOptionalString(device.os_version)
  const normalizedDefaultChannel = normalizeOptionalString(device.default_channel)
  const normalizedVersionBuild = normalizeOptionalString(device.version_build)
  const normalizedKeyId = normalizeOptionalString(device.key_id)

  return {
    // version: device.version ?? null,
    platform: device.platform ?? null,
    // D1 schema: plugin_version NOT NULL (no default, must provide empty string)
    plugin_version: normalizedPluginVersion ?? '',
    // D1 schema: os_version NOT NULL (no default, must provide empty string)
    os_version: normalizedOsVersion ?? '',
    // D1 schema: version_build DEFAULT 'builtin' (nullable)
    version_build: normalizedVersionBuild ?? 'builtin',
    // D1 schema: custom_id DEFAULT '' NOT NULL
    custom_id: normalizedCustomId ?? '',
    // D1 schema: version_name text (NULLABLE - allows NULL!)
    version_name: normalizedVersionName,
    is_prod: device.is_prod ?? false,
    is_emulator: device.is_emulator ?? false,
    // D1 schema: default_channel TEXT (NULLABLE - allows NULL!)
    default_channel: normalizedDefaultChannel,
    key_id: normalizedKeyId,
  }
}

export function toComparableExisting(existing: DeviceExistingRowLike): DeviceComparable {
  // Apply D1 schema defaults/constraints to ensure consistency
  const normalizedVersionName = normalizeOptionalString(existing?.version_name as string | null | undefined)
  const normalizedCustomId = normalizeOptionalString(existing?.custom_id as string | null | undefined)
  const normalizedPluginVersion = normalizeOptionalString(existing?.plugin_version as string | null | undefined)
  const normalizedOsVersion = normalizeOptionalString(existing?.os_version as string | null | undefined)
  const normalizedDefaultChannel = normalizeOptionalString(existing?.default_channel as string | null | undefined)
  const normalizedVersionBuild = normalizeOptionalString(existing?.version_build as string | null | undefined)
  const normalizedKeyId = normalizeOptionalString(existing?.key_id as string | null | undefined)

  return {
    // version: existing?.version ?? null,
    platform: existing?.platform ?? null,
    // D1 schema: plugin_version NOT NULL (no default, must provide empty string)
    plugin_version: normalizedPluginVersion ?? '',
    // D1 schema: os_version NOT NULL (no default, must provide empty string)
    os_version: normalizedOsVersion ?? '',
    // D1 schema: version_build DEFAULT 'builtin' (nullable)
    version_build: normalizedVersionBuild ?? 'builtin',
    // D1 schema: custom_id DEFAULT '' NOT NULL
    custom_id: normalizedCustomId ?? '',
    // D1 schema: version_name text (NULLABLE - allows NULL!)
    version_name: normalizedVersionName,
    is_prod: existing?.is_prod === undefined || existing?.is_prod === null ? false : Boolean(existing.is_prod),
    is_emulator: existing?.is_emulator === undefined || existing?.is_emulator === null ? false : Boolean(existing.is_emulator),
    // D1 schema: default_channel TEXT (NULLABLE - allows NULL!)
    default_channel: normalizedDefaultChannel,
    key_id: normalizedKeyId,
  }
}

export function hasComparableDeviceChanged(existing: DeviceExistingRowLike, device: DeviceWithoutCreatedAt) {
  const comparableExisting = toComparableExisting(existing)
  const comparableDevice = toComparableDevice(device)

  // DEBUG: Log the comparison details
  const changed = Object.entries(comparableDevice).some(([key, value]) => {
    const existingValue = comparableExisting[key as keyof DeviceComparable]
    const hasChanged = existingValue !== value

    if (hasChanged) {
      cloudlog({
        message: `[DEVICE_COMPARISON] Field "${key}" changed:`,
        context: {
          existing: existingValue,
          new: value,
          existingType: typeof existingValue,
          newType: typeof value,
          device_id: device.device_id,
          app_id: device.app_id,
        },
      })
    }

    return hasChanged
  })

  if (!changed) {
    cloudlog(`[DEVICE_COMPARISON] No changes detected for device ${device.device_id}`)
  }
  else {
    cloudlog({
      message: `[DEVICE_COMPARISON] Changes detected for device ${device.device_id}`,
      context: {
        comparableExisting,
        comparableDevice,
      },
    })
  }

  return changed
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
    key_id: comparableDevice.key_id,
  }
}

export { normalizeOptionalString as nullableString }
