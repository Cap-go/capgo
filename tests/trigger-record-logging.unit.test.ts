import { describe, expect, it } from 'vitest'

import {
  getAppTriggerRecordLogMetadata,
  getAppVersionTriggerRecordLogMetadata,
  getChannelTriggerRecordLogMetadata,
  getDeployHistoryTriggerRecordLogMetadata,
  getManifestTriggerRecordLogMetadata,
  getOrgTriggerRecordLogMetadata,
  getUserTriggerRecordLogMetadata,
} from '../supabase/functions/_backend/triggers/logging.ts'

describe('trigger record logging metadata', () => {
  it.concurrent('summarizes organization trigger records without raw values', () => {
    const metadata = getOrgTriggerRecordLogMetadata({
      created_at: '2026-05-11T00:00:00Z',
      created_by: 'user-secret-id',
      customer_id: 'cus_secret_123',
      email_preferences: { marketing: true },
      enforce_encrypted_bundles: true,
      enforce_hashed_api_keys: true,
      enforcing_2fa: true,
      has_usage_credits: true,
      id: 'org-secret-id',
      last_stats_updated_at: null,
      logo: 'https://cdn.example.com/private-logo.png',
      management_email: 'admin@example.com',
      max_apikey_expiration_days: 30,
      name: 'Private Org Name',
      password_policy_config: { minLength: 12 },
      require_apikey_expiration: true,
      required_encryption_key: 'encryption-key-secret',
      stats_refresh_requested_at: null,
      stats_updated_at: null,
      updated_at: null,
      use_new_rbac: true,
      website: 'https://private.example.com',
    })
    const serialized = JSON.stringify(metadata)

    expect(metadata).toMatchObject({
      hasCustomerId: true,
      hasManagementEmail: true,
      hasRequiredEncryptionKey: true,
      usesNewRbac: true,
    })
    expect(serialized).not.toContain('admin@example.com')
    expect(serialized).not.toContain('cus_secret_123')
    expect(serialized).not.toContain('encryption-key-secret')
    expect(serialized).not.toContain('org-secret-id')
    expect(serialized).not.toContain('Private Org Name')
    expect(serialized).not.toContain('user-secret-id')
  })

  it.concurrent('summarizes app trigger records without raw values', () => {
    const metadata = getAppTriggerRecordLogMetadata({
      allow_device_custom_id: true,
      allow_preview: true,
      android_store_url: 'https://play.google.com/store/apps/details?id=com.secret.app',
      app_id: 'com.secret.app',
      build_timeout_seconds: 120,
      build_timeout_updated_at: '2026-05-11T00:00:00Z',
      channel_device_count: 3,
      created_at: '2026-05-11T00:00:00Z',
      default_upload_channel: 'production',
      existing_app: false,
      expose_metadata: true,
      icon_url: 'https://cdn.example.com/icon.png',
      id: 'app-row-secret-id',
      ios_store_url: 'https://apps.apple.com/app/private',
      last_version: '1.2.3-secret',
      manifest_bundle_count: 4,
      name: 'Secret App',
      need_onboarding: false,
      owner_org: 'org-secret-id',
      retention: 90,
      stats_refresh_requested_at: null,
      stats_updated_at: null,
      transfer_history: [{ from: 'private-source' }],
      updated_at: null,
      user_id: 'user-secret-id',
    })
    const serialized = JSON.stringify(metadata)

    expect(metadata).toMatchObject({
      hasAppId: true,
      hasIconUrl: true,
      hasOwnerOrg: true,
      transferHistoryCount: 1,
    })
    expect(serialized).not.toContain('com.secret.app')
    expect(serialized).not.toContain('org-secret-id')
    expect(serialized).not.toContain('Secret App')
    expect(serialized).not.toContain('user-secret-id')
    expect(serialized).not.toContain('private-source')
  })

  it.concurrent('summarizes deploy history trigger records without raw values', () => {
    const metadata = getDeployHistoryTriggerRecordLogMetadata({
      app_id: 'com.secret.app',
      channel_id: 42,
      created_at: '2026-05-11T00:00:00Z',
      created_by: 'user-secret-id',
      deployed_at: '2026-05-11T00:00:00Z',
      id: 77,
      install_stats_email_sent_at: null,
      owner_org: 'org-secret-id',
      updated_at: null,
      version_id: 99,
    })
    const serialized = JSON.stringify(metadata)

    expect(metadata).toMatchObject({
      hasAppId: true,
      hasChannelId: true,
      hasOwnerOrg: true,
      hasVersionId: true,
    })
    expect(serialized).not.toContain('com.secret.app')
    expect(serialized).not.toContain('org-secret-id')
    expect(serialized).not.toContain('user-secret-id')
  })

  it.concurrent('summarizes app version trigger records without raw values', () => {
    const metadata = getAppVersionTriggerRecordLogMetadata({
      app_id: 'com.secret.app',
      checksum: 'checksum-secret',
      cli_version: '9.9.9',
      comment: 'private release note',
      created_at: '2026-05-11T00:00:00Z',
      deleted: false,
      deleted_at: null,
      external_url: 'https://private.example.com/bundle.zip',
      id: 99,
      key_id: 'key-secret-id',
      link: 'https://storage.example.com/private-link',
      manifest: [{
        file_hash: 'manifest-hash-secret',
        file_name: 'manifest-private.js',
        s3_path: 'orgs/org-secret/apps/com.secret.app/manifest-private.js',
      }],
      manifest_count: 1,
      min_update_version: '1.0.0-secret',
      name: '1.2.3-secret',
      native_packages: [{ package: 'private-package' }],
      owner_org: 'org-secret-id',
      r2_path: 'orgs/org-secret/apps/com.secret.app/private.zip',
      session_key: 'session-key-secret',
      storage_provider: 'r2-direct',
      updated_at: null,
      user_id: 'user-secret-id',
    })
    const serialized = JSON.stringify(metadata)

    expect(metadata).toMatchObject({
      hasAppId: true,
      hasR2Path: true,
      hasSessionKey: true,
      manifestCount: 1,
      nativePackagesCount: 1,
    })
    expect(serialized).not.toContain('checksum-secret')
    expect(serialized).not.toContain('com.secret.app')
    expect(serialized).not.toContain('org-secret-id')
    expect(serialized).not.toContain('private-link')
    expect(serialized).not.toContain('session-key-secret')
    expect(serialized).not.toContain('user-secret-id')
  })

  it.concurrent('summarizes channel trigger records without raw values', () => {
    const metadata = getChannelTriggerRecordLogMetadata({
      allow_dev: true,
      allow_device: true,
      allow_device_self_set: true,
      allow_emulator: true,
      allow_prod: true,
      android: true,
      app_id: 'com.secret.app',
      created_at: '2026-05-11T00:00:00Z',
      created_by: 'user-secret-id',
      disable_auto_update: 'major',
      disable_auto_update_under_native: false,
      electron: true,
      id: 42,
      ios: true,
      name: 'private-channel',
      owner_org: 'org-secret-id',
      public: true,
      rbac_id: 'rbac-secret-id',
      updated_at: '2026-05-11T00:00:00Z',
      version: 99,
    })
    const serialized = JSON.stringify(metadata)

    expect(metadata).toMatchObject({
      hasAppId: true,
      hasName: true,
      hasOwnerOrg: true,
      isPublic: true,
    })
    expect(serialized).not.toContain('com.secret.app')
    expect(serialized).not.toContain('org-secret-id')
    expect(serialized).not.toContain('private-channel')
    expect(serialized).not.toContain('rbac-secret-id')
    expect(serialized).not.toContain('user-secret-id')
  })

  it.concurrent('summarizes manifest trigger records without raw values', () => {
    const metadata = getManifestTriggerRecordLogMetadata({
      app_version_id: 99,
      file_hash: 'sha256-secret-hash',
      file_name: 'private.bundle.js',
      file_size: 12345,
      id: 77,
      s3_path: 'orgs/org-secret/apps/com.secret.app/private.bundle.js',
    })
    const serialized = JSON.stringify(metadata)

    expect(metadata).toMatchObject({
      hasAppVersionId: true,
      hasFileHash: true,
      hasFileName: true,
      hasS3Path: true,
    })
    expect(serialized).not.toContain('sha256-secret-hash')
    expect(serialized).not.toContain('private.bundle.js')
    expect(serialized).not.toContain('org-secret')
    expect(serialized).not.toContain('com.secret.app')
  })

  it.concurrent('summarizes user trigger records without raw values', () => {
    const metadata = getUserTriggerRecordLogMetadata({
      ban_time: null,
      country: 'DE',
      created_at: '2026-05-11T00:00:00Z',
      created_via_invite: true,
      email: 'user@example.com',
      email_preferences: { product: true },
      enable_notifications: true,
      first_name: 'Private',
      id: 'user-secret-id',
      image_url: 'https://cdn.example.com/private-user.png',
      last_name: 'User',
      opt_for_newsletters: false,
      updated_at: null,
    })
    const serialized = JSON.stringify(metadata)

    expect(metadata).toMatchObject({
      createdViaInvite: true,
      hasEmail: true,
      hasId: true,
      hasImageUrl: true,
    })
    expect(serialized).not.toContain('user@example.com')
    expect(serialized).not.toContain('user-secret-id')
    expect(serialized).not.toContain('Private')
    expect(serialized).not.toContain('private-user.png')
  })
})
