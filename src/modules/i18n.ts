import type { Locale } from 'vue-i18n'
import type { UserModule } from '~/types'
import { ref } from 'vue'
import sourceMessages from '../../messages/en.json'
import { defaultApiHost } from '../services/supabase'

export interface LanguageOption {
  countryCode: string
  id: string
  label: string
  workerCode: string
}

export const SOURCE_LOCALE = 'en'
const LANGUAGE_STORAGE_KEY = 'lang'
const PRIORITY_MESSAGE_CATALOG_TRANSLATION_TIMEOUT_MS = 10_000

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
export const isLanguageChanging = ref(false)
export const languageChangeTarget = ref<string | null>(null)
export const selectedLanguage = ref(SOURCE_LOCALE)

type MessageCatalog = Record<string, string>
interface LoadedMessageCatalog {
  complete: boolean
  messages: MessageCatalog
}
interface MessageCatalogFetchOptions {
  timeoutMs?: number
}

const messageCatalog = sourceMessages as MessageCatalog
const activeMessageCatalog = ref<MessageCatalog>(messageCatalog)
const translatedMessageCatalogs = new Map<string, LoadedMessageCatalog>([[SOURCE_LOCALE, { complete: true, messages: messageCatalog }]])
const pendingCatalogLoads = new Map<string, Promise<MessageCatalog>>()
const trackedMessageKeys = new Set<string>()
const MESSAGE_CACHE_PREFIX = 'capgo:translated-messages'
const MESSAGE_CACHE_VERSION = 1
let messageCatalogTranslationDisabled = false
const SAFE_DYNAMIC_PLACEHOLDERS = new Set([
  'amount',
  'channel',
  'cmd',
  'completed',
  'count',
  'country',
  'current',
  'date',
  'days',
  'duration',
  'end',
  'hours',
  'metric',
  'minutes',
  'percent',
  'seconds',
  'share',
  'start',
  'status',
  'time',
  'total',
  'unchanged',
  'version',
])
const knownSourceTexts = new Set([
  ...Object.values(messageCatalog),
  ...languageOptions.map(option => option.label),
].map(value => normalizeKnownSourceText(value)).filter(Boolean))
const knownSourcePatterns = Object.values(messageCatalog)
  .map(value => createKnownSourcePattern(normalizeKnownSourceText(value)))
  .filter((value): value is RegExp => value !== null)
type MessageParams = Record<string, unknown> | string | undefined

function normalizeKnownSourceText(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function getPlaceholderPattern(token: string) {
  if (!SAFE_DYNAMIC_PLACEHOLDERS.has(token))
    return null

  switch (token) {
    case 'completed':
    case 'count':
    case 'current':
    case 'days':
    case 'hours':
    case 'minutes':
    case 'seconds':
    case 'total':
    case 'unchanged':
      return '[-+]?\\d+(?:[\\d., ]*\\d)?'
    case 'percent':
    case 'share':
      return '[-+]?\\d+(?:[\\d., ]*\\d)?%?'
    default:
      return '[^\\n]+?'
  }
}

function createKnownSourcePattern(value: string) {
  const matches = [...value.matchAll(/\{(\w+)\}/g)]
  if (matches.length === 0)
    return null

  const parts: string[] = []
  let lastIndex = 0

  for (const match of matches) {
    const [placeholder, token] = match
    const replacement = getPlaceholderPattern(token)
    if (!replacement)
      return null

    const startIndex = match.index ?? 0
    parts.push(escapeRegex(value.slice(lastIndex, startIndex)))
    parts.push(`(${replacement})`)
    lastIndex = startIndex + placeholder.length
  }

  parts.push(escapeRegex(value.slice(lastIndex)))
  return new RegExp(`^${parts.join('')}$`, 'u')
}

function interpolateMessage(message: string, params?: Exclude<MessageParams, string>): string {
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

function getMessageCacheKey(lang: string) {
  return [
    MESSAGE_CACHE_PREFIX,
    MESSAGE_CACHE_VERSION,
    import.meta.env.VITE_APP_VERSION ?? 'dev',
    lang,
  ].join(':')
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

function isMessageCatalog(value: unknown): value is MessageCatalog {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return false

  return Object.values(value).every(entry => typeof entry === 'string')
}

function readCachedMessageCatalog(lang: string) {
  if (typeof localStorage === 'undefined')
    return null

  try {
    const raw = localStorage.getItem(getMessageCacheKey(lang))
    if (!raw)
      return null

    const parsed = JSON.parse(raw) as unknown
    if (!isMessageCatalog(parsed))
      return null

    return { ...messageCatalog, ...parsed }
  }
  catch {
    return null
  }
}

function persistMessageCatalog(lang: string, messages: MessageCatalog) {
  if (typeof localStorage === 'undefined')
    return

  try {
    localStorage.setItem(getMessageCacheKey(lang), JSON.stringify(messages))
  }
  catch {
    // Ignore quota/storage failures and keep runtime translations in memory.
  }
}

function applyMessageCatalog(lang: string, messages?: MessageCatalog) {
  const nextMessages = messages ?? translatedMessageCatalogs.get(lang)?.messages ?? messageCatalog
  activeMessageCatalog.value = nextMessages
}

function trackMessageKey(key: string) {
  if (key in messageCatalog)
    trackedMessageKeys.add(key)
}

function getTrackedMessageCatalog() {
  const trackedCatalog: MessageCatalog = {}

  trackedMessageKeys.forEach((key) => {
    const message = messageCatalog[key]
    if (message)
      trackedCatalog[key] = message
  })

  return trackedCatalog
}

async function fetchTranslatedMessageCatalog(lang: string, messages: MessageCatalog, options: MessageCatalogFetchOptions = {}): Promise<MessageCatalog | null> {
  if (messageCatalogTranslationDisabled)
    return null

  const controller = options.timeoutMs ? new AbortController() : undefined
  const timeoutId = controller && options.timeoutMs
    ? setTimeout(() => controller.abort(), options.timeoutMs)
    : undefined

  try {
    const translationEndpoint = `${defaultApiHost || ''}/translation/messages`
    const response = await fetch(translationEndpoint, {
      method: 'POST',
      signal: controller?.signal,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages,
        targetLanguage: getWorkerLanguageCode(lang),
      }),
    })

    if (response.status === 404 || response.status === 501) {
      // Supabase-only/local runtimes intentionally do not expose translation
      // bundles, and workers without AI bindings should keep the source English UI.
      messageCatalogTranslationDisabled = true
      return null
    }

    if (response.status === 503)
      return null

    if (!response.ok)
      throw new Error(`Message translation request failed with ${response.status}`)

    const payload = await response.json() as { messages?: unknown }
    if (!isMessageCatalog(payload.messages))
      return null

    return { ...messageCatalog, ...payload.messages }
  }
  catch (error) {
    console.error('Message catalog translation failed', error)
    return null
  }
  finally {
    if (timeoutId)
      clearTimeout(timeoutId)
  }
}

async function loadPriorityMessageCatalog(lang: string) {
  const normalized = normalizeLanguage(lang)
  if (isEnglishLocale(normalized))
    return messageCatalog

  const existing = translatedMessageCatalogs.get(normalized)
  if (existing)
    return existing.messages

  const trackedCatalog = getTrackedMessageCatalog()
  const priorityMessages = Object.keys(trackedCatalog).length > 0 ? trackedCatalog : messageCatalog
  const messages = await fetchTranslatedMessageCatalog(normalized, priorityMessages, {
    timeoutMs: PRIORITY_MESSAGE_CATALOG_TRANSLATION_TIMEOUT_MS,
  })
  if (!messages)
    return messageCatalog

  const mergedMessages = { ...messageCatalog, ...messages }

  translatedMessageCatalogs.set(normalized, {
    complete: Object.keys(priorityMessages).length === Object.keys(messageCatalog).length,
    messages: mergedMessages,
  })

  return mergedMessages
}

async function ensureMessageCatalogLoaded(lang: string) {
  const normalized = normalizeLanguage(lang)
  if (isEnglishLocale(normalized))
    return messageCatalog

  const existing = translatedMessageCatalogs.get(normalized)
  if (existing?.complete)
    return existing.messages

  const cached = readCachedMessageCatalog(normalized)
  if (cached) {
    translatedMessageCatalogs.set(normalized, { complete: true, messages: cached })
    return cached
  }

  const pending = pendingCatalogLoads.get(normalized)
  if (pending)
    return pending

  // Full catalog translation runs in the background and can outlast the quick
  // priority request because the worker translates large catalogs in many AI batches.
  const loadPromise = fetchTranslatedMessageCatalog(normalized, messageCatalog)
    .then((messages) => {
      if (!messages)
        return translatedMessageCatalogs.get(normalized)?.messages ?? messageCatalog

      translatedMessageCatalogs.set(normalized, { complete: true, messages })
      persistMessageCatalog(normalized, messages)
      return messages
    })
    .finally(() => {
      pendingCatalogLoads.delete(normalized)
    })

  pendingCatalogLoads.set(normalized, loadPromise)
  return loadPromise
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
  const resolved = activeMessageCatalog.value[key] ?? messageCatalog[key]
  if (resolved)
    return resolved
  if (defaultMessage)
    return defaultMessage
  return key
}

export function isKnownSourceText(value: string) {
  const normalized = normalizeKnownSourceText(value)
  if (!normalized)
    return false
  return knownSourceTexts.has(normalized) || knownSourcePatterns.some(pattern => pattern.test(normalized))
}

export function translateMessage(key: string, params?: MessageParams, defaultMessage?: string) {
  trackMessageKey(key)
  const fallbackMessage = typeof params === 'string' && defaultMessage === undefined ? params : defaultMessage
  const interpolationParams = typeof params === 'string' ? undefined : params
  return interpolateMessage(getSourceMessage(key, fallbackMessage), interpolationParams)
}

export function resetTrackedMessageKeys() {
  trackedMessageKeys.clear()
}

export function resetDynamicTranslationRuntimeStateForTests() {
  activeMessageCatalog.value = messageCatalog
  translatedMessageCatalogs.clear()
  translatedMessageCatalogs.set(SOURCE_LOCALE, { complete: true, messages: messageCatalog })
  pendingCatalogLoads.clear()
  trackedMessageKeys.clear()
  messageCatalogTranslationDisabled = false
  isLanguageChanging.value = false
  languageChangeTarget.value = null
  selectedLanguage.value = SOURCE_LOCALE
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
  languageChangeTarget.value = normalized

  if (isEnglishLocale(normalized)) {
    isLanguageChanging.value = false
    applyMessageCatalog(normalized, messageCatalog)
    return Promise.resolve(normalized)
  }

  const cached = readCachedMessageCatalog(normalized)
  if (cached) {
    translatedMessageCatalogs.set(normalized, { complete: true, messages: cached })
    isLanguageChanging.value = false
    applyMessageCatalog(normalized, cached)
    return Promise.resolve(normalized)
  }

  const existing = translatedMessageCatalogs.get(normalized)
  if (existing) {
    isLanguageChanging.value = !existing.complete
    applyMessageCatalog(normalized, existing.messages)
  }
  else {
    isLanguageChanging.value = true
    applyMessageCatalog(normalized, messageCatalog)
  }

  return loadPriorityMessageCatalog(normalized).then((messages) => {
    if (selectedLanguage.value === normalized)
      applyMessageCatalog(normalized, messages)

    if (selectedLanguage.value === normalized)
      isLanguageChanging.value = false

    void ensureMessageCatalogLoaded(normalized).then((fullMessages) => {
      if (selectedLanguage.value === normalized)
        applyMessageCatalog(normalized, fullMessages)
    })

    return normalized
  }).finally(() => {
    if (selectedLanguage.value === normalized)
      isLanguageChanging.value = false
  })
}

export const install: UserModule = () => {
  const initialLanguage = normalizeLanguage(readStoredLanguage() ?? getNavigatorLanguage())
  selectedLanguage.value = initialLanguage
  persistLanguage(initialLanguage)
  updateHtmlLanguage(initialLanguage)

  const cached = isEnglishLocale(initialLanguage)
    ? messageCatalog
    : readCachedMessageCatalog(initialLanguage) ?? messageCatalog
  applyMessageCatalog(initialLanguage, cached)

  if (!isEnglishLocale(initialLanguage)) {
    void ensureMessageCatalogLoaded(initialLanguage).then((messages) => {
      if (selectedLanguage.value === initialLanguage)
        applyMessageCatalog(initialLanguage, messages)
    })
  }
}
