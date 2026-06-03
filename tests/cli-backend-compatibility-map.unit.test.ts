import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkCompatibilityNativePackages, createSupabaseClient, getCompatibilityDetails, mapBackendCompatibilityResponse } from '../cli/src/utils.ts'

function fetchUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === 'string')
    return input
  if (input instanceof URL)
    return input.href
  return input.url
}

describe('CLI backend compatibility response mapping', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it.concurrent('maps backend package comparisons to CLI compatibility entries', () => {
    const [entry] = mapBackendCompatibilityResponse({
      comparisons: [
        {
          name: '@capacitor/camera',
          candidateVersion: '6.0.0',
          baselineVersion: '5.0.0',
          candidateIosChecksum: 'ios-new',
          baselineIosChecksum: 'ios-old',
          candidateAndroidChecksum: 'android-new',
          baselineAndroidChecksum: 'android-old',
        },
      ],
    })

    expect(entry).toEqual({
      name: '@capacitor/camera',
      localVersion: '6.0.0',
      remoteVersion: '5.0.0',
      localIosChecksum: 'ios-new',
      remoteIosChecksum: 'ios-old',
      localAndroidChecksum: 'android-new',
      remoteAndroidChecksum: 'android-old',
    })
    expect(getCompatibilityDetails(entry).compatible).toBe(false)
  })

  it.concurrent('keeps removed remote packages OTA-compatible in the CLI shape', () => {
    const [entry] = mapBackendCompatibilityResponse({
      comparisons: [
        {
          name: '@capacitor/camera',
          baselineVersion: '5.0.0',
        },
      ],
    })

    expect(entry).toEqual({
      name: '@capacitor/camera',
      localVersion: undefined,
      remoteVersion: '5.0.0',
      localIosChecksum: undefined,
      remoteIosChecksum: undefined,
      localAndroidChecksum: undefined,
      remoteAndroidChecksum: undefined,
    })
    expect(getCompatibilityDetails(entry).compatible).toBe(true)
  })

  it('uses capgkey-only auth for the backend compatibility endpoint', async () => {
    const fetchCalls: { url: string, init?: Parameters<typeof fetch>[1] }[] = []
    const fetchMock = vi.fn(async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const url = fetchUrl(input)
      fetchCalls.push({ url, init })

      if (url.endsWith('/private/config')) {
        return Response.json({
          host: 'https://capgo.test',
          hostApi: 'https://api.capgo.test',
          hostFilesApi: 'https://files.capgo.test',
          hostWeb: 'https://console.capgo.test',
        })
      }

      if (url.includes('/rest/v1/channels')) {
        return Response.json({
          version: {
            id: 123,
          },
        })
      }

      if (url === 'https://supabase.test/functions/v1/private/bundle_compatibility/compare') {
        return Response.json({
          comparisons: [
            {
              name: '@capacitor/camera',
              candidateVersion: '6.0.0',
              baselineVersion: '5.0.0',
            },
          ],
        })
      }

      throw new Error(`Unexpected fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const supabase = await createSupabaseClient('capgo-api-key', 'https://supabase.test', 'anon-key', true)
    const result = await checkCompatibilityNativePackages(
      supabase,
      'com.test.app',
      'production',
      [{ name: '@capacitor/camera', version: '6.0.0' }],
    )

    expect(result.finalCompatibility).toEqual([
      {
        name: '@capacitor/camera',
        localVersion: '6.0.0',
        remoteVersion: '5.0.0',
        localIosChecksum: undefined,
        remoteIosChecksum: undefined,
        localAndroidChecksum: undefined,
        remoteAndroidChecksum: undefined,
      },
    ])

    const compatibilityRequest = fetchCalls.find(call => call.url === 'https://supabase.test/functions/v1/private/bundle_compatibility/compare')
    expect(compatibilityRequest).toBeDefined()
    const headers = new Headers(compatibilityRequest?.init?.headers)
    expect(headers.get('capgkey')).toBe('capgo-api-key')
    expect(headers.has('Authorization')).toBe(false)
    expect(headers.has('apikey')).toBe(false)
    expect(JSON.parse(compatibilityRequest?.init?.body as string)).toEqual({
      appId: 'com.test.app',
      candidate: {
        nativePackages: [{ name: '@capacitor/camera', version: '6.0.0' }],
      },
      baseline: {
        bundleId: 123,
      },
    })
  })
})
