import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/services/supabase', () => ({
  defaultApiHost: 'https://api.capgo.test',
}))

function createStorageMock() {
  const store = new Map<string, string>()

  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value)
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key)
    }),
  }
}

describe('i18n locale loader', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    vi.unstubAllGlobals()

    vi.stubGlobal('fetch', vi.fn())
    vi.stubGlobal('localStorage', createStorageMock())
  })

  it('keeps English in the frontend bundle without fetching it from the backend', async () => {
    const { i18n, loadLanguageAsync } = await import('../src/modules/i18n.ts')

    await loadLanguageAsync('en')

    expect(fetch).not.toHaveBeenCalled()
    expect(i18n.global.locale.value).toBe('en')
    expect(i18n.global.t('accept-invitation')).toBe('Accept Invitation')
  })

  it('falls back to the current locale when backend locale loading fails', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
    } as Response)

    const { i18n, loadLanguageAsync } = await import('../src/modules/i18n.ts')

    await loadLanguageAsync('fr')

    expect(fetch).toHaveBeenCalledWith('https://api.capgo.test/translations/fr', {
      headers: {
        Accept: 'application/json',
      },
    })
    expect(i18n.global.locale.value).toBe('en')
    expect(i18n.global.t('accept-invitation')).toBe('Accept Invitation')
  })

  it('keeps the latest locale selection when async fetches resolve out of order', async () => {
    let resolveFrench: ((value: Response) => void) | undefined
    let resolveGerman: ((value: Response) => void) | undefined

    vi.mocked(fetch).mockImplementation((url) => {
      const requestUrl = String(url)

      if (requestUrl.endsWith('/translations/fr')) {
        return new Promise((resolve) => {
          resolveFrench = resolve
        })
      }

      if (requestUrl.endsWith('/translations/de')) {
        return new Promise((resolve) => {
          resolveGerman = resolve
        })
      }

      throw new Error(`Unexpected locale request: ${requestUrl}`)
    })

    const { i18n, loadLanguageAsync } = await import('../src/modules/i18n.ts')

    const frenchLoad = loadLanguageAsync('fr')
    const germanLoad = loadLanguageAsync('de')

    resolveGerman?.({
      ok: true,
      json: vi.fn().mockResolvedValue({
        'accept-invitation': 'Einladung annehmen',
      }),
    } as unknown as Response)
    await germanLoad

    resolveFrench?.({
      ok: true,
      json: vi.fn().mockResolvedValue({
        'accept-invitation': 'Accepter l\'invitation',
      }),
    } as unknown as Response)
    await frenchLoad

    expect(i18n.global.locale.value).toBe('de')
    expect(i18n.global.t('accept-invitation')).toBe('Einladung annehmen')
  })
})
