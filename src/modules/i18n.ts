import type { Locale } from 'vue-i18n'
import type { UserModule } from '~/types'
import { createI18n } from 'vue-i18n'
import sourceMessages from '../../messages/en.json'
import { defaultApiHost } from '../services/supabase'

const FALLBACK_LOCALE = 'en' as const
const LANGUAGE_STORAGE_KEY = 'lang'

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

const languageAliases = new Map<string, keyof typeof languages>([
  ['en-us', 'en'],
  ['en-gb', 'en'],
  ['pt', 'pt-br'],
  ['pt-pt', 'pt-br'],
  ['zh', 'zh-cn'],
  ['zh-hans', 'zh-cn'],
  ['zh-sg', 'zh-cn'],
])

const workerLanguageCodes: Record<string, string> = {
  'pt-br': 'pt',
  'zh-cn': 'zh',
}

export const availableLocales = Object.keys(languages)

export type RemoteLanguageFailureReason = 'pending' | 'unavailable'

export class RemoteLanguageError extends Error {
  constructor(public reason: RemoteLanguageFailureReason) {
    super(reason === 'pending' ? 'Translation is not ready yet' : 'Translation is unavailable')
  }
}

type MessageCatalog = Record<string, string>

export const i18n = createI18n({
  legacy: false,
  fallbackLocale: FALLBACK_LOCALE,
  locale: FALLBACK_LOCALE,
  messages: {
    [FALLBACK_LOCALE]: sourceMessages,
  },
})

const loadedLanguages = new Set<string>([FALLBACK_LOCALE])
const pendingLanguageLoads = new Map<string, Promise<MessageCatalog>>()
const sourceChecksum = checksumMessageCatalog(sourceMessages)

function checksumMessageCatalog(messages: MessageCatalog) {
  const input = JSON.stringify(messages)
  let hash = 5381
  for (let index = 0; index < input.length; index += 1)
    hash = ((hash << 5) + hash) ^ input.charCodeAt(index)
  return (hash >>> 0).toString(36)
}

function isMessageCatalog(value: unknown): value is MessageCatalog {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && Object.values(value).every(entry => typeof entry === 'string')
}

function setI18nLanguage(lang: Locale) {
  i18n.global.locale.value = lang as any
  localStorage.setItem(LANGUAGE_STORAGE_KEY, lang)
  if (typeof document !== 'undefined')
    document.documentElement.setAttribute('lang', lang)
  return lang
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

function getWorkerLanguageCode(lang: string) {
  return workerLanguageCodes[lang] ?? lang
}

export function normalizeLanguage(lang?: string | null): keyof typeof languages {
  if (!lang)
    return FALLBACK_LOCALE

  const lowered = lang.trim().toLowerCase()
  if (lowered in languages)
    return lowered as keyof typeof languages

  const aliased = languageAliases.get(lowered)
  if (aliased)
    return aliased

  const primary = lowered.split('-')[0]
  if (primary in languages)
    return primary as keyof typeof languages

  return FALLBACK_LOCALE
}

export function getSelectedLanguage() {
  return normalizeLanguage(i18n.global.locale.value)
}

async function fetchRemoteMessages(lang: string): Promise<MessageCatalog> {
  const pending = pendingLanguageLoads.get(lang)
  if (pending)
    return pending

  const request = fetch(`${defaultApiHost || ''}/translation/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      checksum: sourceChecksum,
      messages: sourceMessages,
      targetLanguage: getWorkerLanguageCode(lang),
    }),
  }).then(async (response) => {
    if (response.status === 202)
      throw new RemoteLanguageError('pending')
    if (!response.ok)
      throw new RemoteLanguageError('unavailable')

    const payload = await response.json() as { messages?: unknown }
    if (!isMessageCatalog(payload.messages))
      throw new RemoteLanguageError('unavailable')

    return { ...sourceMessages, ...payload.messages }
  }).catch((error) => {
    if (error instanceof RemoteLanguageError)
      throw error
    throw new RemoteLanguageError('unavailable')
  }).finally(() => {
    pendingLanguageLoads.delete(lang)
  })

  pendingLanguageLoads.set(lang, request)
  return request
}

async function ensureLanguageLoaded(lang: Locale) {
  if (loadedLanguages.has(lang))
    return

  const messages = await fetchRemoteMessages(lang)
  i18n.global.setLocaleMessage(lang, messages as any)
  loadedLanguages.add(lang)
}

export async function loadLanguageAsync(lang: string): Promise<Locale> {
  const normalized = normalizeLanguage(lang)

  if (normalized === FALLBACK_LOCALE)
    return setI18nLanguage(FALLBACK_LOCALE)

  await ensureLanguageLoaded(normalized)
  return setI18nLanguage(normalized)
}

export const install: UserModule = ({ app }) => {
  app.use(i18n)

  const initialLanguage = normalizeLanguage(readStoredLanguage() ?? getNavigatorLanguage())
  if (initialLanguage !== FALLBACK_LOCALE) {
    void loadLanguageAsync(initialLanguage).catch(() => {
      setI18nLanguage(FALLBACK_LOCALE)
    })
  }
  else {
    setI18nLanguage(FALLBACK_LOCALE)
  }
}
