import type { Locale } from 'vue-i18n'
import type { UserModule } from '~/types'
import { createI18n } from 'vue-i18n'

const FALLBACK_LOCALE = 'en' as const

// Import i18n resources
// https://vitejs.dev/guide/features.html#glob-import
//
// Don't need this? Try vitesse-lite: https://github.com/antfu/vitesse-lite
export const i18n = createI18n({
  legacy: false,
  fallbackLocale: FALLBACK_LOCALE,
  locale: '',
  messages: {},
})

const localesMap = Object.fromEntries(
  Object.entries(import.meta.glob('../../messages/*.json'))
    .map(([path, loadLocale]) => [/([\w-]*)\.json$/.exec(path)?.[1], loadLocale]),
) as Record<Locale, () => Promise<{ default: Record<string, string> }>>

export const availableLocales = Object.keys(localesMap)
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
}

const loadedLanguages: string[] = []

async function ensureLanguageLoaded(lang: Locale) {
  if (loadedLanguages.includes(lang))
    return

  const messages = await localesMap[lang]()
  i18n.global.setLocaleMessage(lang, messages.default)
  loadedLanguages.push(lang)
}

function setI18nLanguage(lang: Locale) {
  i18n.global.locale.value = lang as any
  localStorage.setItem('lang', lang)
  if (typeof document !== 'undefined')
    document.querySelector('html')?.setAttribute('lang', lang)
  return lang
}

export async function loadLanguageAsync(lang: string): Promise<Locale> {
  if (lang !== FALLBACK_LOCALE)
    await ensureLanguageLoaded(FALLBACK_LOCALE)

  // If the same language
  if (i18n.global.locale.value === lang && loadedLanguages.includes(lang))
    return setI18nLanguage(lang)

  // If the language was already loaded
  if (loadedLanguages.includes(lang))
    return setI18nLanguage(lang)

  // If the language hasn't been loaded yet
  await ensureLanguageLoaded(lang as Locale)
  return setI18nLanguage(lang)
}

export const install: UserModule = ({ app }) => {
  app.use(i18n)
  let lang = localStorage.getItem('lang') ?? window.navigator.language.split('-')[0]
  if (!(lang in languages))
    lang = 'en'
  loadLanguageAsync(lang)
}
