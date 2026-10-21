import type { CapgoConfig } from '~/services/console'
import { describe, expect, it } from 'vitest'
import { isLocal, mergeRemoteConfig, PROD_API_URL } from '~/services/console'

describe('console config merging', () => {
  const localConfig: CapgoConfig = {
    apiHost: PROD_API_URL,
    host: 'https://capgo.app',
    hostWeb: 'https://capgo.app',
    stripeEnabled: true,
  }

  it.concurrent('keeps the API host from the local build config', () => {
    const merged = mergeRemoteConfig(localConfig, {
      apiHost: 'https://evil.example.com',
      host: 'https://console.capgo.app',
      hostWeb: 'https://www.capgo.app',
      stripeEnabled: false,
    })

    expect(merged.apiHost).toBe(localConfig.apiHost)
    expect(merged.host).toBe('https://console.capgo.app')
    expect(merged.hostWeb).toBe('https://www.capgo.app')
    expect(merged.stripeEnabled).toBe(false)
  })

  it.concurrent('ignores obsolete remote Apple UI values', () => {
    const remote = { nativeAppleLoginEnabled: true }
    expect(mergeRemoteConfig(localConfig, remote as Partial<CapgoConfig>)).not.toHaveProperty('nativeAppleLoginEnabled')
  })

  it.concurrent('ignores legacy remote Supabase connection fields', () => {
    const remote = { apiHost: 'https://evil.supabase.co', supaKey: 'evil-key', supbaseId: 'evil' }
    const merged = mergeRemoteConfig(localConfig, remote as Partial<CapgoConfig>)
    expect(merged).toEqual(localConfig)
  })

  it.concurrent('falls back to local values when remote config omits optional fields', () => {
    const merged = mergeRemoteConfig(localConfig, {})

    expect(merged).toEqual(localConfig)
  })
})

describe('isLocal', () => {
  it.concurrent('treats only the Capgo cloud API as non-local', () => {
    expect(isLocal(PROD_API_URL)).toBe(false)
    expect(isLocal('https://api.preprod.capgo.app')).toBe(true)
    expect(isLocal('http://localhost:54321/functions/v1')).toBe(true)
  })
})
