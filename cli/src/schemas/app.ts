import { type } from 'arktype'
import { optionsBaseSchema } from './base'

// ============================================================================
// App Options Schemas
// ============================================================================

export const appOptionsSchema = type({
  '...': optionsBaseSchema,
  'name?': 'string',
  'icon?': 'string',
  'retention?': 'number',
  'exposeMetadata?': 'boolean',
  'preview?': 'boolean',
  'allowDeviceCustomId?': 'boolean',
  'blockProviderInfraRequests?': 'boolean',
  'buildTimeoutMinutes?': 'number',
  'iosStoreUrl?': 'string',
  'androidStoreUrl?': 'string',
  'defaultUploadChannel?': 'string',
  'defaultDownloadChannel?': 'string',
  'disableDownloadChannels?': 'boolean',
})

export type AppOptions = typeof appOptionsSchema.infer

export const appDebugOptionsSchema = type({
  '...': optionsBaseSchema,
  'device?': 'string',
})

export type AppDebugOptions = typeof appDebugOptionsSchema.infer

export const appSettingOptionsSchema = type({
  '...': optionsBaseSchema,
  'bool?': 'string',
  'string?': 'string',
})

export type AppSettingOptions = typeof appSettingOptionsSchema.infer
