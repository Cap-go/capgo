import { describe, expect, it } from 'vitest'
import { APP_TOO_LARGE_BENTO_EVENT, APP_TOO_LARGE_EVENT, buildAppTooLargeBentoEvent } from '../supabase/functions/_backend/utils/app_too_large_tracking.ts'

const base = {
  event: APP_TOO_LARGE_EVENT,
  orgId: 'org-1',
  appId: 'com.demo.app',
  orgName: 'Demo Org',
  appName: 'Demo',
  tags: {
    size_mb: 42,
    bundle_size_mb: 42,
    threshold_mb: 20,
    recommended_size_mb: 20,
  },
}

describe('buildAppTooLargeBentoEvent', () => {
  it.concurrent('builds a Bento payload for App Too Large', () => {
    expect(buildAppTooLargeBentoEvent(base)).toEqual({
      cron: '* * * * *',
      event: APP_TOO_LARGE_BENTO_EVENT,
      preferenceKey: 'app_too_large',
      uniqId: 'app_too_large:com.demo.app',
      data: {
        org_id: 'org-1',
        org_name: 'Demo Org',
        app_id: 'com.demo.app',
        app_name: 'Demo',
        size_mb: 42,
        bundle_size_mb: 42,
        threshold_mb: 20,
        recommended_size_mb: 20,
      },
    })
  })

  it.concurrent('parses bundle size from legacy size_mb tag only', () => {
    const result = buildAppTooLargeBentoEvent({
      ...base,
      tags: { size_mb: '21', threshold_mb: 20, recommended_size_mb: 20 },
    })
    expect(result?.data.size_mb).toBe(21)
    expect(result?.data.bundle_size_mb).toBe(21)
  })

  it.concurrent('prefers bundle_size_mb over size_mb when both are present', () => {
    const result = buildAppTooLargeBentoEvent({
      ...base,
      tags: { size_mb: 10, bundle_size_mb: 25, threshold_mb: 20, recommended_size_mb: 20 },
    })
    expect(result?.data.bundle_size_mb).toBe(25)
    expect(result?.data.size_mb).toBe(25)
  })

  it.concurrent('defaults threshold and recommended size when tags are missing', () => {
    const result = buildAppTooLargeBentoEvent({ ...base, tags: { size_mb: 42 } })
    expect(result?.data.threshold_mb).toBe(20)
    expect(result?.data.recommended_size_mb).toBe(20)
  })

  it.concurrent('omits bundle size fields when the tag is missing or invalid', () => {
    expect(buildAppTooLargeBentoEvent({ ...base, tags: { threshold_mb: 20, recommended_size_mb: 20 } })?.data).not.toHaveProperty('size_mb')
    expect(buildAppTooLargeBentoEvent({ ...base, tags: { threshold_mb: 20, recommended_size_mb: 20 } })?.data).not.toHaveProperty('bundle_size_mb')
    expect(buildAppTooLargeBentoEvent({ ...base, tags: { size_mb: 'nope', threshold_mb: 20 } })?.data).not.toHaveProperty('size_mb')
    expect(buildAppTooLargeBentoEvent({ ...base, tags: { size_mb: '   ', threshold_mb: 20 } })?.data).not.toHaveProperty('bundle_size_mb')
    expect(buildAppTooLargeBentoEvent({ ...base, tags: { size_mb: -1, threshold_mb: 20 } })?.data).not.toHaveProperty('size_mb')
  })

  it.concurrent('returns undefined for other event names', () => {
    expect(buildAppTooLargeBentoEvent({ ...base, event: 'Bundle Incompatible' })).toBeUndefined()
  })

  it.concurrent('returns undefined when org or app id is missing', () => {
    expect(buildAppTooLargeBentoEvent({ ...base, orgId: undefined })).toBeUndefined()
    expect(buildAppTooLargeBentoEvent({ ...base, appId: undefined })).toBeUndefined()
  })

  it.concurrent('defaults missing org and app names to empty strings', () => {
    const result = buildAppTooLargeBentoEvent({
      event: APP_TOO_LARGE_EVENT,
      orgId: 'org-1',
      appId: 'com.demo.app',
      tags: { size_mb: 30 },
    })
    expect(result?.data.org_name).toBe('')
    expect(result?.data.app_name).toBe('')
    expect(result?.data.org_id).toBe('org-1')
    expect(result?.data.app_id).toBe('com.demo.app')
    expect(result?.data.threshold_mb).toBe(20)
    expect(result?.data.recommended_size_mb).toBe(20)
  })
})
