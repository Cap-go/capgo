import { describe, expect, it } from 'vitest'
import { getDeleteFailedVersionBodyMetadata } from '../supabase/functions/_backend/private/delete_failed_version.ts'

describe('delete failed version request metadata', () => {
  it('summarizes request body presence without retaining raw values', () => {
    const metadata = getDeleteFailedVersionBodyMetadata({
      app_id: 'com.example.secret-app',
      name: '1.2.3-private-build',
    })

    expect(metadata).toEqual({
      hasAppId: true,
      hasName: true,
    })
    expect(JSON.stringify(metadata)).not.toContain('com.example.secret-app')
    expect(JSON.stringify(metadata)).not.toContain('1.2.3-private-build')
  })

  it('marks missing body fields without including the original body', () => {
    expect(getDeleteFailedVersionBodyMetadata({ app_id: 'com.example.app' })).toEqual({
      hasAppId: true,
      hasName: false,
    })
  })
})
