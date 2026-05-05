import { nextTick, onBeforeUnmount, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { getWorkerLanguageCode, isEnglishLocale, isKnownSourceText, selectedLanguage } from '~/modules/i18n'
import { defaultApiHost } from '~/services/supabase'

const ATTRIBUTE_NAMES = ['alt', 'aria-label', 'placeholder', 'title'] as const
const ATTRIBUTE_FILTER = [...ATTRIBUTE_NAMES, 'value']
const MAX_TOTAL_CHARACTERS = 12_000
const MAX_UNIQUE_STRINGS = 220
const REQUEST_TIMEOUT_MS = 15_000
const TRANSLATION_DEBOUNCE_MS = 250
const TRANSIENT_RETRY_DELAYS_MS = [1_000, 3_000, 10_000]
const TRANSLATION_TIMEOUT_REASON = 'translation-timeout'
const VALUE_TRANSLATABLE_TYPES = new Set(['button', 'reset', 'submit'])
const SKIP_TAGS = new Set(['CODE', 'KBD', 'NOSCRIPT', 'PRE', 'SAMP', 'SCRIPT', 'STYLE', 'TEXTAREA'])
const NO_TRANSLATE_SELECTOR = '[data-capgo-no-translate]'
const TRANSLATE_SELECTOR = '[data-capgo-translate]'
const TRANSLATION_ROOT_SELECTOR = '[data-capgo-translation-root]'
const TRUSTED_TRANSLATE_SELECTOR = [
  TRANSLATE_SELECTOR,
  '.formkit-help',
  '.formkit-label',
  '.formkit-legend',
  '.formkit-message',
].join(', ')

type AttributeName = typeof ATTRIBUTE_NAMES[number]
type TranslationRoot = Document | Element

interface TextRecord {
  language?: string
  source: string
  translated?: string
}

interface TextSegment {
  node: Text
  source: string
  trailingWhitespace: string
  type: 'text'
  leadingWhitespace: string
}

interface AttributeSegment {
  attr: AttributeName | 'value'
  element: Element
  source: string
  type: 'attribute'
}

class RetryableTranslationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RetryableTranslationError'
  }
}

const textRecords = new WeakMap<Text, TextRecord>()
const attributeRecords = new WeakMap<Element, Map<string, TextRecord>>()

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function splitTextNodeValue(value: string) {
  let start = 0
  let end = value.length
  while (start < end && value[start]?.trim() === '')
    start++
  while (end > start && value[end - 1]?.trim() === '')
    end--

  return {
    leadingWhitespace: value.slice(0, start),
    source: value.slice(start, end),
    trailingWhitespace: value.slice(end),
  }
}

function looksLikeIdentifier(value: string) {
  const trimmed = value.trim()
  if (!trimmed)
    return true

  return /^(?:https?:\/\/|www\.|mailto:)/i.test(trimmed)
    || /^\S[^\s@]*@\S[^\s.]*\.\S+$/.test(trimmed)
    || /^[a-f0-9-]{8,}$/i.test(trimmed)
    || /^\d[\d\s.,:%/+-]*$/.test(trimmed)
    || /^[\w\-.][-\w]*\.[\w\-.][-\w]*\.[\w\-.]+$/.test(trimmed)
}

function shouldTranslateText(value: string, allowDynamicTranslation = false) {
  const trimmed = normalizeWhitespace(value)
  if (!trimmed)
    return false
  if (trimmed.length > 800)
    return false
  if (!/\p{L}/u.test(trimmed))
    return false
  if (looksLikeIdentifier(trimmed))
    return false
  // Only source-catalog text leaves the browser by default. Developers can opt
  // in extra static chrome with `data-capgo-translate` when needed.
  if (!allowDynamicTranslation && !isKnownSourceText(trimmed))
    return false
  return true
}

function isInsideNoTranslateZone(node: Node) {
  const parent = node.parentElement
  if (!parent)
    return true
  if (parent.closest(NO_TRANSLATE_SELECTOR))
    return true
  return SKIP_TAGS.has(parent.tagName)
}

function isInsideTranslateZone(node: Node | Element) {
  const element = node instanceof Element ? node : node.parentElement
  return !!element?.closest(TRUSTED_TRANSLATE_SELECTOR)
}

function getTextRecord(node: Text, lang: string) {
  const currentValue = node.nodeValue ?? ''
  const record = textRecords.get(node)
  if (!record) {
    const created: TextRecord = { source: currentValue }
    textRecords.set(node, created)
    return created
  }

  if (record.language === lang && record.translated === currentValue)
    return record

  if (currentValue !== record.translated) {
    record.source = currentValue
    record.language = undefined
    record.translated = undefined
  }

  return record
}

function getAttributeRecord(element: Element, attr: string, lang: string) {
  let records = attributeRecords.get(element)
  if (!records) {
    records = new Map<string, TextRecord>()
    attributeRecords.set(element, records)
  }

  const currentValue = element.getAttribute(attr) ?? ''
  const record = records.get(attr)
  if (!record) {
    const created: TextRecord = { source: currentValue }
    records.set(attr, created)
    return created
  }

  if (record.language === lang && record.translated === currentValue)
    return record

  if (currentValue !== record.translated) {
    record.source = currentValue
    record.language = undefined
    record.translated = undefined
  }

  return record
}

function collectTextSegments(root: TranslationRoot, lang: string) {
  const segments: TextSegment[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()

  while (node) {
    const textNode = node as Text
    if (!isInsideNoTranslateZone(textNode)) {
      const record = getTextRecord(textNode, lang)
      const split = splitTextNodeValue(record.source)
      if (shouldTranslateText(split.source, isInsideTranslateZone(textNode))) {
        segments.push({
          type: 'text',
          node: textNode,
          source: split.source,
          leadingWhitespace: split.leadingWhitespace,
          trailingWhitespace: split.trailingWhitespace,
        })
      }
    }
    node = walker.nextNode()
  }

  return segments
}

function collectAttributeSegments(root: TranslationRoot, lang: string) {
  const segments: AttributeSegment[] = []
  const elements = root.querySelectorAll<HTMLElement>(`[${ATTRIBUTE_NAMES.join('],[')}], input[type="button"][value], input[type="reset"][value], input[type="submit"][value]`)

  elements.forEach((element) => {
    if (element.closest(NO_TRANSLATE_SELECTOR) || SKIP_TAGS.has(element.tagName))
      return

    const allowDynamicTranslation = isInsideTranslateZone(element)
    ATTRIBUTE_NAMES.forEach((attr) => {
      if (!element.hasAttribute(attr))
        return
      const record = getAttributeRecord(element, attr, lang)
      if (!shouldTranslateText(record.source, allowDynamicTranslation))
        return
      segments.push({ type: 'attribute', element, attr, source: record.source })
    })

    if (element instanceof HTMLInputElement && VALUE_TRANSLATABLE_TYPES.has(element.type.toLowerCase()) && element.value) {
      const record = getAttributeRecord(element, 'value', lang)
      if (!shouldTranslateText(record.source, allowDynamicTranslation))
        return
      segments.push({ type: 'attribute', element, attr: 'value', source: record.source })
    }
  })

  return segments
}

function collectSegments(root: TranslationRoot, lang: string) {
  const segments = [...collectTextSegments(root, lang), ...collectAttributeSegments(root, lang)]
  const uniqueSources = new Set<string>()
  let totalCharacters = 0

  return segments.filter((segment) => {
    if (uniqueSources.has(segment.source))
      return true

    if (uniqueSources.size >= MAX_UNIQUE_STRINGS)
      return false

    if (totalCharacters + segment.source.length > MAX_TOTAL_CHARACTERS)
      return false

    uniqueSources.add(segment.source)
    totalCharacters += segment.source.length
    return true
  })
}

function restoreSourceContent(root: TranslationRoot) {
  const textWalker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let currentNode = textWalker.nextNode()

  while (currentNode) {
    const textNode = currentNode as Text
    const record = textRecords.get(textNode)
    if (record?.translated && textNode.nodeValue === record.translated) {
      textNode.nodeValue = record.source
      record.language = undefined
      record.translated = undefined
    }
    currentNode = textWalker.nextNode()
  }

  const elements = root.querySelectorAll<HTMLElement>(`[${ATTRIBUTE_NAMES.join('],[')}], input[type="button"][value], input[type="reset"][value], input[type="submit"][value]`)
  elements.forEach((element) => {
    const records = attributeRecords.get(element)
    if (!records)
      return

    records.forEach((record, attr) => {
      if (!record.translated)
        return

      if (attr === 'value' && element instanceof HTMLInputElement) {
        if (element.value === record.translated)
          element.value = record.source
        element.setAttribute('value', record.source)
      }
      else if (element.getAttribute(attr) === record.translated) {
        element.setAttribute(attr, record.source)
      }

      record.language = undefined
      record.translated = undefined
    })
  })
}

async function sha256Hex(value: string) {
  const data = new TextEncoder().encode(value)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

function getTranslationRoot() {
  return document.querySelector<HTMLElement>(TRANSLATION_ROOT_SELECTOR)
}

export function usePageTranslation() {
  const route = useRoute()
  let observer: MutationObserver | null = null
  let debounceHandle: ReturnType<typeof setTimeout> | null = null
  let abortController: AbortController | null = null
  let applyingTranslations = false
  let lastRequestHash = ''
  let translationDisabled = false
  let transientRetryCount = 0

  function clearPendingWork() {
    if (debounceHandle) {
      clearTimeout(debounceHandle)
      debounceHandle = null
    }
    abortController?.abort()
    abortController = null
  }

  function scheduleTranslation(delay = TRANSLATION_DEBOUNCE_MS) {
    if (typeof window === 'undefined')
      return

    if (debounceHandle)
      clearTimeout(debounceHandle)

    debounceHandle = setTimeout(() => {
      debounceHandle = null
      void translatePage()
    }, delay)
  }

  function scheduleTransientRetry(root: TranslationRoot) {
    // Stop automatic retries once the backoff table has been exhausted.
    const retryDelay = TRANSIENT_RETRY_DELAYS_MS[transientRetryCount]
    if (retryDelay === undefined) {
      transientRetryCount = 0
      lastRequestHash = ''
      restoreSourceContent(root)
      return false
    }

    transientRetryCount += 1
    scheduleTranslation(retryDelay)
    return true
  }

  async function fetchTranslations(strings: string[], lang: string, pagePath: string, signal: AbortSignal) {
    const response = await fetch(`${defaultApiHost}/translation/page`, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        pagePath,
        strings,
        targetLanguage: getWorkerLanguageCode(lang),
      }),
    })

    if (response.status === 404 || response.status === 501) {
      // Local/Supabase-only runtimes intentionally do not expose `/translation/page`.
      // Disable on-the-fly translation for this session and keep the English source UI.
      translationDisabled = true
      return {}
    }
    if (response.status === 503)
      throw new RetryableTranslationError('Translation service unavailable')
    if (response.status === 502)
      throw new RetryableTranslationError('Translation request failed')

    if (!response.ok)
      throw new Error(`Translation request failed with ${response.status}`)

    const payload = await response.json() as { translations?: Record<string, string> }
    return payload.translations ?? {}
  }

  function resetTranslationState(root: TranslationRoot) {
    restoreSourceContent(root)
    lastRequestHash = ''
    transientRetryCount = 0
  }

  function shouldSkipTranslation(root: TranslationRoot, lang: string) {
    if (isEnglishLocale(lang) || translationDisabled) {
      resetTranslationState(root)
      return true
    }

    return false
  }

  function isStaleRequest(controller: AbortController, lang: string, requestedPath: string) {
    return controller.signal.aborted || lang !== selectedLanguage.value || route.path !== requestedPath
  }

  function applyTranslations(segments: Array<TextSegment | AttributeSegment>, translations: Record<string, string>, lang: string) {
    applyingTranslations = true
    segments.forEach((segment) => {
      const translated = translations[segment.source]
      if (!translated || translated === segment.source)
        return

      if (segment.type === 'text') {
        const record = textRecords.get(segment.node)
        segment.node.nodeValue = `${segment.leadingWhitespace}${translated}${segment.trailingWhitespace}`
        if (record) {
          record.language = lang
          record.translated = segment.node.nodeValue ?? translated
        }
        return
      }

      const attrRecord = getAttributeRecord(segment.element, segment.attr, lang)
      if (segment.attr === 'value' && segment.element instanceof HTMLInputElement) {
        segment.element.value = translated
        segment.element.setAttribute('value', translated)
      }
      else {
        segment.element.setAttribute(segment.attr, translated)
      }

      attrRecord.language = lang
      attrRecord.translated = translated
    })
  }

  function handleTranslationError(error: unknown, controller: AbortController, root: TranslationRoot) {
    if (controller.signal.aborted) {
      if (controller.signal.reason === TRANSLATION_TIMEOUT_REASON)
        scheduleTransientRetry(root)
      return
    }

    if (error instanceof RetryableTranslationError || error instanceof TypeError) {
      scheduleTransientRetry(root)
      return
    }

    console.error('Page translation failed', error)
  }

  async function translatePage() {
    const lang = selectedLanguage.value
    const root = getTranslationRoot()
    if (!root)
      return

    if (shouldSkipTranslation(root, lang))
      return

    await nextTick()

    const segments = collectSegments(root, lang)
    if (!segments.length)
      return

    const uniqueSources = [...new Set(segments.map(segment => segment.source))]
    const requestedPath = route.path
    const requestHash = await sha256Hex(JSON.stringify({
      lang,
      path: requestedPath,
      strings: uniqueSources,
    }))

    if (requestHash === lastRequestHash)
      return

    clearPendingWork()
    abortController = new AbortController()
    const controller = abortController
    const timeoutHandle = setTimeout(() => controller.abort(TRANSLATION_TIMEOUT_REASON), REQUEST_TIMEOUT_MS)

    try {
      const translations = await fetchTranslations(uniqueSources, lang, requestedPath, controller.signal)
      if (isStaleRequest(controller, lang, requestedPath))
        return

      applyTranslations(segments, translations, lang)
      lastRequestHash = requestHash
      transientRetryCount = 0
    }
    catch (error) {
      handleTranslationError(error, controller, root)
    }
    finally {
      setTimeout(() => {
        applyingTranslations = false
      }, 0)
      clearTimeout(timeoutHandle)
      if (abortController === controller)
        abortController = null
    }
  }

  onMounted(() => {
    const root = getTranslationRoot()
    if (!root)
      return

    observer = new MutationObserver((mutations) => {
      if (applyingTranslations)
        return

      const hasRelevantMutation = mutations.some((mutation) => {
        if (mutation.type === 'characterData')
          return true
        if (mutation.type === 'childList')
          return mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0
        return ATTRIBUTE_FILTER.includes(mutation.attributeName ?? '')
      })

      if (hasRelevantMutation) {
        lastRequestHash = ''
        scheduleTranslation()
      }
    })

    observer.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ATTRIBUTE_FILTER,
    })

    scheduleTranslation(120)
  })

  onBeforeUnmount(() => {
    clearPendingWork()
    observer?.disconnect()
    observer = null
  })

  watch(() => route.path, () => {
    lastRequestHash = ''
    translationDisabled = false
    transientRetryCount = 0
    scheduleTranslation(80)
  }, { immediate: true })

  watch(selectedLanguage, () => {
    lastRequestHash = ''
    translationDisabled = false
    transientRetryCount = 0
    scheduleTranslation(40)
  })
}
