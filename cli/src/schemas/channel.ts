import { z } from 'zod'
import { optionsBaseSchema } from './base'

// ============================================================================
// Channel Data Schema
// ============================================================================

export const channelSchema = z.object({
  id: z.number(),
  name: z.string(),
  public: z.boolean(),
  ios: z.boolean(),
  android: z.boolean(),
  disable_auto_update: z.string(),
  disable_auto_update_under_native: z.boolean(),
  allow_device_self_set: z.boolean(),
  allow_emulator: z.boolean(),
  allow_device: z.boolean(),
  allow_dev: z.boolean(),
  allow_prod: z.boolean(),
  version: z.any().optional(),
})

export type Channel = z.infer<typeof channelSchema>

// ============================================================================
// Channel Command Options Schemas
// ============================================================================

export const channelAddOptionsSchema = optionsBaseSchema.extend({
  default: z.boolean().optional(),
  selfAssign: z.boolean().optional(),
})

export type ChannelAddOptions = z.infer<typeof channelAddOptionsSchema>

export const channelDeleteOptionsSchema = optionsBaseSchema.extend({
  deleteBundle: z.boolean(),
  successIfNotFound: z.boolean(),
})

export type ChannelDeleteOptions = z.infer<typeof channelDeleteOptionsSchema>

export const channelCurrentBundleOptionsSchema = optionsBaseSchema.extend({
  channel: z.string().optional(),
  quiet: z.boolean().optional(),
})

export type ChannelCurrentBundleOptions = z.infer<typeof channelCurrentBundleOptionsSchema>

export const optionsSetChannelSchema = optionsBaseSchema.extend({
  bundle: z.string().optional(),
  state: z.string().optional(),
  downgrade: z.boolean().optional(),
  latest: z.boolean().optional(),
  latestRemote: z.boolean().optional(),
  ios: z.boolean().optional(),
  android: z.boolean().optional(),
  selfAssign: z.boolean().optional(),
  disableAutoUpdate: z.string().optional(),
  dev: z.boolean().optional(),
  emulator: z.boolean().optional(),
  device: z.boolean().optional(),
  prod: z.boolean().optional(),
  packageJson: z.string().optional(),
  ignoreMetadataCheck: z.boolean().optional(),
})

export type OptionsSetChannel = z.infer<typeof optionsSetChannelSchema>
