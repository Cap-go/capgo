import { describe, expect, it } from 'vitest'
import { getDownloadLinkBundleMetadata, getDownloadLinkRequestMetadata } from '../supabase/functions/_backend/private/download_link.ts'

describe('download link logging metadata', () => {
  it('summarizes request bodies without exposing request values', () => {
    const metadata = getDownloadLinkRequestMetadata({
      app_id: 'com.secret.app',
      id: 42,
      isManifest: true,
      storage_provider: 'r2',
      user_id: 'user-secret',
    })

    expect(metadata).toEqual({
      hasAppId: true,
      hasStorageProvider: true,
      hasUserId: true,
      hasVersionId: true,
      isManifest: true,
    })
    expect(JSON.stringify(metadata)).not.toContain('com.secret.app')
    expect(JSON.stringify(metadata)).not.toContain('user-secret')
    expect(JSON.stringify(metadata)).not.toContain('42')
  })

  it('can be reused in access-denied errors without exposing app ids', () => {
    const moreInfo = {
      body: getDownloadLinkRequestMetadata({
        app_id: 'com.denied.secret',
        id: 99,
        storage_provider: 'r2',
      }),
    }

    expect(moreInfo).toEqual({
      body: {
        hasAppId: true,
        hasStorageProvider: true,
        hasUserId: false,
        hasVersionId: true,
        isManifest: false,
      },
    })
    expect(JSON.stringify(moreInfo)).not.toContain('com.denied.secret')
    expect(JSON.stringify(moreInfo)).not.toContain('99')
  })

  it('summarizes bundle rows without exposing storage details', () => {
    const metadata = getDownloadLinkBundleMetadata({
      app_id: 'com.secret.app',
      checksum: 'secret-checksum',
      id: 42,
      owner_org: null,
      r2_path: 'orgs/secret/apps/com.secret.app/bundle.zip',
    })

    expect(metadata).toEqual({
      hasBundle: true,
      hasBundleId: true,
      hasChecksum: true,
      hasOwnerOrg: false,
      hasR2Path: true,
    })
    expect(JSON.stringify(metadata)).not.toContain('com.secret.app')
    expect(JSON.stringify(metadata)).not.toContain('secret-checksum')
    expect(JSON.stringify(metadata)).not.toContain('bundle.zip')
    expect(JSON.stringify(metadata)).not.toContain('42')
  })

  it('handles missing bundles with metadata only', () => {
    expect(getDownloadLinkBundleMetadata(null)).toEqual({
      hasBundle: false,
    })
  })
})
