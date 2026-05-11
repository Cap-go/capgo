import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchStoreMetadata } from '../supabase/functions/_backend/public/app/store_metadata.ts'

async function getRejectedCause(action: () => Promise<unknown>) {
  try {
    await action()
  }
  catch (error) {
    return (error as Error & { cause?: any }).cause
  }
  throw new Error('Expected action to throw')
}

describe('store metadata error redaction', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('does not echo invalid raw store URLs in error details', async () => {
    const cause = await getRejectedCause(() => fetchStoreMetadata({} as any, {
      url: 'https://example.com/reset?token=secret',
    }))

    expect(cause.error).toBe('invalid_url')
    expect(cause.moreInfo).toEqual({})
    expect(JSON.stringify(cause)).not.toContain('https://example.com/reset')
    expect(JSON.stringify(cause)).not.toContain('token=')
    expect(JSON.stringify(cause)).not.toContain('secret')
  })

  it('keeps only safe fetch failure metadata for allowed store URLs', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })))

    const cause = await getRejectedCause(() => fetchStoreMetadata({} as any, {
      url: 'https://play.google.com/store/apps/details?id=com.app&token=secret',
    }))

    expect(cause.error).toBe('cannot_fetch_store_metadata')
    expect(cause.moreInfo).toEqual({
      host: 'play.google.com',
      status: 404,
    })
    expect(JSON.stringify(cause)).not.toContain('com.app')
    expect(JSON.stringify(cause)).not.toContain('token=')
    expect(JSON.stringify(cause)).not.toContain('secret')
  })
})
