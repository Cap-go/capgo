import { type } from './arktype'
import { buildCredentialsSchema } from './build'
import { rejectConflictingBooleanGroup } from './common'

export const capacitorConfigOptionSchema = type('string > 0').describe('Capacitor config source to update')

// ============================================================================
// SDK Result Schema
// ============================================================================

// Note: SDKResult<T> is generic and kept as interface for generic parameter support
export interface SDKResult<T = void> {
  success: boolean
  data?: T
  error?: string
  securityPolicyMessage?: string
  isSecurityPolicyError?: boolean
  warnings?: string[]
}

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
// SDK App Schemas
// ============================================================================

export const addAppOptionsSchema = type({
  '+': 'delete',
  appId: 'string',
  'name?': 'string',
  'icon?': 'string',
  'apikey?': 'string',
  'supaHost?': 'string',
  'supaAnon?': 'string',
})

export type AddAppOptions = typeof addAppOptionsSchema.infer

export const updateAppOptionsSchema = type({
  '+': 'delete',
  appId: 'string',
  'name?': 'string',
  'icon?': 'string',
  'retention?': 'number',
  'apikey?': 'string',
  'supaHost?': 'string',
  'supaAnon?': 'string',
})

export type UpdateAppOptions = typeof updateAppOptionsSchema.infer

export const appInfoSchema = type({
  '+': 'delete',
  appId: 'string',
  name: 'string',
  'iconUrl?': 'string',
  createdAt: 'Date',
})

export type AppInfo = typeof appInfoSchema.infer

export const starRepoOptionsSchema = type({
  '+': 'delete',
  'repository?': 'string',
})

export type StarRepoOptions = typeof starRepoOptionsSchema.infer

export const starAllRepositoriesOptionsSchema = type({
  '+': 'delete',
  'repositories?': 'string > 0[]',
  'minDelayMs?': 'number.integer >= 0',
  'maxDelayMs?': 'number.integer >= 0',
  'maxConcurrency?': '1 <= number.integer <= 16',
})

export type StarAllRepositoriesOptions = typeof starAllRepositoriesOptionsSchema.infer

// ============================================================================
// SDK Bundle Schemas
// ============================================================================

export const uploadOptionsSchema = type({
  '+': 'delete',
  appId: 'string',
  path: 'string',
  'bundle?': 'string',
  'channel?': 'string',
  'rollout?': '0 <= number <= 100',
  'rolloutPercentageBps?': '0 <= number.integer <= 10000',
  'rolloutCacheTtlSeconds?': '60 <= number.integer <= 31536000',
  'apikey?': 'string',
  'external?': 'string',
  'encrypt?': 'boolean',
  'encryptionKey?': 'string',
  'supaHost?': 'string',
  'supaAnon?': 'string',
  'timeout?': 'number',
  'useTus?': 'boolean',
  'comment?': 'string',
  'minUpdateVersion?': 'string',
  'autoMinUpdateVersion?': 'boolean',
  'autoSetBundle?': 'boolean',
  'selfAssign?': 'boolean',
  'packageJsonPaths?': 'string',
  'ignoreCompatibilityCheck?': 'boolean',
  'disableCodeCheck?': 'boolean',
  'useZip?': 'boolean',
  'capacitorConfig?': capacitorConfigOptionSchema,
})

export type UploadOptions = typeof uploadOptionsSchema.infer

export const uploadResultSchema = type({
  '+': 'delete',
  success: 'boolean',
  'bundleId?': 'string',
  'bundleUrl?': 'string',
  'checksum?': 'string | null',
  'encryptionMethod?': "'none' | 'v1' | 'v2'",
  'sessionKey?': 'string',
  'ivSessionKey?': 'string | null',
  'storageProvider?': 'string',
  'skipped?': 'boolean',
  'reason?': 'string',
  'error?': 'string',
  'warnings?': 'string[]',
})

export type UploadResult = typeof uploadResultSchema.infer

export const bundleInfoSchema = type({
  '+': 'delete',
  id: 'string',
  version: 'string',
  'channel?': 'string',
  uploadedAt: 'Date',
  size: 'number',
  encrypted: 'boolean',
})

export type BundleInfo = typeof bundleInfoSchema.infer

export const cleanupOptionsSchema = type({
  '+': 'delete',
  appId: 'string',
  'keep?': 'number',
  'bundle?': 'string',
  'force?': 'boolean',
  'ignoreChannel?': 'boolean',
  'apikey?': 'string',
  'supaHost?': 'string',
  'supaAnon?': 'string',
})

export type CleanupOptions = typeof cleanupOptionsSchema.infer

// ============================================================================
// SDK Key Schemas
// ============================================================================

export const generateKeyOptionsSchema = type({
  '+': 'delete',
  'force?': type('boolean').describe('Overwrite existing keys if they exist'),
  'setupChannel?': 'boolean',
  'capacitorConfig?': capacitorConfigOptionSchema,
})

export type GenerateKeyOptions = typeof generateKeyOptionsSchema.infer

export const saveKeyOptionsSchema = type({
  '+': 'delete',
  'keyPath?': 'string',
  'keyData?': 'string',
  'setupChannel?': 'boolean',
  'capacitorConfig?': capacitorConfigOptionSchema,
})

export type SaveKeyOptions = typeof saveKeyOptionsSchema.infer

export const deleteOldKeyOptionsSchema = type({
  '+': 'delete',
  'force?': 'boolean',
  'setupChannel?': 'boolean',
  'capacitorConfig?': capacitorConfigOptionSchema,
})

export type DeleteOldKeyOptions = typeof deleteOldKeyOptionsSchema.infer

// ============================================================================
// SDK Channel Schemas
// ============================================================================

export const addChannelOptionsSchema = type({
  '+': 'delete',
  channelId: type('string').describe('Channel name'),
  appId: 'string',
  'default?': 'boolean',
  'selfAssign?': 'boolean',
  'apikey?': 'string',
  'supaHost?': 'string',
  'supaAnon?': 'string',
})

export type AddChannelOptions = typeof addChannelOptionsSchema.infer

export const updateChannelOptionsBaseSchema = type({
  '+': 'delete',
  channelId: type('string').describe('Channel name'),
  appId: 'string',
  'bundle?': 'string',
  'state?': 'string',
  'downgrade?': 'boolean',
  'ios?': 'boolean',
  'android?': 'boolean',
  'selfAssign?': 'boolean',
  'disableAutoUpdate?': 'string',
  'dev?': 'boolean',
  'emulator?': 'boolean',
  'device?': 'boolean',
  'prod?': 'boolean',
  'rolloutBundle?': 'string',
  'rolloutPercentage?': '0 <= number <= 100',
  'rolloutPercentageBps?': '0 <= number.integer <= 10000',
  'rolloutEnable?': 'boolean',
  'rolloutDisable?': 'boolean',
  'rolloutPause?': 'boolean',
  'rolloutResume?': 'boolean',
  'rolloutRollback?': 'boolean',
  'rolloutPromote?': 'boolean',
  'rolloutCacheTtlSeconds?': '60 <= number.integer <= 31536000',
  'autoPauseEnabled?': 'boolean',
  'autoPauseDisabled?': 'boolean',
  'autoPauseWindowMinutes?': '1 <= number.integer <= 10080',
  'autoPauseFailureRateBps?': '0 <= number.integer <= 10000 | null',
  'autoPauseConfidence?': '0 < number < 1',
  'autoPauseMinAttempts?': 'number.integer >= 0 | null',
  'autoPauseMinFailures?': 'number.integer >= 0 | null',
  'autoPauseAction?': "'pause' | 'rollback' | 'notify'",
  'autoPauseCooldownMinutes?': '0 <= number.integer <= 10080',
  'apikey?': 'string',
  'supaHost?': 'string',
  'supaAnon?': 'string',
})

export const updateChannelOptionsSchema = updateChannelOptionsBaseSchema.narrow((value, ctx) => {
  if (!rejectConflictingBooleanGroup(value, ctx, ['rolloutEnable', 'rolloutDisable']))
    return false
  if (!rejectConflictingBooleanGroup(value, ctx, ['rolloutPause', 'rolloutResume', 'rolloutRollback', 'rolloutPromote']))
    return false
  if (!rejectConflictingBooleanGroup(value, ctx, ['autoPauseEnabled', 'autoPauseDisabled']))
    return false
  return true
})

export type UpdateChannelOptions = typeof updateChannelOptionsSchema.infer

// ============================================================================
// SDK Organization Schemas
// ============================================================================

export const accountIdOptionsSchema = type({
  '+': 'delete',
  'apikey?': 'string',
  'supaHost?': 'string',
  'supaAnon?': 'string',
})

export type AccountIdOptions = typeof accountIdOptionsSchema.infer

export const listOrganizationsOptionsSchema = accountIdOptionsSchema

export type ListOrganizationsOptions = typeof listOrganizationsOptionsSchema.infer

export const addOrganizationOptionsSchema = type({
  '...': accountIdOptionsSchema,
  '+': 'delete',
  name: 'string',
  email: 'string',
})

export type AddOrganizationOptions = typeof addOrganizationOptionsSchema.infer

export const updateOrganizationOptionsSchema = type({
  '...': accountIdOptionsSchema,
  '+': 'delete',
  orgId: 'string',
  'name?': 'string',
  'email?': 'string',
})

export type UpdateOrganizationOptions = typeof updateOrganizationOptionsSchema.infer

export const organizationInfoSchema = type({
  '+': 'delete',
  id: 'string',
  name: 'string',
  'role?': 'string',
  'appCount?': 'number',
  'email?': 'string',
  'createdAt?': 'Date',
})

export type OrganizationInfo = typeof organizationInfoSchema.infer

export const deleteOrganizationOptionsSchema = type({
  '...': accountIdOptionsSchema,
  '+': 'delete',
  'autoConfirm?': 'boolean',
})

export type DeleteOrganizationOptions = typeof deleteOrganizationOptionsSchema.infer

// ============================================================================
// SDK Login & Doctor Schemas
// ============================================================================

export const loginOptionsSchema = type({
  '+': 'delete',
  apikey: 'string',
  'local?': 'boolean',
  'supaHost?': 'string',
  'supaAnon?': 'string',
})

export type LoginOptions = typeof loginOptionsSchema.infer

export const doctorOptionsSchema = type({
  '+': 'delete',
  'packageJson?': 'string',
})

export type DoctorOptions = typeof doctorOptionsSchema.infer

// ============================================================================
// SDK Bundle Compatibility Schemas
// ============================================================================

export const bundleCompatibilityOptionsSchema = type({
  '+': 'delete',
  appId: 'string',
  channel: 'string',
  'packageJson?': 'string',
  'nodeModules?': 'string',
  'textOutput?': 'boolean',
  'apikey?': 'string',
  'supaHost?': 'string',
  'supaAnon?': 'string',
})

export type BundleCompatibilityOptions = typeof bundleCompatibilityOptionsSchema.infer

// ============================================================================
// SDK Encrypt/Decrypt/Zip Schemas
// ============================================================================

export const encryptBundleOptionsSchema = type({
  '+': 'delete',
  zipPath: 'string',
  checksum: 'string',
  'keyPath?': 'string',
  'keyData?': 'string',
  'json?': 'boolean',
  'packageJson?': 'string',
})

export type EncryptBundleOptions = typeof encryptBundleOptionsSchema.infer

export const decryptBundleOptionsSchema = type({
  '+': 'delete',
  zipPath: 'string',
  ivSessionKey: 'string',
  'keyPath?': 'string',
  'keyData?': 'string',
  'checksum?': 'string',
  'packageJson?': 'string',
})

export type DecryptBundleOptions = typeof decryptBundleOptionsSchema.infer

export const zipBundleOptionsSchema = type({
  '+': 'delete',
  appId: 'string',
  path: 'string',
  'bundle?': 'string',
  'name?': 'string',
  'codeCheck?': 'boolean',
  'json?': 'boolean',
  'keyV2?': 'boolean',
  'packageJson?': 'string',
})

export type ZipBundleOptions = typeof zipBundleOptionsSchema.infer

// ============================================================================
// SDK Build Schemas
// ============================================================================

export const requestBuildOptionsSchema = type({
  '+': 'delete',
  appId: 'string',
  'path?': 'string',
  'nodeModules?': 'string',
  platform: "'ios' | 'android'",
  'credentials?': buildCredentialsSchema,
  'submitToStoreReview?': 'boolean',
  'storeReleaseName?': 'string > 0',
  'storeReleaseNotes?': 'string > 0',
  'storeReleaseNotesLocalized?': localizedReleaseNotesSchema,
  'iosTestflightGroups?': 'string > 0',
  'iosAutomaticRelease?': 'boolean',
  'userId?': 'string',
  'apikey?': 'string',
  'supaHost?': 'string',
  'supaAnon?': 'string',
  'prescan?': 'boolean',
  'prescanIgnoreFatal?': 'boolean',
})

export type RequestBuildOptions = typeof requestBuildOptionsSchema.infer

export const currentBundleOptionsSchema = accountIdOptionsSchema

export type CurrentBundleOptions = typeof currentBundleOptionsSchema.infer

// ============================================================================
// SDK Settings Schemas
// ============================================================================

export const setSettingOptionsSchema = type({
  '+': 'delete',
  'apikey?': 'string',
  'bool?': 'string',
  'string?': 'string',
  'capacitorConfig?': capacitorConfigOptionSchema,
})

export type SetSettingOptions = typeof setSettingOptionsSchema.infer

// ============================================================================
// SDK Stats Schemas
// ============================================================================

export const statsOrderSchema = type({
  '+': 'delete',
  key: 'string',
  'sortable?': "'asc' | 'desc'",
})

export type StatsOrder = typeof statsOrderSchema.infer

export const getStatsOptionsSchema = type({
  '+': 'delete',
  appId: 'string',
  'deviceIds?': 'string[]',
  'search?': 'string',
  'order?': statsOrderSchema.array(),
  'rangeStart?': 'string',
  'rangeEnd?': 'string',
  'limit?': 'number',
  'after?': 'string | null',
  'apikey?': 'string',
  'supaHost?': 'string',
  'supaAnon?': 'string',
})

export type GetStatsOptions = typeof getStatsOptionsSchema.infer

export const deviceStatsSchema = type({
  '+': 'delete',
  appId: 'string',
  deviceId: 'string',
  action: 'string',
  versionId: 'number',
  'version?': 'number',
  createdAt: 'string',
})

export type DeviceStats = typeof deviceStatsSchema.infer

// ============================================================================
// SDK Probe Schemas
// ============================================================================

export const probeOptionsSchema = type({
  '+': 'delete',
  platform: "'ios' | 'android'",
})

export type ProbeOptions = typeof probeOptionsSchema.infer
