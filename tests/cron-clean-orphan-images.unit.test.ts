import { describe, expect, it } from 'vitest'
import { getStaleOrgLogoPaths } from '../supabase/functions/_backend/triggers/cron_clean_orphan_images.ts'

describe('getStaleOrgLogoPaths', () => {
  it.concurrent('preserves the linked org logo file and removes only stale files', () => {
    const result = getStaleOrgLogoPaths(
      'org-123',
      [
        { id: '1', name: 'current.png' },
        { id: '2', name: 'older.png' },
        { id: null, name: 'nested-folder' },
      ],
      'org/org-123/logo/current.png',
    )

    expect(result).toEqual([
      'org/org-123/logo/older.png',
    ])
  })

  it.concurrent('treats signed logo URLs as the linked file path', () => {
    const result = getStaleOrgLogoPaths(
      'org-456',
      [
        { id: '1', name: 'facebook.com.png' },
        { id: '2', name: 'fallback.png' },
      ],
      'https://sb.capgo.app/storage/v1/object/sign/images/org/org-456/logo/facebook.com.png?token=abc',
    )

    expect(result).toEqual([
      'org/org-456/logo/fallback.png',
    ])
  })

  it.concurrent('decodes signed logo URLs before comparing file names', () => {
    const result = getStaleOrgLogoPaths(
      'org-456',
      [
        { id: '1', name: 'company logo.png' },
        { id: '2', name: 'fallback.png' },
      ],
      'https://sb.capgo.app/storage/v1/object/sign/images/org/org-456/logo/company%20logo.png?token=abc',
    )

    expect(result).toEqual([
      'org/org-456/logo/fallback.png',
    ])
  })

  it.concurrent('treats raw logo paths with a leading /images prefix as the linked file path', () => {
    const result = getStaleOrgLogoPaths(
      'org-123',
      [
        { id: '1', name: 'current.png' },
        { id: '2', name: 'older.png' },
      ],
      '/images/org/org-123/logo/current.png',
    )

    expect(result).toEqual([
      'org/org-123/logo/older.png',
    ])
  })

  it.concurrent('deletes all org logo files when no linked logo remains in the org row', () => {
    const result = getStaleOrgLogoPaths(
      'org-789',
      [
        { id: '1', name: 'first.png' },
        { id: '2', name: 'second.png' },
      ],
      null,
    )

    expect(result).toEqual([
      'org/org-789/logo/first.png',
      'org/org-789/logo/second.png',
    ])
  })
})
