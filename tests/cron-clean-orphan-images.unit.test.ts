import { describe, expect, it } from 'vitest'
import { getStaleOrgLogoPaths, runWithDeadline } from '../supabase/functions/_backend/triggers/cron_clean_orphan_images.ts'

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

describe('runWithDeadline', () => {
  it.concurrent('processes every item before the deadline with bounded concurrency', async () => {
    let active = 0
    let maxActive = 0
    const seen: number[] = []
    const started = await runWithDeadline([1, 2, 3, 4, 5], async (item) => {
      active++
      maxActive = Math.max(maxActive, active)
      await new Promise(resolve => setTimeout(resolve, 1))
      seen.push(item)
      active--
    }, { concurrency: 2, deadline: Date.now() + 60_000 })

    expect(started).toBe(5)
    expect(seen.sort()).toEqual([1, 2, 3, 4, 5])
    expect(maxActive).toBe(2)
  })

  it.concurrent('stops starting items once the deadline passes', async () => {
    let clock = 0
    const seen: number[] = []
    const started = await runWithDeadline([1, 2, 3, 4], async (item) => {
      seen.push(item)
      clock += 10
    }, { concurrency: 1, deadline: 15, now: () => clock })

    expect(started).toBe(2)
    expect(seen).toEqual([1, 2])
  })
})
