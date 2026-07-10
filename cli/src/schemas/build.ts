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
  // iOS app-specific password upload (alternative to the App Store Connect API key;
  // used by migrated Ionic Appflow apps). fastlane reads FASTLANE_USER and
  // FASTLANE_APPLE_APPLICATION_SPECIFIC_PASSWORD from the env automatically;
  // APPLE_APP_ID is the app's numeric App Store Connect id (required for this path).
  FASTLANE_USER: z.string().optional(),
  FASTLANE_APPLE_APPLICATION_SPECIFIC_PASSWORD: z.string().optional(),
  APPLE_APP_ID: z.string().optional(),
  CAPGO_IOS_PROVISIONING_MAP: z.string().optional(),
  // Non-secret per-build store submission options. They can be supplied from
  // env for CI, then split into buildOptions before the request reaches Builder.
  CAPGO_STORE_SUBMIT_REVIEW: z.string().optional(),
  CAPGO_STORE_RELEASE_NAME: z.string().optional(),
  CAPGO_STORE_RELEASE_NOTES: z.string().optional(),
  CAPGO_STORE_RELEASE_NOTES_LOCALIZED: z.string().optional(),
  CAPGO_IOS_TESTFLIGHT_GROUPS: z.string().optional(),
  CAPGO_IOS_AUTOMATIC_RELEASE: z.string().optional(),
  // Android credentials
  ANDROID_KEYSTORE_FILE: z.string().optional(),
  KEYSTORE_KEY_ALIAS: z.string().optional(),
  KEYSTORE_KEY_PASSWORD: z.string().optional(),
  KEYSTORE_STORE_PASSWORD: z.string().optional(),
  PLAY_CONFIG_JSON: z.string().optional(),
  // Stored as a string-encoded integer in the 0–5 range; the CLI flag (inAppUpdatePriority)
  // enforces the numeric range, this field holds the env-var-style serialized form.
  PLAY_STORE_IN_APP_UPDATE_PRIORITY: z.string().optional(),
}).catchall(z.string().optional())

export type BuildCredentials = z.infer<typeof buildCredentialsSchema>

// ============================================================================
// Build Request Options Schema
// ============================================================================

export const buildRequestOptionsSchema = optionsBaseSchema.extend({
  path: z.string().optional(),
  nodeModules: z.string().optional(),
  platform: z.enum(['ios', 'android']).optional(),
  buildMode: z.enum(['debug', 'release']).optional(),
  userId: z.string().optional(),
  // iOS credential options (flattened)
  buildCertificateBase64: z.string().optional(),
  p12Password: z.string().optional(),
  appleKeyId: z.string().optional(),
  appleIssuerId: z.string().optional(),
  appleKeyContent: z.string().optional(),
  appStoreConnectTeamId: z.string().optional(),
  // iOS app-specific password upload (alternative to the App Store Connect API key)
  appleId: z.string().optional(),
  appleAppSpecificPassword: z.string().optional(),
  appleAppId: z.string().optional(),
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
  inAppUpdatePriority: z.coerce.number().int().min(0).max(5).optional(),
  // Output control
  storeReleaseNotesLocale: z.array(z.string().trim().min(1)).optional(),
  iosAutomaticRelease: z.boolean().optional(),
  outputUpload: z.boolean().optional(),
  outputRetention: z.string().optional(),
  outputRecord: z.string().optional(),
  skipBuildNumberBump: z.boolean().optional(),
  skipMarketingVersionBump: z.boolean().optional(),
  syncIosVersion: z.boolean().optional(),
  playstoreUpload: z.boolean().optional(),
  submitToStoreReview: z.boolean().optional(),
  storeReleaseName: z.string().trim().min(1).optional(),
  storeReleaseNotes: z.string().trim().min(1).optional(),
  storeReleaseNotesLocalized: z.record(z.string().trim().min(1), z.string().trim().min(1)).optional(),
  iosTestflightGroups: z.string().trim().min(1).optional(),
  verbose: z.boolean().optional(),
  aiAnalytics: z.boolean().optional(),
  // On a CI/CD (non-interactive) build failure, upload the captured build logs
  // to Capgo support via uploadSupportLogs. Additive to aiAnalytics — both can
  // be passed and both run. Requires log capture, which this flag also enables.
  // Derived from --send-logs-to-support (primary) or --send-logs (deprecated alias).
  sendLogsToSupport: z.boolean().optional(),
  // Deprecated alias for sendLogsToSupport, kept so the original --send-logs flag
  // (shipped in 8.16.0) keeps parsing. Callers honor either field.
  sendLogs: z.boolean().optional(),
  // Controls the on-failure AI-analysis flow inside requestBuildInternal:
  //   - 'auto-prompt' (default) — current behavior: clack-driven menu when
  //     interactive, decideAnalyzeBehavior matrix in CI.
  //   - 'caller-handled'        — skip the clack block entirely and surface
  //     `aiAnalysis` on the result so the caller (e.g. the Ink onboarding
  //     wizard) drives the UX. The captured log file is preserved so the
  //     caller can read it before calling `releaseCapturedLogs`.
  //   - 'skip'                  — skip the AI block entirely; normal cleanup
  //     runs (log file deleted on exit).
  aiAnalysisMode: z.enum(['auto-prompt', 'caller-handled', 'skip']).optional(),
  // Prescan gate (see src/build/prescan/). `prescan: false` (--no-prescan) skips the
  // automatic pre-build scan; `prescanIgnoreFatal` reports but never blocks;
  // `failOnWarnings` treats prescan warnings as fatal.
  prescan: z.boolean().optional(),
  prescanIgnoreFatal: z.boolean().optional(),
  failOnWarnings: z.boolean().optional(),
  // Correlation id for the Builder onboarding journey, set ONLY when the build
  // is requested from the onboarding wizard. Threaded onto the `Build requested`
  // / `Build succeeded` / `Build failed` events so the journey's funnel reaches
  // all the way to the build outcome. Absent for the standalone `build request`
  // command (no journey).
  builderJourneyId: z.string().optional(),
})

export type BuildRequestOptions = z.infer<typeof buildRequestOptionsSchema>

export const buildNeededOptionsSchema = optionsBaseSchema.extend({
  channel: z.string().optional(),
  packageJson: z.string().optional(),
  nodeModules: z.string().optional(),
  verbose: z.boolean().optional(),
})

export type BuildNeededOptions = z.infer<typeof buildNeededOptionsSchema>

// ============================================================================
// Build Response Schemas
// ============================================================================

export const buildRequestResultSchema = z.object({
  success: z.boolean(),
  jobId: z.string().optional(),
  uploadUrl: z.string().optional(),
  status: z.string().optional(),
  error: z.string().optional(),
  // Populated only when `aiAnalysisMode === 'caller-handled'` AND the build
  // failed AND log capture was active. `ready: true` means the captured log
  // file is on disk at `capturedLogPath` and a caller can run `runCapgoAiAnalysis`
  // immediately. Callers must invoke `releaseCapturedLogs(jobId)` when they're
  // done viewing the analysis (or chose to skip) so the file gets cleaned up.
  aiAnalysis: z.object({
    jobId: z.string(),
    capturedLogPath: z.string(),
    ready: z.boolean(),
  }).optional(),
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
  storeReleaseNotesLocalized: z.record(z.string().trim().min(1), z.string().trim().min(1)).optional(),
  iosAutomaticRelease: z.boolean().optional(),
  androidSourceDir: z.string().optional(),
  androidAppDir: z.string().optional(),
  androidProjectDir: z.string().optional(),
  androidFlavor: z.string().trim().min(1).optional(),
  outputUploadEnabled: z.boolean(),
  outputRetentionSeconds: z.number(),
  skipBuildNumberBump: z.boolean(),
  skipMarketingVersionBump: z.boolean(),
  submitToStoreReview: z.boolean(),
  storeReleaseName: z.string().optional(),
  storeReleaseNotes: z.string().optional(),
  iosTestflightGroups: z.string().optional(),
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
