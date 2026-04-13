import type { Locale } from 'vue-i18n'
import type { SupportedLocale } from '~/constants/locales'
import type { UserModule } from '~/types'
import { createI18n } from 'vue-i18n'
import { defaultLocale, languages, normalizeLocale, supportedLocales } from '~/constants/locales'
import { defaultApiHost } from '~/services/supabase'
import enMessages from '../../messages/en.json'

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
let latestLocaleRequestId = 0

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

  const translationBaseUrl = defaultApiHost?.trim()
  if (!translationBaseUrl)
    throw new Error('VITE_API_HOST is not configured')

  const response = await fetch(`${translationBaseUrl.replace(/\/$/, '')}/translations/${locale}`, {
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
  const requestId = ++latestLocaleRequestId

  // If the same language
  if (i18n.global.locale.value === locale)
    return requestId === latestLocaleRequestId ? setI18nLanguage(locale) : i18n.global.locale.value

  // If the language was already loaded
  if (loadedLanguages.includes(locale))
    return requestId === latestLocaleRequestId ? setI18nLanguage(locale) : i18n.global.locale.value

  const fallbackLocale = normalizeLocale(i18n.global.locale.value)

  try {
    const messages = await loadLocaleMessages(locale)
    i18n.global.setLocaleMessage(locale, messages)
    if (!loadedLanguages.includes(locale))
      loadedLanguages.push(locale)
    if (requestId !== latestLocaleRequestId)
      return i18n.global.locale.value
    return setI18nLanguage(locale)
  }
  catch (error) {
    console.error('Failed to load locale messages', { locale, error })
    if (requestId !== latestLocaleRequestId)
      return i18n.global.locale.value
    return setI18nLanguage(fallbackLocale)
  }
}

export const install: UserModule = ({ app }) => {
  app.use(i18n)
  const lang = normalizeLocale(localStorage.getItem('lang') ?? window.navigator.language)
  loadLanguageAsync(lang)
}
