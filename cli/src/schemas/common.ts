import { type } from './arktype'

// ============================================================================
// Shared Validation Helpers
// ============================================================================

export function rejectConflictingBooleanGroup(
  data: Record<string, unknown>,
  ctx: { reject: (config: { expected: string, path?: PropertyKey[] }) => unknown },
  keys: string[],
): boolean {
  const selected = keys.filter(key => data[key] === true)
  if (selected.length < 2)
    return true

  const first = String(selected[0])
  for (const key of selected.slice(1)) {
    ctx.reject({
      expected: `not used together with "${first}"`,
      path: [key],
    })
  }
  return false
}

// ============================================================================
// Native Package Schema
// ============================================================================

export const nativePackageSchema = type({
  '+': 'delete',
  name: 'string > 0',
  version: 'string > 0',
  'requested_version?': 'string',
  'ios_checksum?': 'string',
  'android_checksum?': 'string',
})

export type NativePackage = typeof nativePackageSchema.infer

// ============================================================================
// Compatibility Schemas
// ============================================================================

export const incompatibilityReasonSchema = type("'new_plugin' | 'removed_plugin' | 'version_mismatch' | 'requested_version_changed' | 'ios_code_changed' | 'android_code_changed' | 'both_platforms_changed'")

export type IncompatibilityReason = typeof incompatibilityReasonSchema.infer

export const compatibilitySchema = type({
  '+': 'delete',
  name: 'string',
  'localVersion?': 'string',
  'remoteVersion?': 'string',
  'localRequestedVersion?': 'string',
  'remoteRequestedVersion?': 'string',
  'localIosChecksum?': 'string',
  'remoteIosChecksum?': 'string',
  'localAndroidChecksum?': 'string',
  'remoteAndroidChecksum?': 'string',
})

export type Compatibility = typeof compatibilitySchema.infer

export const compatibilityDetailsSchema = type({
  '+': 'delete',
  compatible: 'boolean',
  reasons: incompatibilityReasonSchema.array(),
  message: 'string',
})

export type CompatibilityDetails = typeof compatibilityDetailsSchema.infer

// ============================================================================
// Security Policy Error Schema
// ============================================================================

export const parsedSecurityErrorSchema = type({
  '+': 'delete',
  isSecurityPolicyError: 'boolean',
  errorCode: 'string',
  message: 'string',
})

export type ParsedSecurityError = typeof parsedSecurityErrorSchema.infer
