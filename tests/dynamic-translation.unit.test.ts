import { afterEach, describe, expect, it, vi } from 'vitest'
import { getWorkerLanguageCode, isKnownSourceText, normalizeLanguage } from '../src/modules/i18n'
import { loadLanguageAsync } from '../src/modules/i18n'
import { changeLanguage } from '../src/services/i18n'
import type { ProtectedEntry } from '../supabase/functions/_backend/public/translation.ts'
import {
  normalizeTranslationStrings,
  parseSegmentedTranslation,
  protectTranslationTokens,
  restoreTranslationTokens,
} from '../supabase/functions/_backend/public/translation.ts'

const originalWindow = globalThis.window
const originalLocalStorage = globalThis.localStorage

afterEach(() => {
  vi.restoreAllMocks()
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
    expect(isKnownSourceText('Bundle uploads')).toBe(true)
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
})

describe('dynamic translation worker helpers', () => {
  it.concurrent('deduplicates and bounds page strings before translating', () => {
    expect(normalizeTranslationStrings([
      '  Settings  ',
      'Settings',
      '',
      'https://capgo.app',
      'Bundle uploads',
    ])).toEqual([
      '  Settings  ',
      'https://capgo.app',
      'Bundle uploads',
    ])
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
