import { afterEach, describe, expect, it, vi } from 'vitest'

import { websitePreviewTestUtils } from '../supabase/functions/_backend/private/website_preview.ts'

const { fetchIconDataUrl } = websitePreviewTestUtils

function dnsResponse(ip: string) {
  return new Response(JSON.stringify({ Answer: [{ data: ip }] }), {
    headers: { 'content-type': 'application/dns-json' },
  })
}

function emptyDnsResponse() {
  return new Response(JSON.stringify({ Answer: [] }), {
    headers: { 'content-type': 'application/dns-json' },
  })
}

function mockPublicDnsThenIconResponse(iconResponse: Response) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = input.toString()
    if (url.includes('cloudflare-dns.com') && url.includes('type=A'))
      return dnsResponse('93.184.216.34')
    if (url.includes('cloudflare-dns.com') && url.includes('type=AAAA'))
      return emptyDnsResponse()
    return iconResponse
  })
}

describe('website preview icon fetch limit', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns an icon data URL for bounded image responses', async () => {
    vi.stubGlobal('fetch', mockPublicDnsThenIconResponse(new Response(new Uint8Array([1, 2, 3]), {
      headers: { 'content-type': 'image/png' },
    })))

    await expect(fetchIconDataUrl('https://example.com/favicon.png')).resolves.toBe('data:image/png;base64,AQID')
  })

  it('rejects oversized icon responses from content-length', async () => {
    vi.stubGlobal('fetch', mockPublicDnsThenIconResponse(new Response(new Uint8Array([1]), {
      headers: {
        'content-length': `${512 * 1024 + 1}`,
        'content-type': 'image/png',
      },
    })))

    await expect(fetchIconDataUrl('https://example.com/favicon.png')).resolves.toBeNull()
  })

  it('rejects chunked icon responses that grow past the icon cap', async () => {
    const chunk = new Uint8Array(256 * 1024)
    let cancelled = false
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(chunk)
      },
      cancel() {
        cancelled = true
      },
    })

    vi.stubGlobal('fetch', mockPublicDnsThenIconResponse(new Response(body, {
      headers: { 'content-type': 'image/png' },
    })))

    await expect(fetchIconDataUrl('https://example.com/favicon.png')).resolves.toBeNull()
    expect(cancelled).toBe(true)
  })
})
