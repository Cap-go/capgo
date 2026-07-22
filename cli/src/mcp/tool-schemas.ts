import { type } from '../schemas/arktype'
import { capacitorConfigOptionSchema } from '../schemas/sdk'

export const mcpAddAppInputSchema = type({
  '+': 'delete',
  appId: 'string',
  'name?': 'string',
  'icon?': 'string',
})

export const mcpUpdateAppInputSchema = type({
  '+': 'delete',
  appId: 'string',
  'name?': 'string',
  'icon?': 'string',
  'retention?': 'number',
})

export const mcpDeleteAppInputSchema = type({
  '+': 'delete',
  appId: type('string').describe('App ID to delete'),
})

export const mcpUploadBundleInputSchema = type({
  '+': 'delete',
  appId: 'string',
  path: 'string',
  'bundle?': 'string',
  'channel?': 'string',
  'rollout?': '0 <= number <= 100',
  'rolloutPercentageBps?': '0 <= number.integer <= 10000',
  'rolloutCacheTtlSeconds?': '60 <= number.integer <= 31536000',
  'comment?': 'string',
  'minUpdateVersion?': 'string',
  'autoMinUpdateVersion?': 'boolean',
  'autoSetBundle?': 'boolean',
  'encrypt?': 'boolean',
  'capacitorConfig?': capacitorConfigOptionSchema,
})

export const mcpListBundlesInputSchema = type({
  '+': 'delete',
  appId: type('string').describe('App ID to list bundles for'),
})

export const mcpDeleteBundleInputSchema = type({
  '+': 'delete',
  appId: type('string').describe('App ID'),
  bundleId: type('string').describe('Bundle version to delete'),
})

export const mcpCleanupBundlesInputSchema = type({
  '+': 'delete',
  appId: 'string',
  'keep?': 'number',
  'bundle?': 'string',
  'force?': 'boolean',
  'ignoreChannel?': 'boolean',
})

export const mcpCheckCompatibilityInputSchema = type({
  '+': 'delete',
  appId: type('string').describe('App ID to check'),
  channel: type('string').describe('Channel to check compatibility with'),
  'packageJson?': type('string').describe('Path to package.json for monorepos'),
})

export const mcpListChannelsInputSchema = type({
  '+': 'delete',
  appId: type('string').describe('App ID to list channels for'),
})

export const mcpAddChannelInputSchema = type({
  '+': 'delete',
  appId: type('string').describe('App ID'),
  channelId: type('string').describe('Channel name to create'),
  'default?': type('boolean').describe('Set as default channel'),
  'selfAssign?': type('boolean').describe('Allow devices to self-assign to this channel'),
})

export const mcpUpdateChannelInputSchema = type({
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
})

export const mcpDeleteChannelInputSchema = type({
  '+': 'delete',
  appId: type('string').describe('App ID'),
  channelId: type('string').describe('Channel name to delete'),
  'deleteBundle?': type('boolean').describe('Also delete the bundle linked to this channel'),
})

export const mcpGetCurrentBundleInputSchema = type({
  '+': 'delete',
  appId: type('string').describe('App ID'),
  channelId: type('string').describe('Channel name'),
})

export const mcpAddOrganizationInputSchema = type({
  '+': 'delete',
  name: type('string').describe('Organization name'),
  email: type('string').describe('Management email for the organization'),
})

export const mcpDoctorInputSchema = type({
  '+': 'delete',
  'packageJson?': type('string').describe('Path to package.json for monorepos'),
})

export const mcpGetStatsInputSchema = type({
  '+': 'delete',
  appId: 'string',
  'deviceIds?': 'string[]',
  'limit?': 'number',
  'rangeStart?': 'string',
  'rangeEnd?': 'string',
})

export const mcpRequestBuildInputSchema = type({
  '+': 'delete',
  appId: 'string',
  platform: "'ios' | 'android'",
  'path?': 'string',
  'nodeModules?': 'string',
})

export const mcpGenerateEncryptionKeysInputSchema = type({
  '+': 'delete',
  'force?': type('boolean').describe('Overwrite existing keys if they exist'),
  'capacitorConfig?': capacitorConfigOptionSchema,
})

export const mcpProbeInputSchema = type({
  '+': 'delete',
  platform: type("'ios' | 'android'").describe('Target platform to probe'),
})
