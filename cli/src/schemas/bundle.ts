import { type } from 'arktype'
import { optionsBaseSchema } from './base'

// ============================================================================
// Bundle Upload Options Schema
// ============================================================================

export const optionsUploadSchema = type({
  '...': optionsBaseSchema,
  'bundle?': 'string',
  'path?': 'string',
  'channel?': 'string',
  'rollout?': '0 <= number <= 100',
  'rolloutPercentageBps?': '0 <= number.integer <= 10000',
  'rolloutCacheTtlSeconds?': '60 <= number.integer <= 31536000',
  'displayIvSession?': 'boolean',
  'external?': 'string',
  'key?': 'boolean',
  'keyV2?': 'string',
  'keyDataV2?': 'string',
  'ivSessionKey?': 'string',
  's3Region?': 'string',
  's3Apikey?': 'string',
  's3Apisecret?': 'string',
  's3BucketName?': 'string',
  's3Port?': 'number',
  's3SSL?': 'boolean',
  's3Endpoint?': 'string',
  'bundleUrl?': 'boolean',
  'codeCheck?': 'boolean',
  'oldEncryption?': 'boolean',
  'minUpdateVersion?': 'string',
  'autoMinUpdateVersion?': 'boolean',
  'autoSetBundle?': 'boolean',
  'ignoreMetadataCheck?': 'boolean',
  'failOnIncompatible?': 'boolean',
  'ignoreChecksumCheck?': 'boolean',
  'forceCrc32Checksum?': 'boolean',
  'timeout?': 'number',
  'multipart?': 'boolean',
  'partial?': 'boolean',
  'partialOnly?': 'boolean',
  'delta?': 'boolean',
  'deltaOnly?': 'boolean',
  'tus?': 'boolean',
  'encryptedChecksum?': 'string',
  'packageJson?': 'string',
  'dryUpload?': 'boolean',
  'nodeModules?': 'string',
  'encryptPartial?': 'boolean',
  'deleteLinkedBundleOnUpload?': 'boolean',
  'tusChunkSize?': 'number',
  'zip?': 'boolean',
  'link?': 'string',
  'comment?': 'string',
  'noBrotliPatterns?': 'string',
  'disableBrotli?': 'boolean',
  'versionExistsOk?': 'boolean',
  'selfAssign?': 'boolean',
  'sendUpdateNotification?': 'boolean',
  'verbose?': 'boolean',
  'showReplicationProgress?': 'boolean',
  'qrPreview?': 'boolean',
})

export type OptionsUpload = typeof optionsUploadSchema.infer

// ============================================================================
// Bundle Result Schemas
// ============================================================================

export const zipResultSchema = type({
  bundle: 'string',
  filename: 'string',
  checksum: 'string',
})

export type ZipResult = typeof zipResultSchema.infer

export const encryptResultSchema = type({
  checksum: 'string',
  filename: 'string',
  ivSessionKey: 'string',
})

export type EncryptResult = typeof encryptResultSchema.infer

export const decryptResultSchema = type({
  outputPath: 'string',
  'checksumMatches?': 'boolean',
})

export type DecryptResult = typeof decryptResultSchema.infer

export const uploadBundleResultSchema = type({
  success: 'boolean',
  'appId?': 'string',
  bundle: 'string',
  'updatedChannels?': 'string[]',
  'checksum?': 'string | null',
  encryptionMethod: "'none' | 'v1' | 'v2'",
  'sessionKey?': 'string',
  'ivSessionKey?': 'string | null',
  'storageProvider?': 'string',
  'skipped?': 'boolean',
  'reason?': 'string',
  'builderAction?': "'launch-onboarding' | 'launch-build'",
})

export type UploadBundleResult = typeof uploadBundleResultSchema.infer

// ============================================================================
// Bundle Command Options Schemas
// ============================================================================

export const bundleZipOptionsSchema = type({
  '...': optionsBaseSchema,
  'bundle?': 'string',
  'path?': 'string',
  'codeCheck?': 'boolean',
  'name?': 'string',
  'json?': 'boolean',
  'keyV2?': 'boolean',
  'packageJson?': 'string',
})

export type BundleZipOptions = typeof bundleZipOptionsSchema.infer

export const bundleDeleteOptionsSchema = type({
  '...': optionsBaseSchema,
  bundle: 'string',
})

export type BundleDeleteOptions = typeof bundleDeleteOptionsSchema.infer

export const bundleCompatibilityOptionsSchema = type({
  '...': optionsBaseSchema,
  'channel?': 'string',
  'text?': 'boolean',
  'packageJson?': 'string',
  'nodeModules?': 'string',
})

export type BundleCompatibilityOptions = typeof bundleCompatibilityOptionsSchema.infer

export const bundleReleaseTypeOptionsSchema = type({
  '...': optionsBaseSchema,
  'channel?': 'string',
  'packageJson?': 'string',
  'nodeModules?': 'string',
})

export type BundleReleaseTypeOptions = typeof bundleReleaseTypeOptionsSchema.infer

export const bundleCleanupOptionsSchema = type({
  '...': optionsBaseSchema,
  version: 'string',
  bundle: 'string',
  keep: 'number',
  force: 'boolean',
  ignoreChannel: 'boolean',
})

export type BundleCleanupOptions = typeof bundleCleanupOptionsSchema.infer

export const bundleEncryptOptionsSchema = type({
  'key?': 'string',
  'keyData?': 'string',
  'json?': 'boolean',
  'packageJson?': 'string',
})

export type BundleEncryptOptions = typeof bundleEncryptOptionsSchema.infer

export const bundleDecryptOptionsSchema = type({
  'key?': 'string',
  'keyData?': 'string',
  'checksum?': 'string',
  'packageJson?': 'string',
})

export type BundleDecryptOptions = typeof bundleDecryptOptionsSchema.infer
