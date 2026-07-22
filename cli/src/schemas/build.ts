import { type } from './arktype'
import { optionsBaseSchema } from './base'

const localizedReleaseNotesSchema = type({ '[string]': 'string' }).pipe((data, ctx) => {
  const out: Record<string, string> = {}
  for (const [rawKey, rawValue] of Object.entries(data)) {
    const key = rawKey.trim()
    const value = rawValue.trim()
    if (!key) {
      return ctx.reject('a non-empty locale key')
    }
    if (!value) {
      return ctx.reject('a non-empty release note')
    }
    out[key] = value
  }
  return out
})

// ============================================================================
// Build Credentials Schema
// ============================================================================

export const buildCredentialsSchema = type({
  'BUILD_CERTIFICATE_BASE64?': 'string',
  'BUILD_PROVISION_PROFILE_BASE64?': 'string',
  'P12_PASSWORD?': 'string',
  'APPLE_KEY_ID?': 'string',
  'APPLE_ISSUER_ID?': 'string',
  'APPLE_KEY_CONTENT?': 'string',
  'APP_STORE_CONNECT_TEAM_ID?': 'string',
  'FASTLANE_USER?': 'string',
  'FASTLANE_APPLE_APPLICATION_SPECIFIC_PASSWORD?': 'string',
  'APPLE_APP_ID?': 'string',
  'CAPGO_IOS_PROVISIONING_MAP?': 'string',
  'CAPGO_STORE_SUBMIT_REVIEW?': 'string',
  'CAPGO_STORE_RELEASE_NAME?': 'string',
  'CAPGO_STORE_RELEASE_NOTES?': 'string',
  'CAPGO_STORE_RELEASE_NOTES_LOCALIZED?': 'string',
  'CAPGO_IOS_TESTFLIGHT_GROUPS?': 'string',
  'CAPGO_IOS_AUTOMATIC_RELEASE?': 'string',
  'ANDROID_KEYSTORE_FILE?': 'string',
  'KEYSTORE_KEY_ALIAS?': 'string',
  'KEYSTORE_KEY_PASSWORD?': 'string',
  'KEYSTORE_STORE_PASSWORD?': 'string',
  'PLAY_CONFIG_JSON?': 'string',
  'PLAY_STORE_IN_APP_UPDATE_PRIORITY?': 'string',
  '[string]': 'string | undefined',
})

export type BuildCredentials = typeof buildCredentialsSchema.infer

// ============================================================================
// Build Request Options Schema
// ============================================================================

export const buildRequestOptionsSchema = type({
  '...': optionsBaseSchema,
  '+': 'delete',
  'path?': 'string',
  'nodeModules?': 'string',
  'platform?': "'ios' | 'android'",
  'buildMode?': "'debug' | 'release'",
  'userId?': 'string',
  'buildCertificateBase64?': 'string',
  'p12Password?': 'string',
  'appleKeyId?': 'string',
  'appleIssuerId?': 'string',
  'appleKeyContent?': 'string',
  'appStoreConnectTeamId?': 'string',
  'appleId?': 'string',
  'appleAppSpecificPassword?': 'string',
  'appleAppId?': 'string',
  'iosScheme?': 'string',
  'iosTarget?': 'string',
  'iosDistribution?': "'app_store' | 'ad_hoc'",
  'iosProvisioningProfile?': 'string[]',
  'iosProvisioningMap?': 'string',
  'androidKeystoreFile?': 'string',
  'keystoreKeyAlias?': 'string',
  'keystoreKeyPassword?': 'string',
  'keystoreStorePassword?': 'string',
  'playConfigJson?': 'string',
  'androidFlavor?': 'string > 0',
  'inAppUpdatePriority?': '0 <= number.integer <= 5 | string.numeric.parse |> 0 <= number.integer <= 5',
  'storeReleaseNotesLocale?': 'string > 0[]',
  'iosAutomaticRelease?': 'boolean',
  'outputUpload?': 'boolean',
  'outputRetention?': 'string',
  'outputRecord?': 'string',
  'skipBuildNumberBump?': 'boolean',
  'skipMarketingVersionBump?': 'boolean',
  'syncIosVersion?': 'boolean',
  'playstoreUpload?': 'boolean',
  'submitToStoreReview?': 'boolean',
  'storeReleaseName?': 'string > 0',
  'storeReleaseNotes?': 'string > 0',
  'storeReleaseNotesLocalized?': localizedReleaseNotesSchema,
  'iosTestflightGroups?': 'string > 0',
  'verbose?': 'boolean',
  'aiAnalytics?': 'boolean',
  'sendLogsToSupport?': 'boolean',
  'sendLogs?': 'boolean',
  'aiAnalysisMode?': "'auto-prompt' | 'caller-handled' | 'skip'",
  'prescan?': 'boolean',
  'prescanIgnoreFatal?': 'boolean',
  'failOnWarnings?': 'boolean',
  'builderJourneyId?': 'string',
})

export type BuildRequestOptions = typeof buildRequestOptionsSchema.infer

export const buildNeededOptionsSchema = type({
  '...': optionsBaseSchema,
  '+': 'delete',
  'channel?': 'string',
  'packageJson?': 'string',
  'nodeModules?': 'string',
  'verbose?': 'boolean',
})

export type BuildNeededOptions = typeof buildNeededOptionsSchema.infer

// ============================================================================
// Build Response Schemas
// ============================================================================

export const buildRequestResultSchema = type({
  '+': 'delete',
  success: 'boolean',
  'jobId?': 'string',
  'uploadUrl?': 'string',
  'status?': 'string',
  'error?': 'string',
  'aiAnalysis?': {
    '+': 'delete',
    jobId: 'string',
    capturedLogPath: 'string',
    ready: 'boolean',
  },
})

export type BuildRequestResult = typeof buildRequestResultSchema.infer

// ============================================================================
// Build Options Payload Schema (sent to server as buildOptions)
// ============================================================================

export const buildOptionsPayloadSchema = type({
  '+': 'delete',
  platform: "'ios' | 'android'",
  buildMode: "'debug' | 'release'",
  cliVersion: 'string',
  'iosScheme?': 'string',
  'iosTarget?': 'string',
  'iosDistribution?': "'app_store' | 'ad_hoc'",
  'iosSourceDir?': 'string',
  'iosAppDir?': 'string',
  'iosProjectDir?': 'string',
  'storeReleaseNotesLocalized?': localizedReleaseNotesSchema,
  'iosAutomaticRelease?': 'boolean',
  'androidSourceDir?': 'string',
  'androidAppDir?': 'string',
  'androidProjectDir?': 'string',
  'androidFlavor?': 'string > 0',
  outputUploadEnabled: 'boolean',
  outputRetentionSeconds: 'number',
  skipBuildNumberBump: 'boolean',
  skipMarketingVersionBump: 'boolean',
  submitToStoreReview: 'boolean',
  'storeReleaseName?': 'string',
  'storeReleaseNotes?': 'string',
  'iosTestflightGroups?': 'string',
})

export type BuildOptionsPayload = typeof buildOptionsPayloadSchema.infer

// ============================================================================
// Credential File Schemas
// ============================================================================

export const credentialFileSchema = type({
  '+': 'delete',
  'BUILD_CERTIFICATE_FILE?': 'string',
  'APPLE_KEY_FILE?': 'string',
  'ANDROID_KEYSTORE_PATH?': 'string',
  'PLAY_CONFIG_JSON_PATH?': 'string',
})

export type CredentialFile = typeof credentialFileSchema.infer

export const savedCredentialsSchema = type({
  '+': 'delete',
  'ios?': buildCredentialsSchema.partial(),
  'android?': buildCredentialsSchema.partial(),
})

export type SavedCredentials = typeof savedCredentialsSchema.infer

export const allCredentialsSchema = type({ '[string]': savedCredentialsSchema })

export type AllCredentials = typeof allCredentialsSchema.infer
