import type { Context } from 'hono'
import type { MiddlewareKeyVariables } from '../utils/hono.ts'
import type { Database } from '../utils/supabase.types.ts'
import { cloudlog } from '../utils/logging.ts'

type AppRecord = Database['public']['Tables']['apps']['Row']
type AppVersionRecord = Database['public']['Tables']['app_versions']['Row']
type ChannelRecord = Database['public']['Tables']['channels']['Row']
type DeployHistoryRecord = Database['public']['Tables']['deploy_history']['Row']
type ManifestRecord = Database['public']['Tables']['manifest']['Row']
type OrgRecord = Database['public']['Tables']['orgs']['Row']
type UserRecord = Database['public']['Tables']['users']['Row']

export function logTriggerRecord<TRecord>(
  c: Context<MiddlewareKeyVariables>,
  message: string,
  record: TRecord,
  getMetadata: (record: TRecord) => Record<string, unknown>,
) {
  cloudlog({
    requestId: c.get('requestId'),
    message,
    record: getMetadata(record),
  })
}

function hasStringValue(value: unknown) {
  return typeof value === 'string' && value.length > 0
}

function hasNumberValue(value: unknown) {
  return typeof value === 'number'
}

export function getOrgTriggerRecordLogMetadata(record: OrgRecord) {
  return {
    hasId: hasStringValue(record.id),
    hasName: hasStringValue(record.name),
    hasManagementEmail: hasStringValue(record.management_email),
    hasCustomerId: hasStringValue(record.customer_id),
    hasCreatedBy: hasStringValue(record.created_by),
    hasWebsite: hasStringValue(record.website),
    hasLogo: hasStringValue(record.logo),
    hasRequiredEncryptionKey: hasStringValue(record.required_encryption_key),
    enforces2fa: record.enforcing_2fa,
    usesNewRbac: record.use_new_rbac,
    requiresApikeyExpiration: record.require_apikey_expiration,
  }
}

export function getAppTriggerRecordLogMetadata(record: AppRecord) {
  return {
    hasId: hasStringValue(record.id),
    hasAppId: hasStringValue(record.app_id),
    hasOwnerOrg: hasStringValue(record.owner_org),
    hasUserId: hasStringValue(record.user_id),
    hasName: hasStringValue(record.name),
    hasIconUrl: hasStringValue(record.icon_url),
    hasAndroidStoreUrl: hasStringValue(record.android_store_url),
    hasIosStoreUrl: hasStringValue(record.ios_store_url),
    hasLastVersion: hasStringValue(record.last_version),
    transferHistoryCount: Array.isArray(record.transfer_history) ? record.transfer_history.length : 0,
  }
}

export function getAppVersionTriggerRecordLogMetadata(record: AppVersionRecord) {
  return {
    hasId: hasNumberValue(record.id),
    hasAppId: hasStringValue(record.app_id),
    hasOwnerOrg: hasStringValue(record.owner_org),
    hasUserId: hasStringValue(record.user_id),
    hasName: hasStringValue(record.name),
    hasChecksum: hasStringValue(record.checksum),
    hasExternalUrl: hasStringValue(record.external_url),
    hasKeyId: hasStringValue(record.key_id),
    hasLink: hasStringValue(record.link),
    hasMinUpdateVersion: hasStringValue(record.min_update_version),
    hasR2Path: hasStringValue(record.r2_path),
    hasSessionKey: hasStringValue(record.session_key),
    manifestCount: Array.isArray(record.manifest) ? record.manifest.length : 0,
    nativePackagesCount: Array.isArray(record.native_packages) ? record.native_packages.length : 0,
    deleted: record.deleted,
  }
}

export function getChannelTriggerRecordLogMetadata(record: ChannelRecord) {
  return {
    hasId: hasNumberValue(record.id),
    hasAppId: hasStringValue(record.app_id),
    hasOwnerOrg: hasStringValue(record.owner_org),
    hasCreatedBy: hasStringValue(record.created_by),
    hasName: hasStringValue(record.name),
    hasRbacId: hasStringValue(record.rbac_id),
    hasVersion: hasNumberValue(record.version),
    isPublic: record.public,
  }
}

export function getDeployHistoryTriggerRecordLogMetadata(record: DeployHistoryRecord) {
  return {
    hasId: hasNumberValue(record.id),
    hasAppId: hasStringValue(record.app_id),
    hasOwnerOrg: hasStringValue(record.owner_org),
    hasCreatedBy: hasStringValue(record.created_by),
    hasChannelId: hasNumberValue(record.channel_id),
    hasVersionId: hasNumberValue(record.version_id),
  }
}

export function getManifestTriggerRecordLogMetadata(record: ManifestRecord) {
  return {
    hasId: hasNumberValue(record.id),
    hasAppVersionId: hasNumberValue(record.app_version_id),
    hasFileName: hasStringValue(record.file_name),
    hasFileHash: hasStringValue(record.file_hash),
    hasS3Path: hasStringValue(record.s3_path),
    hasFileSize: hasNumberValue(record.file_size),
  }
}

export function getUserTriggerRecordLogMetadata(record: UserRecord) {
  return {
    hasId: hasStringValue(record.id),
    hasEmail: hasStringValue(record.email),
    hasFirstName: hasStringValue(record.first_name),
    hasLastName: hasStringValue(record.last_name),
    hasImageUrl: hasStringValue(record.image_url),
    hasCountry: hasStringValue(record.country),
    hasBanTime: hasStringValue(record.ban_time),
    createdViaInvite: record.created_via_invite,
    notificationsEnabled: record.enable_notifications,
    optedForNewsletters: record.opt_for_newsletters,
  }
}
