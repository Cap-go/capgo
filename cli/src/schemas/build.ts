import { z } from 'zod'
import { optionsBaseSchema } from './base'

// ============================================================================
// Build Credentials Schema
// ============================================================================

export const buildCredentialsSchema = z.object({
  // iOS credentials
  BUILD_CERTIFICATE_BASE64: z.string().optional(),
  BUILD_PROVISION_PROFILE_BASE64: z.string().optional(), // Legacy: kept for migration detection
  P12_PASSWORD: z.string().optional(),
  APPLE_KEY_ID: z.string().optional(),
  APPLE_ISSUER_ID: z.string().optional(),
  APPLE_KEY_CONTENT: z.string().optional(),
  APP_STORE_CONNECT_TEAM_ID: z.string().optional(),
  CAPGO_IOS_PROVISIONING_MAP: z.string().optional(),
  // Android credentials
  ANDROID_KEYSTORE_FILE: z.string().optional(),
  KEYSTORE_KEY_ALIAS: z.string().optional(),
  KEYSTORE_KEY_PASSWORD: z.string().optional(),
  KEYSTORE_STORE_PASSWORD: z.string().optional(),
  PLAY_CONFIG_JSON: z.string().optional(),
}).catchall(z.string().optional())

export type BuildCredentials = z.infer<typeof buildCredentialsSchema>

// ============================================================================
// Build Request Options Schema
// ============================================================================

export const buildRequestOptionsSchema = optionsBaseSchema.extend({
  path: z.string().optional(),
  platform: z.enum(['ios', 'android']),
  buildMode: z.enum(['debug', 'release']).optional(),
  userId: z.string().optional(),
  // iOS credential options (flattened)
  buildCertificateBase64: z.string().optional(),
  p12Password: z.string().optional(),
  appleKeyId: z.string().optional(),
  appleIssuerId: z.string().optional(),
  appleKeyContent: z.string().optional(),
  appStoreConnectTeamId: z.string().optional(),
  iosScheme: z.string().optional(),
  iosTarget: z.string().optional(),
  iosDistribution: z.enum(['app_store', 'ad_hoc']).optional(),
  iosProvisioningProfile: z.array(z.string()).optional(),
  iosProvisioningMap: z.string().optional(), // Pre-serialized CAPGO_IOS_PROVISIONING_MAP JSON (SDK use)
  // Android credential options (flattened)
  androidKeystoreFile: z.string().optional(),
  keystoreKeyAlias: z.string().optional(),
  keystoreKeyPassword: z.string().optional(),
  keystoreStorePassword: z.string().optional(),
  playConfigJson: z.string().optional(),
  androidFlavor: z.string().trim().min(1).optional(),
  // Output control
  outputUpload: z.boolean().optional(),
  outputRetention: z.string().optional(),
  skipBuildNumberBump: z.boolean().optional(),
  playstoreUpload: z.boolean().optional(),
  verbose: z.boolean().optional(),
})

export type BuildRequestOptions = z.infer<typeof buildRequestOptionsSchema>

// ============================================================================
// Build Response Schemas
// ============================================================================

export const buildRequestResponseSchema = z.object({
  jobId: z.string(),
  folder: z.string(),
  status: z.enum(['queued', 'reserved']),
  artifactKey: z.string(),
  uploadUrl: z.string(),
  machine: z.object({
    id: z.string(),
    ip: z.string(),
  }).catchall(z.unknown()).nullable().optional(),
})

export type BuildRequestResponse = z.infer<typeof buildRequestResponseSchema>

export const buildRequestResultSchema = z.object({
  success: z.boolean(),
  jobId: z.string().optional(),
  uploadUrl: z.string().optional(),
  status: z.string().optional(),
  error: z.string().optional(),
})

export type BuildRequestResult = z.infer<typeof buildRequestResultSchema>

// ============================================================================
// Build Options Payload Schema (sent to server as buildOptions)
// ============================================================================

export const buildOptionsPayloadSchema = z.object({
  platform: z.enum(['ios', 'android']),
  buildMode: z.enum(['debug', 'release']),
  cliVersion: z.string(),
  iosScheme: z.string().optional(),
  iosTarget: z.string().optional(),
  iosDistribution: z.enum(['app_store', 'ad_hoc']).optional(),
  iosSourceDir: z.string().optional(),
  iosAppDir: z.string().optional(),
  iosProjectDir: z.string().optional(),
  androidSourceDir: z.string().optional(),
  androidAppDir: z.string().optional(),
  androidProjectDir: z.string().optional(),
  androidFlavor: z.string().trim().min(1).optional(),
  outputUploadEnabled: z.boolean(),
  outputRetentionSeconds: z.number(),
  skipBuildNumberBump: z.boolean(),
})

export type BuildOptionsPayload = z.infer<typeof buildOptionsPayloadSchema>

// ============================================================================
// Credential File Schemas
// ============================================================================

export const credentialFileSchema = z.object({
  // iOS file paths
  BUILD_CERTIFICATE_FILE: z.string().optional(),
  APPLE_KEY_FILE: z.string().optional(),
  // Android file paths
  ANDROID_KEYSTORE_PATH: z.string().optional(),
  PLAY_CONFIG_JSON_PATH: z.string().optional(),
})

export type CredentialFile = z.infer<typeof credentialFileSchema>

export const savedCredentialsSchema = z.object({
  ios: buildCredentialsSchema.partial().optional(),
  android: buildCredentialsSchema.partial().optional(),
})

export type SavedCredentials = z.infer<typeof savedCredentialsSchema>

export const allCredentialsSchema = z.record(z.string(), savedCredentialsSchema)

export type AllCredentials = z.infer<typeof allCredentialsSchema>
