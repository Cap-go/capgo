import { describe, expect, it } from 'vitest'
import { getCreateAppBodyMetadata, post } from '../supabase/functions/_backend/public/app/post.ts'

async function getRejectedCause(action: () => Promise<unknown>) {
  try {
    await action()
  }
  catch (error) {
    return (error as Error & { cause?: any }).cause
  }
  throw new Error('Expected action to throw')
}

describe('create app error redaction', () => {
  it('summarizes create-app bodies without exposing raw identifiers or URLs', () => {
    const metadata = getCreateAppBodyMetadata({
      app_id: 'com.secret.app',
      name: 'Secret App',
      owner_org: 'secret-org-id',
      icon: 'orgs/secret/icon.png',
      ios_store_url: 'https://apps.apple.com/app/secret',
      android_store_url: 'https://play.google.com/store/apps/details?id=com.secret.app',
      unexpected_secret: 'raw-secret-value',
    })

    expect(metadata).toEqual({
      fieldCount: 7,
      hasBody: true,
      presentFields: [
        'android_store_url',
        'app_id',
        'icon',
        'ios_store_url',
        'name',
        'owner_org',
      ],
      unknownFieldCount: 1,
    })
    expect(JSON.stringify(metadata)).not.toContain('com.secret.app')
    expect(JSON.stringify(metadata)).not.toContain('Secret App')
    expect(JSON.stringify(metadata)).not.toContain('secret-org-id')
    expect(JSON.stringify(metadata)).not.toContain('raw-secret-value')
    expect(JSON.stringify(metadata)).not.toContain('apps.apple.com')
    expect(JSON.stringify(metadata)).not.toContain('play.google.com')
  })

  it('handles missing bodies without throwing', () => {
    expect(getCreateAppBodyMetadata(null)).toEqual({ hasBody: false })
  })

  it('uses body metadata in create-app validation errors', async () => {
    const cause = await getRejectedCause(() => post({} as any, {
      app_id: 'com.secret.app',
      owner_org: 'secret-org-id',
      ios_store_url: 'https://apps.apple.com/app/secret',
    } as any))

    expect(cause.error).toBe('missing_name')
    expect(cause.moreInfo).toEqual({
      body: {
        fieldCount: 3,
        hasBody: true,
        presentFields: ['app_id', 'ios_store_url', 'owner_org'],
        unknownFieldCount: 0,
      },
    })
    expect(JSON.stringify(cause.moreInfo)).not.toContain('com.secret.app')
    expect(JSON.stringify(cause.moreInfo)).not.toContain('secret-org-id')
    expect(JSON.stringify(cause.moreInfo)).not.toContain('apps.apple.com')
  })
})
