import { describe, expect, it, vi } from 'vitest'

// Mock dependencies before importing the module under test
vi.mock('../supabase/functions/_backend/utils/hono.ts', () => {
  return {
    quickError: (status: number, code: string, message: string, data?: Record<string, unknown>) => {
      const err: any = new Error(message)
      err.status = status
      err.code = code
      err.data = data ?? null
      return err
    },
  }
})

// Dynamically import after mocks are set up
const { assertAllowedStoreUrl, fetchStoreMetadata } = await import('../supabase/functions/_backend/public/app/store_metadata.ts')

describe('store_metadata URL redaction', () => {
  describe('assertAllowedStoreUrl', () => {
    it('does not echo raw submitted URL in invalid_url error', () => {
      let thrown: any
      try {
        assertAllowedStoreUrl('https://evil.com/steal?data=secret')
      }
      catch (e) {
        thrown = e
      }

      expect(thrown).toBeDefined()
      expect(thrown.code).toBe('invalid_url')
      // Must NOT contain the raw submitted URL
      expect(JSON.stringify(thrown.data ?? {})).not.toContain('evil.com')
      expect(JSON.stringify(thrown.data ?? {})).not.toContain('secret')
      // May expose allowed hosts list
      if (thrown.data?.allowed_hosts) {
        expect(Array.isArray(thrown.data.allowed_hosts)).toBe(true)
      }
    })

    it('returns parsed URL for valid store URL', () => {
      const url = assertAllowedStoreUrl('https://apps.apple.com/us/app/example/id123456789')
      expect(url.hostname).toBe('apps.apple.com')
    })

    it('rejects http URLs without leaking them', () => {
      let thrown: any
      try {
        assertAllowedStoreUrl('http://apps.apple.com/us/app/example/id123')
      }
      catch (e) {
        thrown = e
      }

      expect(thrown).toBeDefined()
      expect(thrown.code).toBe('invalid_url')
      expect(JSON.stringify(thrown.data ?? {})).not.toContain('http://apps.apple.com')
    })
  })

  describe('fetchStoreMetadata invalid_url catch', () => {
    it('does not echo submitted URL when URL is malformed', async () => {
      const mockContext: any = { json: vi.fn() }
      let thrown: any
      try {
        await fetchStoreMetadata(mockContext, { url: 'not-a-valid-url-with-sensitive-data-abc123' })
      }
      catch (e) {
        thrown = e
      }

      expect(thrown).toBeDefined()
      expect(thrown.code).toBe('invalid_url')
      // Must NOT contain the submitted value
      expect(JSON.stringify(thrown.data ?? {})).not.toContain('sensitive-data-abc123')
    })
  })

  describe('fetchStoreMetadata cannot_fetch_store_metadata', () => {
    it('returns host only, not full URL, on fetch failure', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
      } as any)

      const mockContext: any = { json: vi.fn() }
      let thrown: any
      try {
        await fetchStoreMetadata(mockContext, { url: 'https://play.google.com/store/apps/details?id=com.secret.app' })
      }
      catch (e) {
        thrown = e
      }

      expect(thrown).toBeDefined()
      expect(thrown.code).toBe('cannot_fetch_store_metadata')
      expect(thrown.data?.status).toBe(503)
      // Must NOT echo the full URL (which could include query params)
      expect(thrown.data?.url).toBeUndefined()
      // Should only expose the hostname
      expect(thrown.data?.host).toBe('play.google.com')
      // Must NOT contain sensitive query param value
      expect(JSON.stringify(thrown.data ?? {})).not.toContain('com.secret.app')
    })
  })
})
