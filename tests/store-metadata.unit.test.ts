import { afterEach, describe, expect, it, vi } from 'vitest'

import { fetchStoreMetadata } from '../supabase/functions/_backend/public/app/store_metadata.ts'

function createContext() {
  return {
    json: (body: unknown) => Response.json(body),
  } as any
}

function storeHtml(iconUrl: string) {
  return `
    <html>
      <head>
        <meta property="og:title" content="Capgo Test App">
        <meta property="og:image" content="${iconUrl}">
      </head>
      <body></body>
    </html>
  `
}

function mockStoreMetadataFetch(iconResponse: Response) {
  const iconUrl = 'https://play-lh.googleusercontent.com/icon.png'
  const fetchMock = vi.fn(async (url: string) => {
    if (url.startsWith('https://play.google.com/')) {
      return new Response(storeHtml(iconUrl), {
        headers: { 'content-type': 'text/html' },
      })
    }

    return iconResponse
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function fetchPlayStoreMetadata() {
  const response = await fetchStoreMetadata(createContext(), {
    url: 'https://play.google.com/store/apps/details?id=app.capgo.test',
  })
  return response.json() as Promise<{ icon_data_url: string | null }>
}

describe('store metadata icon fetching', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('does not buffer oversized icon responses', async () => {
    const fetchMock = mockStoreMetadataFetch(
      new Response('too large', {
        headers: {
          'content-length': String(512 * 1024 + 1),
          'content-type': 'image/png',
        },
      }),
    )
    const body = await fetchPlayStoreMetadata()

    expect(body.icon_data_url).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('keeps small allowlisted icon responses', async () => {
    mockStoreMetadataFetch(
      new Response(new Uint8Array([1, 2, 3]), {
        headers: { 'content-type': 'image/png' },
      }),
    )
    const body = await fetchPlayStoreMetadata()

    expect(body.icon_data_url).toBe('data:image/png;base64,AQID')
  })
})
