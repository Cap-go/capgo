export const CAPGO_ATTRIBUTION_COOKIE_NAME = 'capgo_attribution'

export const FIRST_TOUCH_TYPES = [
  'blog',
  'docs',
  'plugin',
  'pricing',
  'home',
  'solutions',
  'console',
  'cli',
  'other',
] as const

export type FirstTouchType = typeof FIRST_TOUCH_TYPES[number]

export const SIGNUP_UTM_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
] as const

export type SignupUtmKey = typeof SIGNUP_UTM_KEYS[number]
export type FirstSignupUtmKey = `first_${SignupUtmKey}`

export type ResolvedSignupAttribution = {
  signup_ref?: string
  signup_plugin?: string
  signup_source?: string
  first_touch_type?: FirstTouchType
  first_touch_path?: string
  first_utm_source?: string
  first_utm_medium?: string
  first_utm_campaign?: string
  first_utm_content?: string
  first_utm_term?: string
}

export type SignupAttributionEventTags = {
  signup_plugin?: string
  signup_source?: string
  first_touch_type?: FirstTouchType
}

type AttributionRecord = Record<string, unknown>

const FIRST_TOUCH_TYPE_SET = new Set<string>(FIRST_TOUCH_TYPES)

const ATTRIBUTION_STRING_MAX = 256
const FIRST_TOUCH_PATH_MAX = 512

const SENSITIVE_ATTRIBUTION_PATTERN = /[@?#]|(?:^|[^\w-])(?:token|password|secret|api[_-]?key|authorization)(?:[^\w-]|$)/i
const SENSITIVE_PATH_SEGMENT = /(?:^|\/)(?:reset|recover|confirm|callback|invite|oauth|magic-link)(?:\/|$)/i

function readNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string')
    return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function isSafeAttributionValue(value: string): boolean {
  if (SENSITIVE_ATTRIBUTION_PATTERN.test(value))
    return false
  return true
}

function readAttributionString(value: unknown, maxLen = ATTRIBUTION_STRING_MAX): string | undefined {
  const normalized = readNonEmptyString(value)
  if (!normalized || !isSafeAttributionValue(normalized))
    return undefined
  return normalized.length > maxLen ? normalized.slice(0, maxLen) : normalized
}

export function signupPluginFromRef(ref: string | undefined): string | undefined {
  const normalized = readAttributionString(ref)
  if (!normalized)
    return undefined
  const prefix = 'plugin_'
  if (!normalized.toLowerCase().startsWith(prefix))
    return undefined
  const plugin = normalized.slice(prefix.length).trim()
  return plugin.length > 0 ? plugin : undefined
}

function readSignupRef(record: AttributionRecord): string | undefined {
  return readAttributionString(record.signup_ref)
    ?? readAttributionString(record.ref)
    ?? readAttributionString(record.attribution_ref)
}

function readSignupSource(
  record: AttributionRecord,
  partial: ResolvedSignupAttribution,
): string | undefined {
  const explicit = readAttributionString(record.signup_source)
  if (explicit)
    return explicit
  return deriveSignupSourceFromRecord(partial)
}

function readSignupPlugin(record: AttributionRecord, signupRef: string | undefined): string | undefined {
  return readAttributionString(record.signup_plugin)
    ?? signupPluginFromRef(signupRef)
}

function readFirstTouchType(record: AttributionRecord): FirstTouchType | undefined {
  const raw = readNonEmptyString(record.first_touch_type)?.toLowerCase()
  if (!raw)
    return undefined
  return FIRST_TOUCH_TYPE_SET.has(raw) ? raw as FirstTouchType : undefined
}

function readFirstTouchPath(record: AttributionRecord): string | undefined {
  const raw = readNonEmptyString(record.first_touch_path)
  if (!raw)
    return undefined

  const withoutQuery = raw.split(/[?#]/, 1)[0]?.trim()
  if (!withoutQuery || !withoutQuery.startsWith('/'))
    return undefined
  if (SENSITIVE_PATH_SEGMENT.test(withoutQuery))
    return undefined
  if (!isSafeAttributionValue(withoutQuery))
    return undefined

  return withoutQuery.length > FIRST_TOUCH_PATH_MAX
    ? withoutQuery.slice(0, FIRST_TOUCH_PATH_MAX)
    : withoutQuery
}

function readUtm(record: AttributionRecord, key: SignupUtmKey): string | undefined {
  const firstKey = `first_${key}` as FirstSignupUtmKey
  return readAttributionString(record[firstKey])
    ?? readAttributionString(record[key])
}

export function parseSignupAttributionRecord(record: AttributionRecord | null | undefined): ResolvedSignupAttribution {
  if (!record)
    return {}

  const signup_ref = readSignupRef(record)
  const signup_plugin = readSignupPlugin(record, signup_ref)
  const first_touch_type = readFirstTouchType(record)
  const first_touch_path = readFirstTouchPath(record)
  const resolved: ResolvedSignupAttribution = {}

  if (signup_ref)
    resolved.signup_ref = signup_ref
  if (signup_plugin)
    resolved.signup_plugin = signup_plugin
  if (first_touch_type)
    resolved.first_touch_type = first_touch_type
  if (first_touch_path)
    resolved.first_touch_path = first_touch_path

  for (const key of SIGNUP_UTM_KEYS) {
    const value = readUtm(record, key)
    if (value)
      resolved[`first_${key}`] = value
  }

  const reconciled = reconcileLegacyFirstTouchPair(resolved)
  const signup_source = readSignupSource(record, reconciled)
  if (signup_source)
    reconciled.signup_source = signup_source

  return reconciled
}

export const SIGNUP_ATTRIBUTION_COOKIE_WINDOW_MS = 48 * 60 * 60 * 1000
export const CAPGO_ATTRIBUTION_COOKIE_MAX_AGE_SECONDS = 180 * 24 * 60 * 60

export function normalizeFirstTouchPath(pathname: string): string {
  const raw = pathname?.trim() || '/'
  const withoutTrailing = raw.replace(/\/+$/, '') || '/'
  return withoutTrailing.startsWith('/') ? withoutTrailing : `/${withoutTrailing}`
}

export function classifyFirstTouchType(normalizedPath: string): FirstTouchType {
  const path = normalizeFirstTouchPath(normalizedPath).toLowerCase()
  if (path === '/' || path === '')
    return 'home'
  if (path === '/pricing' || path.startsWith('/pricing/'))
    return 'pricing'
  if (path === '/blog' || path.startsWith('/blog/'))
    return 'blog'
  if (path === '/docs' || path.startsWith('/docs/'))
    return 'docs'
  if (path === '/plugins' || path.startsWith('/plugins/'))
    return 'plugin'
  if (path === '/solutions' || path.startsWith('/solutions/'))
    return 'solutions'
  if (path === '/login-cli' || path.startsWith('/login-cli/'))
    return 'cli'
  if (path === '/login' || path.startsWith('/login/'))
    return 'console'
  if (path === '/register' || path.startsWith('/register/'))
    return 'console'
  return 'other'
}

export function parseFirstTouchFromPathname(pathname: string): Pick<ResolvedSignupAttribution, 'first_touch_type' | 'first_touch_path'> {
  const first_touch_path = readFirstTouchPath({ first_touch_path: normalizeFirstTouchPath(pathname) })
  if (!first_touch_path)
    return {}
  return {
    first_touch_path,
    first_touch_type: classifyFirstTouchType(first_touch_path),
  }
}

export function buildFirstTouchAttributionFromLocation(search: string, pathname: string): ResolvedSignupAttribution {
  const params = search.startsWith('?') ? search.slice(1) : search
  const fromSearch = parseSignupAttributionSearchParams(new URLSearchParams(params))
  return mergeSignupAttribution(fromSearch, parseFirstTouchFromPathname(pathname))
}

export function hasFirstTouch(attribution: ResolvedSignupAttribution): boolean {
  return Boolean(attribution.first_touch_type && attribution.first_touch_path)
}

export function deriveSignupSourceFromRecord(attribution: ResolvedSignupAttribution): string | undefined {
  if (attribution.signup_ref)
    return attribution.signup_ref

  if (attribution.first_utm_source)
    return attribution.first_utm_source

  const path = attribution.first_touch_path
  const type = attribution.first_touch_type
  if (!path || !type)
    return undefined

  const segments = path.split('/').filter(Boolean)
  switch (type) {
    case 'home':
      return 'home'
    case 'pricing':
      return 'pricing'
    case 'console':
      return 'console'
    case 'cli':
      return 'cli'
    case 'blog': {
      const slug = segments[segments.indexOf('blog') + 1]
      return slug ? `blog:${slug}` : 'blog'
    }
    case 'docs': {
      const docsIndex = segments.indexOf('docs')
      const section = docsIndex >= 0 ? segments.slice(docsIndex + 1).join('/') : ''
      return section ? `docs:${section}` : 'docs'
    }
    case 'plugin': {
      const slug = segments[segments.indexOf('plugins') + 1]
      return slug ? `plugin:${slug}` : 'plugin'
    }
    case 'solutions': {
      const solutionsIndex = segments.indexOf('solutions')
      const rest = solutionsIndex >= 0 ? segments.slice(solutionsIndex + 1).join('/') : ''
      return rest ? `solutions:${rest}` : 'solutions'
    }
    case 'other':
    default: {
      const compact = segments.join('/')
      return compact ? `other:${compact}` : 'other'
    }
  }
}

function reconcileLegacyFirstTouchPair(attribution: ResolvedSignupAttribution): ResolvedSignupAttribution {
  if (!attribution.first_touch_path || attribution.first_touch_type !== 'other')
    return attribution
  const normalized = normalizeFirstTouchPath(attribution.first_touch_path)
  const expected = classifyFirstTouchType(normalized)
  if (expected === 'console' || expected === 'cli') {
    return {
      ...attribution,
      first_touch_type: expected,
      first_touch_path: normalized,
    }
  }
  return attribution
}

export function hasSignupAttributionFields(attribution: ResolvedSignupAttribution): boolean {
  if (
    attribution.signup_ref
    || attribution.signup_plugin
    || attribution.signup_source
    || attribution.first_touch_type
    || attribution.first_touch_path
  ) {
    return true
  }

  for (const key of SIGNUP_UTM_KEYS) {
    const firstKey = `first_${key}` as FirstSignupUtmKey
    if (attribution[firstKey])
      return true
  }

  return false
}

export function isWithinSignupAttributionWindow(
  createdAtIso: string | undefined,
  nowMs = Date.now(),
): boolean {
  if (!createdAtIso)
    return false

  const createdMs = Date.parse(createdAtIso)
  if (Number.isNaN(createdMs))
    return false

  return nowMs - createdMs <= SIGNUP_ATTRIBUTION_COOKIE_WINDOW_MS
}

/** Console signup attribution: metadata wins per field; session cookie fills gaps during the signup window. */
export function resolveConsoleSignupAttribution(
  metadata: ResolvedSignupAttribution,
  cookie: ResolvedSignupAttribution,
  userCreatedAt?: string,
  nowMs = Date.now(),
): ResolvedSignupAttribution {
  if (!isWithinSignupAttributionWindow(userCreatedAt, nowMs))
    return metadata

  const merged = mergeSignupAttribution(metadata, cookie)
  if (!merged.signup_source) {
    const derived = deriveSignupSourceFromRecord(merged)
    if (derived)
      merged.signup_source = derived
  }
  return merged
}

export function mergeSignupAttribution(
  ...sources: Array<ResolvedSignupAttribution | null | undefined>
): ResolvedSignupAttribution {
  const merged: ResolvedSignupAttribution = {}
  for (const source of sources) {
    if (!source)
      continue
    if (!merged.signup_ref && source.signup_ref)
      merged.signup_ref = source.signup_ref
    if (!merged.signup_plugin && source.signup_plugin)
      merged.signup_plugin = source.signup_plugin
    if (!merged.signup_source && source.signup_source)
      merged.signup_source = source.signup_source
    if (!merged.first_touch_type && source.first_touch_type)
      merged.first_touch_type = source.first_touch_type
    if (!merged.first_touch_path && source.first_touch_path)
      merged.first_touch_path = source.first_touch_path
    for (const key of SIGNUP_UTM_KEYS) {
      const firstKey = `first_${key}` as FirstSignupUtmKey
      if (!merged[firstKey] && source[firstKey])
        merged[firstKey] = source[firstKey]
    }
  }
  return merged
}

export function signupAttributionToPostHogSetOnce(attribution: ResolvedSignupAttribution): Record<string, string> {
  const properties: Record<string, string> = {}
  for (const [key, value] of Object.entries(attribution)) {
    if (typeof value === 'string' && value.length > 0)
      properties[key] = value
  }
  return properties
}

export function signupAttributionEventTags(
  attribution: ResolvedSignupAttribution,
): SignupAttributionEventTags {
  const tags: SignupAttributionEventTags = {}
  if (attribution.signup_plugin)
    tags.signup_plugin = attribution.signup_plugin
  if (attribution.signup_source)
    tags.signup_source = attribution.signup_source
  if (attribution.first_touch_type)
    tags.first_touch_type = attribution.first_touch_type
  return tags
}

export function parseCapgoAttributionCookieValue(raw: string | null | undefined): ResolvedSignupAttribution {
  if (!raw)
    return {}

  const trimmed = raw.trim()
  if (!trimmed)
    return {}

  try {
    const decoded = decodeURIComponent(trimmed)
    const parsed = JSON.parse(decoded) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
      return parseSignupAttributionRecord(parsed as AttributionRecord)
  }
  catch {
    // Fall through to query-string style cookies.
  }

  try {
    const params = new URLSearchParams(trimmed.includes('=') ? trimmed : decodeURIComponent(trimmed))
    const record: AttributionRecord = {}
    for (const [key, value] of params.entries()) {
      if (value)
        record[key] = value
    }
    return parseSignupAttributionRecord(record)
  }
  catch {
    return {}
  }
}

export function parseSignupAttributionSearchParams(search: URLSearchParams): ResolvedSignupAttribution {
  const record: AttributionRecord = {}
  for (const [key, value] of search.entries()) {
    if (value)
      record[key] = value
  }
  return parseSignupAttributionRecord(record)
}

export function attributionRecordForCapgoCookie(attribution: ResolvedSignupAttribution): Record<string, string> {
  const record: Record<string, string> = {}
  if (attribution.signup_ref)
    record.ref = attribution.signup_ref
  if (attribution.first_utm_source)
    record.utm_source = attribution.first_utm_source
  if (attribution.first_utm_medium)
    record.utm_medium = attribution.first_utm_medium
  if (attribution.first_utm_campaign)
    record.utm_campaign = attribution.first_utm_campaign
  if (attribution.first_touch_type)
    record.first_touch_type = attribution.first_touch_type
  if (attribution.first_touch_path)
    record.first_touch_path = attribution.first_touch_path
  if (attribution.signup_source)
    record.signup_source = attribution.signup_source
  return record
}

export function serializeCapgoAttributionCookie(attribution: ResolvedSignupAttribution): string {
  return JSON.stringify(attributionRecordForCapgoCookie(attribution))
}
