import { type } from './arktype'
import { optionsBaseSchema } from './base'
import { rejectConflictingBooleanGroup } from './common'

// ============================================================================
// Channel Data Schema
// ============================================================================

export const channelSchema = type({
  id: 'number',
  name: 'string',
  public: 'boolean',
  ios: 'boolean',
  android: 'boolean',
  disable_auto_update: 'string',
  disable_auto_update_under_native: 'boolean',
  allow_device_self_set: 'boolean',
  allow_emulator: 'boolean',
  allow_device: 'boolean',
  allow_dev: 'boolean',
  allow_prod: 'boolean',
  'version?': { 'name?': 'string', '[string]': 'unknown' },
})

export type Channel = typeof channelSchema.infer

// ============================================================================
// Channel Command Options Schemas
// ============================================================================

export const channelAddOptionsSchema = type({
  '...': optionsBaseSchema,
  '+': 'delete',
  'default?': 'boolean',
  'selfAssign?': 'boolean',
})

export type ChannelAddOptions = typeof channelAddOptionsSchema.infer

export const channelDeleteOptionsSchema = type({
  '...': optionsBaseSchema,
  '+': 'delete',
  deleteBundle: 'boolean',
  successIfNotFound: 'boolean',
})

export type ChannelDeleteOptions = typeof channelDeleteOptionsSchema.infer

export const channelCurrentBundleOptionsSchema = type({
  '...': optionsBaseSchema,
  '+': 'delete',
  'channel?': 'string',
  'quiet?': 'boolean',
})

export type ChannelCurrentBundleOptions = typeof channelCurrentBundleOptionsSchema.infer

export const optionsSetChannelSchema = type({
  '...': optionsBaseSchema,
  '+': 'delete',
  'bundle?': 'string',
  'state?': 'string',
  'downgrade?': 'boolean',
  'latest?': 'boolean',
  'latestRemote?': 'boolean',
  'ios?': 'boolean',
  'android?': 'boolean',
  'selfAssign?': 'boolean',
  'disableAutoUpdate?': 'string',
  'dev?': 'boolean',
  'emulator?': 'boolean',
  'device?': 'boolean',
  'prod?': 'boolean',
  'packageJson?': 'string',
  'ignoreMetadataCheck?': 'boolean',
  'qrPreview?': 'boolean',
  'sendUpdateNotification?': 'boolean',
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
}).narrow((value, ctx) => {
  if (!rejectConflictingBooleanGroup(value, ctx, ['rolloutEnable', 'rolloutDisable']))
    return false
  if (!rejectConflictingBooleanGroup(value, ctx, ['rolloutPause', 'rolloutResume', 'rolloutRollback', 'rolloutPromote']))
    return false
  if (!rejectConflictingBooleanGroup(value, ctx, ['autoPauseEnabled', 'autoPauseDisabled']))
    return false
  return true
})

export type OptionsSetChannel = typeof optionsSetChannelSchema.infer
