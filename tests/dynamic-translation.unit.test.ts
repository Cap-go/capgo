import type { ProtectedEntry } from '../supabase/functions/_backend/public/translation.ts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getWorkerLanguageCode,
  isKnownSourceText,
  loadLanguageAsync,
  normalizeLanguage,
  resetDynamicTranslationRuntimeStateForTests,
  translateMessage,
} from '../src/modules/i18n'
import { changeLanguage } from '../src/services/i18n'
import {
  assertTranslatedBatch,
  normalizeTranslationMessages,
  normalizeTranslationStrings,
  parseSegmentedTranslation,
  protectTranslationTokens,
  restoreTranslationTokens,
} from '../supabase/functions/_backend/public/translation.ts'

const originalFetch = globalThis.fetch
const originalWindow = globalThis.window
const originalLocalStorage = globalThis.localStorage

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  resetDynamicTranslationRuntimeStateForTests()
  if (originalFetch === undefined)
    Reflect.deleteProperty(globalThis, 'fetch')
  else
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: originalFetch })
  if (originalWindow === undefined)
    Reflect.deleteProperty(globalThis, 'window')
  else
    Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow })

  if (originalLocalStorage === undefined)
    Reflect.deleteProperty(globalThis, 'localStorage')
  else
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: originalLocalStorage })
})

describe('dynamic translation language selection', () => {
  it.concurrent('normalizes legacy and regional language codes into supported locales', () => {
    expect(normalizeLanguage('pt-BR')).toBe('pt')
    expect(normalizeLanguage('zh')).toBe('zh-cn')
    expect(normalizeLanguage('iw')).toBe('he')
    expect(normalizeLanguage('unknown-locale')).toBe('en')
  })

  it.concurrent('maps UI locales to Workers AI language codes', () => {
    expect(getWorkerLanguageCode('zh-cn')).toBe('zh')
    expect(getWorkerLanguageCode('pt')).toBe('pt')
    expect(getWorkerLanguageCode('en')).toBe('en')
  })

  it.concurrent('only treats approved source strings as safe translation inputs', () => {
    expect(isKnownSourceText('Bundle download completed')).toBe(true)
    expect(isKnownSourceText('2 minutes ago')).toBe(true)
    expect(isKnownSourceText('Please wait 2 minutes before resending the invitation.')).toBe(true)
    expect(isKnownSourceText('Scan QR code')).toBe(true)
    expect(isKnownSourceText('You have requested your account to be deleted')).toBe(true)
    expect(isKnownSourceText('Successfully granted 10 credits to Acme')).toBe(false)
    expect(isKnownSourceText('Acme Corp internal metrics')).toBe(false)
  })

  it('only reloads when callers opt in', async () => {
    const reload = vi.fn()
    const localStorageMock = {
      clear: vi.fn(),
      getItem: vi.fn(() => null),
      key: vi.fn(() => null),
      length: 0,
      removeItem: vi.fn(),
      setItem: vi.fn(),
    } as unknown as Storage

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { location: { reload } } as unknown as Window,
    })
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: localStorageMock,
    })

    await loadLanguageAsync('en')
    await changeLanguage('fr')
    expect(reload).not.toHaveBeenCalled()

    await changeLanguage('de', { reload: true })
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('loads translated runtime message catalogs and reuses the cached bundle', async () => {
    const storage = new Map<string, string>()
    const localStorageMock = {
      clear: vi.fn(() => storage.clear()),
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      key: vi.fn(() => null),
      length: 0,
      removeItem: vi.fn((key: string) => storage.delete(key)),
      setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
    } as unknown as Storage
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        messages: {
          account: 'Compte',
          'personal-information': 'Renseignement personnel',
        },
      }),
    }))

    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: fetchMock,
    })
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: localStorageMock,
    })

    await loadLanguageAsync('fr')
    expect(translateMessage('account')).toBe('Compte')
    expect(translateMessage('personal-information')).toBe('Renseignement personnel')
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await loadLanguageAsync('en')
    fetchMock.mockClear()

    await loadLanguageAsync('fr')
    expect(translateMessage('account')).toBe('Compte')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('keeps the full background catalog request running past the priority timeout', async () => {
    vi.useFakeTimers()

    const storage = new Map<string, string>()
    const localStorageMock = {
      clear: vi.fn(() => storage.clear()),
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      key: vi.fn(() => null),
      length: 0,
      removeItem: vi.fn((key: string) => storage.delete(key)),
      setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
    } as unknown as Storage
    let fullCatalogSignal: AbortSignal | undefined
    let fetchCount = 0
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      fetchCount += 1
      if (fetchCount === 1) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ messages: { account: 'Compte' } }),
        } as unknown as Response)
      }

      fullCatalogSignal = init?.signal ?? undefined
      return new Promise<Response>(() => {})
    })

    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: fetchMock,
    })
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: localStorageMock,
    })

    translateMessage('account')
    await loadLanguageAsync('fr')
    expect(fetchMock).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(10_001)
    expect(fullCatalogSignal).toBeUndefined()
  })
})

describe('dynamic translation worker helpers', () => {
  it.concurrent('allows unchanged output when the target language is English', () => {
    const unchangedMessages = ['Account', 'Settings', 'Billing']

    expect(() => assertTranslatedBatch('English', unchangedMessages, unchangedMessages)).not.toThrow()
    expect(() => assertTranslatedBatch('French', unchangedMessages, unchangedMessages)).toThrow(/left 3\/3/)
  })

  it.concurrent('preserves exact page string keys while bounding translation input', () => {
    expect(normalizeTranslationStrings([
      '  Settings  ',
      'Settings',
      '',
      'https://capgo.app',
      'Bundle uploads',
    ])).toEqual([
      '  Settings  ',
      'Settings',
      'https://capgo.app',
      'Bundle uploads',
    ])
  })

  it.concurrent('keeps keyed message bundles intact for catalog translation', () => {
    expect(normalizeTranslationMessages({
      account: 'Account',
      empty: '',
      nested: { skip: true },
      'personal-information': 'Personal Information',
    })).toEqual({
      account: 'Account',
      'personal-information': 'Personal Information',
    })
  })

  it.concurrent('protects and restores inline placeholders and commands', () => {
    const source = 'Run bunx @capgo/cli@latest bundle compatibility for {bundle} and email support@capgo.app'
    const protectedTokens = protectTranslationTokens(source)

    expect(protectedTokens.protectedText).toContain('__CAPGO_TOKEN_0__')
    expect(protectedTokens.protectedText).toContain('__CAPGO_TOKEN_1__')

    const restored = restoreTranslationTokens(protectedTokens.protectedText, protectedTokens.tokens)
    expect(restored).toBe(source)
  })

  it.concurrent('parses segmented model output back into per-string translations', () => {
    const first = protectTranslationTokens('Open settings for {app}')
    const second = protectTranslationTokens('Bundle uploads')
    const entries: ProtectedEntry[] = [
      {
        marker: '[[CAPGO_SEGMENT_0000]]',
        protectedText: first.protectedText,
        source: 'Open settings for {app}',
        tokens: first.tokens,
      },
      {
        marker: '[[CAPGO_SEGMENT_0001]]',
        protectedText: second.protectedText,
        source: 'Bundle uploads',
        tokens: second.tokens,
      },
    ]

    const parsed = parseSegmentedTranslation([
      '[[CAPGO_SEGMENT_0000]]',
      'Abrir ajustes para __CAPGO_TOKEN_0__',
      '',
      '[[CAPGO_SEGMENT_0001]]',
      'Cargas de bundles',
    ].join('\n'), entries)

    expect(parsed.get('Open settings for {app}')).toBe('Abrir ajustes para {app}')
    expect(parsed.get('Bundle uploads')).toBe('Cargas de bundles')
  })

  it.concurrent('falls back to the source text when a later marker is missing', () => {
    const first = protectTranslationTokens('Open settings for {app}')
    const second = protectTranslationTokens('Bundle uploads')
    const entries: ProtectedEntry[] = [
      {
        marker: '[[CAPGO_SEGMENT_0000]]',
        protectedText: first.protectedText,
        source: 'Open settings for {app}',
        tokens: first.tokens,
      },
      {
        marker: '[[CAPGO_SEGMENT_0001]]',
        protectedText: second.protectedText,
        source: 'Bundle uploads',
        tokens: second.tokens,
      },
    ]

    const parsed = parseSegmentedTranslation([
      '[[CAPGO_SEGMENT_0000]]',
      'Abrir ajustes para __CAPGO_TOKEN_0__',
    ].join('\n'), entries)

    expect(parsed.get('Open settings for {app}')).toBe('Open settings for {app}')
    expect(parsed.get('Bundle uploads')).toBe('Bundle uploads')
  })
})
