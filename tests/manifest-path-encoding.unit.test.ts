import { describe, expect, it } from 'vitest'

import { getManifestUrl } from '../supabase/functions/_backend/utils/downloadUrl.ts'

describe('manifest path encoding', () => {
  it.concurrent.each([
    {
      label: 'legacy encoded file_name',
      fileName: 'assets/suite-marketing/images/social-media/sad_post_grey%402x.png',
    },
    {
      label: 'new raw file_name',
      fileName: 'assets/suite-marketing/images/social-media/sad_post_grey@2x.png',
    },
  ])('preserves manifest response fields for $label', ({ fileName }) => {
    const context = {
      req: {
        url: 'https://example.com/updates',
        header: () => undefined,
      },
      get: () => 'test-request',
    }
    const manifest = getManifestUrl(context as any, 123, [{
      file_name: fileName,
      file_hash: 'hash',
      s3_path: 'orgs/org-id/apps/com.test.app/delta/hash_sad_post_grey%402x.png',
    }], 'device-id')

    expect(manifest[0].file_name).toBe(fileName)
    expect(manifest[0].download_url).toContain('hash_sad_post_grey%402x.png')
  })
})
