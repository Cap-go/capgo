import type { StandardSchema, ValidationIssue } from './ark_validation.ts'
import type { AppInfos, AppStats } from './types.ts'
import { canParse } from '@std/semver'
import { ALLOWED_STATS_ACTIONS } from '../plugins/stats_actions.ts'
import {
  createSchema,
  makeIssue,
} from './ark_validation.ts'
import {
  deviceIdRegex,
  INVALID_STRING_APP_ID,
  INVALID_STRING_DEVICE_ID,
  INVALID_STRING_PLATFORM,
  INVALID_STRING_PLUGIN_VERSION,
  MISSING_STRING_APP_ID,
  MISSING_STRING_DEVICE_ID,
  MISSING_STRING_PLATFORM,
  MISSING_STRING_PLUGIN_VERSION,
  MISSING_STRING_VERSION_BUILD,
  MISSING_STRING_VERSION_NAME,
  MISSING_STRING_VERSION_OS,
  NON_STRING_APP_ID,
  NON_STRING_DEVICE_ID,
  NON_STRING_PLATFORM,
  NON_STRING_VERSION_BUILD,
  NON_STRING_VERSION_NAME,
  NON_STRING_VERSION_OS,
  reverseDomainRegex,
} from './utils.ts'

type UnknownRecord = Record<string, unknown>
type DevicePlatform = 'ios' | 'android' | 'electron'

const DEVICE_PLATFORMS = new Set<DevicePlatform>(['ios', 'android', 'electron'])

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function fieldIssue(path: string, message: string): ValidationIssue {
  return makeIssue(message, [path])
}

function validateRequiredString(
  input: UnknownRecord,
  key: string,
  issues: ValidationIssue[],
  missingMessage: string,
  nonStringMessage: string,
): string | undefined {
  const value = input[key]
  if (value === undefined) {
    issues.push(fieldIssue(key, missingMessage))
    return undefined
  }
  if (typeof value !== 'string') {
    issues.push(fieldIssue(key, nonStringMessage))
    return undefined
  }
  return value
}

function validateRequiredBoolean(input: UnknownRecord, key: string, issues: ValidationIssue[]): boolean | undefined {
  const value = input[key]
  if (typeof value !== 'boolean') {
    issues.push(fieldIssue(key, `${key} must be a boolean`))
    return undefined
  }
  return value
}

function validateOptionalString(input: UnknownRecord, key: string, issues: ValidationIssue[]): string | undefined {
  const value = input[key]
  if (value === undefined) {
    return undefined
  }
  if (typeof value !== 'string') {
    issues.push(fieldIssue(key, `${key} must be a string`))
    return undefined
  }
  return value
}

function validateOptionalStringMaxLength(
  input: UnknownRecord,
  key: string,
  maxLength: number,
  issues: ValidationIssue[],
): string | undefined {
  const value = validateOptionalString(input, key, issues)
  if (value === undefined) {
    return undefined
  }
  if (value.length > maxLength) {
    issues.push(fieldIssue(key, `String must contain at most ${maxLength} character(s)`))
    return undefined
  }
  return value
}

function validateRequiredAppId(input: UnknownRecord, issues: ValidationIssue[]): string | undefined {
  const value = validateRequiredString(input, 'app_id', issues, MISSING_STRING_APP_ID, NON_STRING_APP_ID)
  if (value === undefined) {
    return undefined
  }
  if (!reverseDomainRegex.test(value)) {
    issues.push(fieldIssue('app_id', INVALID_STRING_APP_ID))
    return undefined
  }
  return value
}

function validateRequiredDeviceId(input: UnknownRecord, issues: ValidationIssue[]): string | undefined {
  const value = validateRequiredString(input, 'device_id', issues, MISSING_STRING_DEVICE_ID, NON_STRING_DEVICE_ID)
  if (value === undefined) {
    return undefined
  }
  if (value.length > 36) {
    issues.push(fieldIssue('device_id', 'String must contain at most 36 character(s)'))
    return undefined
  }
  if (!deviceIdRegex.test(value)) {
    issues.push(fieldIssue('device_id', INVALID_STRING_DEVICE_ID))
    return undefined
  }
  return value
}

function validateRequiredVersionName(input: UnknownRecord, issues: ValidationIssue[]): string | undefined {
  return validateRequiredString(input, 'version_name', issues, MISSING_STRING_VERSION_NAME, NON_STRING_VERSION_NAME)
}

function validateRequiredVersionBuild(input: UnknownRecord, issues: ValidationIssue[]): string | undefined {
  return validateRequiredString(input, 'version_build', issues, MISSING_STRING_VERSION_BUILD, NON_STRING_VERSION_BUILD)
}

function validateRequiredVersionOs(input: UnknownRecord, issues: ValidationIssue[]): string | undefined {
  return validateRequiredString(input, 'version_os', issues, MISSING_STRING_VERSION_OS, NON_STRING_VERSION_OS)
}

function validateRequiredPlatformString(input: UnknownRecord, issues: ValidationIssue[]): string | undefined {
  return validateRequiredString(input, 'platform', issues, MISSING_STRING_PLATFORM, NON_STRING_PLATFORM)
}

function validateRequiredDevicePlatform(input: UnknownRecord, issues: ValidationIssue[]): DevicePlatform | undefined {
  const value = input.platform
  if (value === undefined) {
    issues.push(fieldIssue('platform', MISSING_STRING_PLATFORM))
    return undefined
  }
  if (typeof value !== 'string' || !DEVICE_PLATFORMS.has(value as DevicePlatform)) {
    issues.push(fieldIssue('platform', INVALID_STRING_PLATFORM))
    return undefined
  }
  return value as DevicePlatform
}

function validateRequiredPluginVersion(input: UnknownRecord, issues: ValidationIssue[]): string | undefined {
  const value = input.plugin_version
  if (value === undefined) {
    issues.push(fieldIssue('plugin_version', MISSING_STRING_PLUGIN_VERSION))
    return undefined
  }
  if (typeof value !== 'string' || !canParse(value)) {
    issues.push(fieldIssue('plugin_version', INVALID_STRING_PLUGIN_VERSION))
    return undefined
  }
  return value
}

function validateOptionalAction(input: UnknownRecord, issues: ValidationIssue[]): string | undefined {
  const value = input.action
  if (value === undefined) {
    return undefined
  }
  if (typeof value !== 'string') {
    issues.push(fieldIssue('action', 'action must be a string'))
    return undefined
  }
  if (!ALLOWED_STATS_ACTIONS.includes(value as typeof ALLOWED_STATS_ACTIONS[number])) {
    issues.push(fieldIssue('action', `action must be one of: ${ALLOWED_STATS_ACTIONS.join(', ')}`))
    return undefined
  }
  return value
}

function validateBasePluginBooleans(input: UnknownRecord, issues: ValidationIssue[]) {
  validateRequiredBoolean(input, 'is_emulator', issues)
  validateRequiredBoolean(input, 'is_prod', issues)
}

function validateOptionalCommonStrings(input: UnknownRecord, issues: ValidationIssue[]) {
  validateOptionalString(input, 'defaultChannel', issues)
  validateOptionalString(input, 'channel', issues)
  validateOptionalString(input, 'old_version_name', issues)
  validateOptionalString(input, 'version_code', issues)
  validateOptionalString(input, 'plugin_version', issues)
  validateOptionalStringMaxLength(input, 'custom_id', 36, issues)
  validateOptionalStringMaxLength(input, 'key_id', 20, issues)
}

function createPluginSchema<T>(validateFields: (input: UnknownRecord, issues: ValidationIssue[]) => void): StandardSchema<T> {
  return createSchema<T>((value) => {
    if (!isRecord(value)) {
      return { issues: [makeIssue('Expected object')] }
    }

    const issues: ValidationIssue[] = []
    validateFields(value, issues)

    if (issues.length > 0) {
      return { issues }
    }

    return { value: value as T }
  })
}

export function isDevicePlatform(value: unknown): value is DevicePlatform {
  return typeof value === 'string' && DEVICE_PLATFORMS.has(value as DevicePlatform)
}

export const updateRequestSchema = createPluginSchema<AppInfos>((input, issues) => {
  validateRequiredAppId(input, issues)
  validateRequiredDeviceId(input, issues)
  validateRequiredVersionName(input, issues)
  validateRequiredVersionBuild(input, issues)
  validateBasePluginBooleans(input, issues)
  validateRequiredDevicePlatform(input, issues)
  validateRequiredPluginVersion(input, issues)
  validateOptionalString(input, 'defaultChannel', issues)
  validateOptionalStringMaxLength(input, 'key_id', 20, issues)
})

export const statsRequestSchema = createPluginSchema<AppStats>((input, issues) => {
  validateRequiredAppId(input, issues)
  validateRequiredDeviceId(input, issues)
  validateRequiredPlatformString(input, issues)
  validateRequiredVersionName(input, issues)
  validateRequiredVersionOs(input, issues)
  validateBasePluginBooleans(input, issues)
  validateOptionalCommonStrings(input, issues)
  validateOptionalAction(input, issues)
  validateOptionalString(input, 'version_build', issues)
})

export const channelSelfRequestSchema = createPluginSchema<AppInfos>((input, issues) => {
  validateRequiredAppId(input, issues)
  validateRequiredDeviceId(input, issues)
  validateRequiredVersionName(input, issues)
  validateRequiredVersionBuild(input, issues)
  validateBasePluginBooleans(input, issues)
  validateRequiredDevicePlatform(input, issues)
  validateOptionalString(input, 'defaultChannel', issues)
  validateOptionalString(input, 'channel', issues)
  validateOptionalString(input, 'plugin_version', issues)
  validateOptionalStringMaxLength(input, 'key_id', 20, issues)
})

export const channelSelfGetRequestSchema = createPluginSchema<{
  app_id: string
  is_emulator: boolean
  is_prod: boolean
  platform: DevicePlatform
  key_id?: string
}>((input, issues) => {
  validateRequiredAppId(input, issues)
  validateBasePluginBooleans(input, issues)
  validateRequiredDevicePlatform(input, issues)
  validateOptionalStringMaxLength(input, 'key_id', 20, issues)
})
