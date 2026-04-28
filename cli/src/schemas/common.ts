import { z } from 'zod'

// ============================================================================
// Shared Regex Validators
// ============================================================================

export const regexSemver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-z-][0-9a-z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-z-][0-9a-z-]*))*))?(?:\+([0-9a-z-]+(?:\.[0-9a-z-]+)*))?$/i

export const reverseDomainRegex = /^[a-z0-9]+(\.[\w-]+)+$/i

// ============================================================================
// Native Package Schema
// ============================================================================

export const nativePackageSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  ios_checksum: z.string().optional(),
  android_checksum: z.string().optional(),
})

export type NativePackage = z.infer<typeof nativePackageSchema>

// ============================================================================
// Compatibility Schemas
// ============================================================================

export const incompatibilityReasonSchema = z.enum([
  'new_plugin',
  'removed_plugin',
  'version_mismatch',
  'ios_code_changed',
  'android_code_changed',
  'both_platforms_changed',
])

export type IncompatibilityReason = z.infer<typeof incompatibilityReasonSchema>

export const compatibilitySchema = z.object({
  name: z.string(),
  localVersion: z.string().optional(),
  remoteVersion: z.string().optional(),
  localIosChecksum: z.string().optional(),
  remoteIosChecksum: z.string().optional(),
  localAndroidChecksum: z.string().optional(),
  remoteAndroidChecksum: z.string().optional(),
})

export type Compatibility = z.infer<typeof compatibilitySchema>

export const compatibilityDetailsSchema = z.object({
  compatible: z.boolean(),
  reasons: z.array(incompatibilityReasonSchema),
  message: z.string(),
})

export type CompatibilityDetails = z.infer<typeof compatibilityDetailsSchema>

// ============================================================================
// Upload URLs Schema
// ============================================================================

export const uploadUrlsSchema = z.object({
  path: z.string(),
  hash: z.string(),
  uploadLink: z.string(),
  finalPath: z.string(),
})

export type uploadUrlsType = z.infer<typeof uploadUrlsSchema>

// ============================================================================
// Security Policy Error Schema
// ============================================================================

export const parsedSecurityErrorSchema = z.object({
  isSecurityPolicyError: z.boolean(),
  errorCode: z.string(),
  message: z.string(),
})

export type ParsedSecurityError = z.infer<typeof parsedSecurityErrorSchema>
