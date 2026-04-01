import { describe, expect, it } from 'vitest'
import { getWorkerLanguageCode, normalizeLanguage } from '../src/modules/i18n'
import {
  normalizeTranslationStrings,
  parseSegmentedTranslation,
  protectTranslationTokens,
  restoreTranslationTokens,
} from '../supabase/functions/_backend/public/translation.ts'

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
      'Settings',
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
    const entries = [
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
    ] as any

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
})
