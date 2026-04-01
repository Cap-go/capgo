import type { Locale } from 'vue-i18n'
import type { UserModule } from '~/types'
import { ref } from 'vue'
import sourceMessages from '../../messages/en.json'

export interface LanguageOption {
  countryCode: string
  id: string
  label: string
  workerCode: string
}

export const SOURCE_LOCALE = 'en'
const LANGUAGE_STORAGE_KEY = 'lang'

export const languageOptions: LanguageOption[] = [
  { id: 'en', label: 'English', workerCode: 'en', countryCode: 'US' },
  { id: 'zh-cn', label: 'Mandarin Chinese', workerCode: 'zh', countryCode: 'CN' },
  { id: 'hi', label: 'Hindi', workerCode: 'hi', countryCode: 'IN' },
  { id: 'es', label: 'Spanish', workerCode: 'es', countryCode: 'ES' },
  { id: 'pt', label: 'Portuguese', workerCode: 'pt', countryCode: 'PT' },
  { id: 'ru', label: 'Russian', workerCode: 'ru', countryCode: 'RU' },
  { id: 'fr', label: 'French', workerCode: 'fr', countryCode: 'FR' },
  { id: 'de', label: 'German', workerCode: 'de', countryCode: 'DE' },
  { id: 'ja', label: 'Japanese', workerCode: 'ja', countryCode: 'JP' },
  { id: 'ko', label: 'Korean', workerCode: 'ko', countryCode: 'KR' },
  { id: 'ar', label: 'Arabic', workerCode: 'ar', countryCode: 'SA' },
  { id: 'tr', label: 'Turkish', workerCode: 'tr', countryCode: 'TR' },
  { id: 'it', label: 'Italian', workerCode: 'it', countryCode: 'IT' },
  { id: 'vi', label: 'Vietnamese', workerCode: 'vi', countryCode: 'VN' },
  { id: 'pl', label: 'Polish', workerCode: 'pl', countryCode: 'PL' },
  { id: 'id', label: 'Indonesian', workerCode: 'id', countryCode: 'ID' },
  { id: 'uk', label: 'Ukrainian', workerCode: 'uk', countryCode: 'UA' },
  { id: 'nl', label: 'Dutch', workerCode: 'nl', countryCode: 'NL' },
  { id: 'fa', label: 'Persian (Farsi)', workerCode: 'fa', countryCode: 'IR' },
  { id: 'th', label: 'Thai', workerCode: 'th', countryCode: 'TH' },
  { id: 'bn', label: 'Bengali', workerCode: 'bn', countryCode: 'BD' },
  { id: 'cs', label: 'Czech', workerCode: 'cs', countryCode: 'CZ' },
  { id: 'ro', label: 'Romanian', workerCode: 'ro', countryCode: 'RO' },
  { id: 'sv', label: 'Swedish', workerCode: 'sv', countryCode: 'SE' },
  { id: 'he', label: 'Hebrew', workerCode: 'he', countryCode: 'IL' },
  { id: 'ta', label: 'Tamil', workerCode: 'ta', countryCode: 'IN' },
  { id: 'ur', label: 'Urdu', workerCode: 'ur', countryCode: 'PK' },
  { id: 'el', label: 'Greek', workerCode: 'el', countryCode: 'GR' },
  { id: 'hu', label: 'Hungarian', workerCode: 'hu', countryCode: 'HU' },
  { id: 'fi', label: 'Finnish', workerCode: 'fi', countryCode: 'FI' },
]

const languageLookup = new Map(languageOptions.map(option => [option.id, option]))
const languageAliases = new Map<string, string>([
  ['en-us', 'en'],
  ['en-gb', 'en'],
  ['he-il', 'he'],
  ['iw', 'he'],
  ['iw-il', 'he'],
  ['in', 'id'],
  ['in-id', 'id'],
  ['pt-br', 'pt'],
  ['pt-pt', 'pt'],
  ['zh', 'zh-cn'],
  ['zh-hans', 'zh-cn'],
  ['zh-sg', 'zh-cn'],
])

export const availableLocales = languageOptions.map(option => option.id)
export const languages = Object.fromEntries(languageOptions.map(option => [option.id, option.label]))
export const selectedLanguage = ref(SOURCE_LOCALE)

const messageCatalog = sourceMessages as Record<string, string>
type MessageParams = Record<string, unknown> | string | undefined

function interpolateMessage(message: string, params?: MessageParams): string {
  // interpolateMessage treats string params as an explicit message override for
  // legacy call sites that pass English text instead of placeholder values.
  if (typeof params === 'string')
    return params

  if (!params)
    return message

  return message.replace(/\{(\w+)\}/g, (_match, token: string) => {
    const value = params[token]
    if (value === null || value === undefined)
      return ''
    return String(value)
  })
}

function updateHtmlLanguage(lang: string) {
  if (typeof document !== 'undefined')
    document.documentElement.setAttribute('lang', lang)
}

function persistLanguage(lang: string) {
  if (typeof localStorage !== 'undefined')
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lang)
}

function readStoredLanguage() {
  if (typeof localStorage === 'undefined')
    return null
  return localStorage.getItem(LANGUAGE_STORAGE_KEY)
}

function getNavigatorLanguage() {
  if (typeof navigator === 'undefined')
    return null
  return navigator.language
}

export function normalizeLanguage(lang?: string | null): string {
  if (!lang)
    return SOURCE_LOCALE

  const lowered = lang.trim().toLowerCase()
  if (languageLookup.has(lowered))
    return lowered

  const aliased = languageAliases.get(lowered)
  if (aliased)
    return aliased

  const primary = lowered.split('-')[0]
  if (languageLookup.has(primary))
    return primary

  return SOURCE_LOCALE
}

export function getLanguageConfig(lang?: string | null): LanguageOption {
  return languageLookup.get(normalizeLanguage(lang)) ?? languageLookup.get(SOURCE_LOCALE)!
}

export function getSelectedLanguage() {
  return normalizeLanguage(selectedLanguage.value)
}

export function isEnglishLocale(lang?: string | null) {
  return normalizeLanguage(lang) === SOURCE_LOCALE
}

export function getWorkerLanguageCode(lang?: string | null) {
  return getLanguageConfig(lang).workerCode
}

export function getSourceMessage(key: string, defaultMessage?: string) {
  const resolved = messageCatalog[key]
  if (resolved)
    return resolved
  if (defaultMessage)
    return defaultMessage
  return key
}

export function translateMessage(key: string, params?: MessageParams, defaultMessage?: string) {
  return interpolateMessage(getSourceMessage(key, defaultMessage), params)
}

export const i18n = {
  global: {
    locale: selectedLanguage,
    t: translateMessage,
    setLocaleMessage: () => {},
  },
}

export function loadLanguageAsync(lang: string): Promise<Locale> {
  const normalized = normalizeLanguage(lang)
  selectedLanguage.value = normalized
  persistLanguage(normalized)
  updateHtmlLanguage(normalized)
  return Promise.resolve(normalized)
}

export const install: UserModule = () => {
  const initialLanguage = normalizeLanguage(readStoredLanguage() ?? getNavigatorLanguage())
  selectedLanguage.value = initialLanguage
  persistLanguage(initialLanguage)
  updateHtmlLanguage(initialLanguage)
}
