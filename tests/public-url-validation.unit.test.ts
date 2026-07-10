import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchPublicUrl,
  getPublicHostnameValidationError,
  getPublicUrlSyntaxValidationError,
} from '../supabase/functions/_backend/utils/publicUrl.ts'

const messages = {
  invalidUrl: 'invalid',
  publicHost: 'public host',
  ipLiteral: 'ip literal',
  https: 'https',
  dnsResolution: 'dns',
  fetchFailed: 'fetch failed',
  tooManyRedirects: 'too many redirects',
}

function dnsResponse(records: string[]) {
  return new Response(JSON.stringify({
    Answer: records.map(data => ({ data })),
  }))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('public outbound URL validation', () => {
  it.concurrent('rejects non-public URL syntax before DNS lookup', () => {
    expect(getPublicUrlSyntaxValidationError('https://localhost/webhook', { messages })).toBe('public host')
    expect(getPublicUrlSyntaxValidationError('https://127.0.0.1/webhook', { messages })).toBe('ip literal')
    expect(getPublicUrlSyntaxValidationError('http://example.com/webhook', { messages })).toBe('https')
  })

  it('blocks hosts that resolve to private IPv4 or IPv6 addresses', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input))
      const name = url.searchParams.get('name')
      const type = url.searchParams.get('type')

      if (name === 'private.example' && type === 'A')
        return dnsResponse(['169.254.169.254'])
      if (name === 'private6.example' && type === 'AAAA')
        return dnsResponse(['fd00::1'])

      return dnsResponse([])
    }))

    await expect(getPublicHostnameValidationError('https://private.example/webhook', { messages })).resolves.toBe('public host')
    await expect(getPublicHostnameValidationError('https://private6.example/webhook', { messages })).resolves.toBe('public host')
  })

  it('can treat missing DNS answers as either allowed or invalid', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => dnsResponse([])))

    await expect(getPublicHostnameValidationError('https://unresolved.example/webhook', {
      messages,
      requireDnsResolution: false,
    })).resolves.toBeNull()
    await expect(getPublicHostnameValidationError('https://unresolved.example/webhook', {
      messages,
      requireDnsResolution: true,
    })).resolves.toBe('dns')
  })

  it('revalidates redirect targets before following them', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const urlString = String(input)
      const url = new URL(urlString)

      if (url.hostname === 'cloudflare-dns.com') {
        const name = url.searchParams.get('name')
        if (name === 'safe.example')
          return dnsResponse(['93.184.216.34'])
        if (name === 'private.example')
          return dnsResponse(['127.0.0.1'])
        return dnsResponse([])
      }

      if (urlString === 'https://safe.example/')
        return new Response('', { status: 302, headers: { location: 'https://private.example/' } })

      return new Response('should not fetch', { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchPublicUrl('https://safe.example/', undefined, {
      messages,
      requireDnsResolution: true,
    })

    expect(result).toMatchObject({
      error: 'public host',
      response: null,
      finalUrl: null,
    })
    expect(fetchMock.mock.calls.some(([url]) => url === 'https://private.example/')).toBe(false)
  })
})
