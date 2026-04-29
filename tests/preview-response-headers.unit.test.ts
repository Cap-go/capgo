import { describe, expect, it } from 'vitest'
import { buildPreviewResponseHeaders } from '../supabase/functions/_backend/files/preview.ts'

describe('preview response headers', () => {
  it.concurrent('keeps bundle preview responses immutable', () => {
    const headers = buildPreviewResponseHeaders('text/html', {
      httpEtag: '"bundle-etag"',
    })

    expect(headers.get('content-type')).toBe('text/html')
    expect(headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
    expect(headers.get('etag')).toBe('"bundle-etag"')
    expect(headers.get('pragma')).toBeNull()
    expect(headers.get('expires')).toBeNull()
  })

  it.concurrent('disables caching for channel preview responses', () => {
    const headers = buildPreviewResponseHeaders('text/html', {
      disableCache: true,
      httpEtag: '"channel-etag"',
    })

    expect(headers.get('content-type')).toBe('text/html')
    expect(headers.get('cache-control')).toBe('no-store, no-cache, must-revalidate, max-age=0')
    expect(headers.get('etag')).toBeNull()
    expect(headers.get('pragma')).toBe('no-cache')
    expect(headers.get('expires')).toBe('0')
  })
})
