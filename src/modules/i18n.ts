import type { Locale } from 'vue-i18n'
import type { SupportedLocale } from '../constants/locales'
import type { UserModule } from '~/types'
import { createI18n } from 'vue-i18n'
import { defaultApiHost } from '~/services/supabase'
import enMessages from '../../messages/en.json'
import { defaultLocale, languages, normalizeLocale, supportedLocales } from '../constants/locales'

export const i18n = createI18n({
  legacy: false,
  fallbackLocale: defaultLocale,
  locale: defaultLocale,
  messages: {
    [defaultLocale]: enMessages,
  },
})

type MessageDictionary = Record<string, string>

export const availableLocales = supportedLocales
export { languages }

const loadedLanguages: SupportedLocale[] = [defaultLocale]

function setI18nLanguage(lang: Locale) {
  i18n.global.locale.value = lang as any
  localStorage.setItem('lang', lang)
  if (typeof document !== 'undefined')
    document.querySelector('html')?.setAttribute('lang', lang)
  return lang
}

async function loadLocaleMessages(locale: SupportedLocale): Promise<MessageDictionary> {
  if (locale === defaultLocale)
    return enMessages

  const response = await fetch(`${defaultApiHost}/translations/${locale}`, {
    headers: {
      Accept: 'application/json',
    },
  })

  if (!response.ok)
    throw new Error(`Failed to load locale "${locale}" (HTTP ${response.status})`)

  return await response.json() as MessageDictionary
}

export async function loadLanguageAsync(lang: string): Promise<Locale> {
  const locale = normalizeLocale(lang)

  // If the same language
  if (i18n.global.locale.value === locale)
    return setI18nLanguage(locale)

  // If the language was already loaded
  if (loadedLanguages.includes(locale))
    return setI18nLanguage(locale)

  const fallbackLocale = normalizeLocale(i18n.global.locale.value)

  try {
    const messages = await loadLocaleMessages(locale)
    i18n.global.setLocaleMessage(locale, messages)
    loadedLanguages.push(locale)
    return setI18nLanguage(locale)
  }
  catch (error) {
    console.error('Failed to load locale messages', { locale, error })
    return setI18nLanguage(fallbackLocale)
  }
}

export const install: UserModule = ({ app }) => {
  app.use(i18n)
  const lang = normalizeLocale(localStorage.getItem('lang') ?? window.navigator.language)
  loadLanguageAsync(lang)
}
