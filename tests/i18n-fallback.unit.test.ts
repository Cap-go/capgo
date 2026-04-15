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
      querySelector: vi.fn(() => ({
        setAttribute: vi.fn(),
      })),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it.concurrent('loads the English fallback bundle before switching to another locale', async () => {
    const { i18n, loadLanguageAsync } = await import('../src/modules/i18n.ts')

    await loadLanguageAsync('fr')

    expect(i18n.global.availableLocales).toEqual(expect.arrayContaining(['en', 'fr']))
    expect(i18n.global.locale.value).toBe('fr')
    expect(i18n.global.t('credits-plan-overage', {
      included: 'Included in plan',
      price: '$0.08 per minute',
    })).toBe('Included in plan, then $0.08 per minute')
  })
})
