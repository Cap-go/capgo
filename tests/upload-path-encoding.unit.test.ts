import { describe, expect, it } from 'vitest'

import { encodeR2KeyForUploadLocation, getSafeAttachmentReadCandidateKeys } from '../supabase/functions/_backend/files/util.ts'

describe('upload path encoding', () => {
  it.concurrent('encodes returned upload locations so literal percent signs are valid URLs', () => {
    const encoded = encodeR2KeyForUploadLocation('orgs/org-id/apps/app-id/test-%zz 100%.zip')

    expect(encoded).toBe('orgs/org-id/apps/app-id/test-%25zz%20100%25.zip')
  })

  it.concurrent('tries raw percent route keys after decoded keys for legacy manifest objects', () => {
    expect(getSafeAttachmentReadCandidateKeys(
      'orgs/org-id/apps/app-id/delta/hash_sad_post_grey@2x.png',
      'orgs/org-id/apps/app-id/delta/hash_sad_post_grey%402x.png',
    )).toEqual([
      'orgs/org-id/apps/app-id/delta/hash_sad_post_grey@2x.png',
      'orgs/org-id/apps/app-id/delta/hash_sad_post_grey%402x.png',
    ])
  })

  it.concurrent('uses the same raw percent route fallback for new raw manifest file names', () => {
    const newManifestFileName = 'assets/suite-marketing/images/social-media/sad_post_grey@2x.png'
    const encodedStoragePath = 'orgs/org-id/apps/app-id/delta/hash_assets/suite-marketing/images/social-media/sad_post_grey%402x.png'
    const decodedRouteKey = encodedStoragePath.replace('%40', '@')

    expect(newManifestFileName).toContain('@2x')
    expect(getSafeAttachmentReadCandidateKeys(decodedRouteKey, encodedStoragePath)).toEqual([
      decodedRouteKey,
      encodedStoragePath,
    ])
  })

  it.concurrent('does not try raw percent route keys outside the authorized app scope', () => {
    expect(getSafeAttachmentReadCandidateKeys(
      'orgs/org-id/apps/app-id/delta/hash_sad_post_grey@2x.png',
      'orgs/org-id/apps/other-app-id/delta/hash_sad_post_grey%402x.png',
    )).toEqual([
      'orgs/org-id/apps/app-id/delta/hash_sad_post_grey@2x.png',
    ])
  })
})
