export const languages = {
  'de': 'Deutsch',
  'en': 'English',
  'es': 'Español',
  'id': 'Bahasa Indonesia',
  'it': 'Italiano',
  'fr': 'Français',
  'ja': '日本語',
  'ko': '한국어',
  'pl': 'Polski',
  'pt-br': 'Português (Brasil)',
  'ru': 'Русский',
  'tr': 'Türkçe',
  'vi': 'Tiếng Việt',
  'zh-cn': '简体中文',
  'hi': 'हिन्दी',
} as const

export type SupportedLocale = keyof typeof languages

export const defaultLocale: SupportedLocale = 'en'
export const supportedLocales = Object.keys(languages) as SupportedLocale[]

export function isSupportedLocale(locale: string): locale is SupportedLocale {
  return locale in languages
}

export function resolveLocale(locale?: string | null): SupportedLocale | null {
  if (!locale)
    return null

  const normalizedLocale = locale.toLowerCase()
  if (isSupportedLocale(normalizedLocale))
    return normalizedLocale

  const baseLocale = normalizedLocale.split('-')[0]
  if (isSupportedLocale(baseLocale))
    return baseLocale

  return null
}

export function normalizeLocale(locale?: string | null): SupportedLocale {
  return resolveLocale(locale) ?? defaultLocale
}
