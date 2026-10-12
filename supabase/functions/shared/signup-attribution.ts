export const CAPGO_ATTRIBUTION_COOKIE_NAME = 'capgo_attribution'

export const FIRST_TOUCH_TYPES = [
  'blog',
  'docs',
  'plugin',
  'pricing',
  'home',
  'solutions',
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

function readSignupSource(record: AttributionRecord, signupRef: string | undefined): string | undefined {
  return readAttributionString(record.signup_source) ?? signupRef
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
  const raw = readAttributionString(record.first_touch_path, FIRST_TOUCH_PATH_MAX)
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
  const signup_source = readSignupSource(record, signup_ref)
  const first_touch_type = readFirstTouchType(record)
  const first_touch_path = readFirstTouchPath(record)
  const resolved: ResolvedSignupAttribution = {}

  if (signup_ref)
    resolved.signup_ref = signup_ref
  if (signup_plugin)
    resolved.signup_plugin = signup_plugin
  if (signup_source)
    resolved.signup_source = signup_source
  if (first_touch_type)
    resolved.first_touch_type = first_touch_type
  if (first_touch_path)
    resolved.first_touch_path = first_touch_path

  for (const key of SIGNUP_UTM_KEYS) {
    const value = readUtm(record, key)
    if (value)
      resolved[`first_${key}`] = value
  }

  return resolved
}

export const SIGNUP_ATTRIBUTION_COOKIE_WINDOW_MS = 48 * 60 * 60 * 1000

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

/** Console signup attribution: metadata wins; cookie fills gaps only during the signup window. */
export function resolveConsoleSignupAttribution(
  metadata: ResolvedSignupAttribution,
  cookie: ResolvedSignupAttribution,
  userCreatedAt?: string,
  nowMs = Date.now(),
): ResolvedSignupAttribution {
  if (hasSignupAttributionFields(metadata))
    return metadata

  if (!isWithinSignupAttributionWindow(userCreatedAt, nowMs))
    return metadata

  return mergeSignupAttribution(metadata, cookie)
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
