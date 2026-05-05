import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('i18n fallback loading', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubGlobal('localStorage', {
      clear: vi.fn(),
      getItem: vi.fn(() => null),
      removeItem: vi.fn(),
      setItem: vi.fn(),
    })
    vi.stubGlobal('document', {
      createElement: vi.fn(() => ({
        innerHTML: '',
      })),
      documentElement: {
        setAttribute: vi.fn(),
      },
    })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 503 })))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('keeps the English fallback bundle when runtime translation is unavailable', async () => {
    const { i18n, loadLanguageAsync } = await import('../src/modules/i18n.ts')

    await loadLanguageAsync('fr')

    expect(i18n.global.locale.value).toBe('fr')
    expect(i18n.global.t('credits-plan-overage', {
      included: 'Included in plan',
      price: '$0.08 per minute',
    })).toBe('Included in plan, then $0.08 per minute')
  })

  it('retries message catalog translation after a transient 503', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        messages: {
          account: 'Compte',
        },
      }), {
        headers: {
          'Content-Type': 'application/json',
        },
        status: 200,
      }))
    vi.stubGlobal('fetch', fetchMock)

    const { loadLanguageAsync, translateMessage } = await import('../src/modules/i18n.ts')

    await loadLanguageAsync('fr')
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(translateMessage('account')).toBe('Compte')
  })
})
