import type { User } from '@supabase/supabase-js'
import type { ResolvedSignupAttribution } from '../../supabase/functions/shared/signup-attribution.ts'
import {
  buildFirstTouchAttributionFromLocation,
  CAPGO_ATTRIBUTION_COOKIE_MAX_AGE_SECONDS,
  CAPGO_ATTRIBUTION_COOKIE_NAME,
  hasFirstTouch,
  hasSignupAttributionFields,
  mergeSignupAttribution,
  parseCapgoAttributionCookieValue,
  parseSignupAttributionRecord,
  parseSignupAttributionSearchParams,
  resolveConsoleSignupAttribution,
  serializeCapgoAttributionCookie,
  signupAttributionEventTags,
  signupAttributionToPostHogSetOnce,
} from '../../supabase/functions/shared/signup-attribution.ts'

function readCookieValue(name: string): string | null {
  if (typeof document === 'undefined')
    return null

  const encodedName = `${name}=`
  const parts = document.cookie.split(';')
  for (const part of parts) {
    const trimmed = part.trim()
    if (trimmed.startsWith(encodedName))
      return trimmed.slice(encodedName.length)
  }

  return null
}

function writeCapgoAttributionCookie(serialized: string): void {
  if (typeof document === 'undefined')
    return

  const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; secure' : ''
  const hostname = typeof location !== 'undefined' ? location.hostname : ''
  const domain = hostname.endsWith('capgo.app') ? '; domain=.capgo.app' : ''
  document.cookie = `${CAPGO_ATTRIBUTION_COOKIE_NAME}=${encodeURIComponent(serialized)}; path=/; max-age=${CAPGO_ATTRIBUTION_COOKIE_MAX_AGE_SECONDS}; samesite=lax${domain}${secure}`
}

function readCapgoAttributionCookie(): ResolvedSignupAttribution {
  const raw = readCookieValue(CAPGO_ATTRIBUTION_COOKIE_NAME)
  return parseCapgoAttributionCookieValue(raw)
}

function readUserMetadataSignupAttribution(user: User | null | undefined): ResolvedSignupAttribution {
  if (!user?.user_metadata)
    return {}
  return parseSignupAttributionRecord(user.user_metadata as Record<string, unknown>)
}

function readLocationSignupAttribution(): ResolvedSignupAttribution {
  if (typeof window === 'undefined')
    return {}

  const fromUrl = parseSignupAttributionSearchParams(new URLSearchParams(window.location.search))
  const cookie = readCapgoAttributionCookie()
  return mergeSignupAttribution(fromUrl, cookie)
}

function isConsoleAttributionCapturePath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, '') || '/'
  return path === '/login' || path === '/login-cli'
}

/** Persist first-touch and URL attribution on console login surfaces when the cookie lacks first touch. */
export function captureConsoleAttributionFromLocation(): void {
  if (typeof window === 'undefined')
    return

  if (!isConsoleAttributionCapturePath(window.location.pathname))
    return

  const existing = readCapgoAttributionCookie()
  if (hasFirstTouch(existing))
    return

  const incoming = buildFirstTouchAttributionFromLocation(window.location.search, window.location.pathname)
  const merged = mergeSignupAttribution(existing, incoming)
  if (!hasSignupAttributionFields(merged))
    return

  const serialized = serializeCapgoAttributionCookie(merged)
  const existingSerialized = hasSignupAttributionFields(existing)
    ? serializeCapgoAttributionCookie(existing)
    : ''
  if (serialized === existingSerialized)
    return

  writeCapgoAttributionCookie(serialized)
}

/** Signup attribution for authenticated console sessions (metadata; cookie and URL only during signup window). */
export function resolveSignupAttribution(user?: User | null): ResolvedSignupAttribution {
  const metadata = readUserMetadataSignupAttribution(user ?? null)
  const sessionAttribution = readLocationSignupAttribution()
  return resolveConsoleSignupAttribution(metadata, sessionAttribution, user?.created_at)
}

export function getSignupAttributionEventTags(user?: User | null) {
  return signupAttributionEventTags(resolveSignupAttribution(user))
}

export function applySignupAttributionToPostHog(user: User | null | undefined, _supaHost: string): void {
  if (!user?.id)
    return

  const attribution = resolveSignupAttribution(user)
  const setOnce = signupAttributionToPostHogSetOnce(attribution)
  if (Object.keys(setOnce).length === 0)
    return

  try {
    // @ts-expect-error posthog is injected by the loader snippet
    const posthog = globalThis.posthog
    if (!posthog?.setPersonProperties)
      return

    posthog.identify(user.id)
    posthog.setPersonProperties({}, setOnce)
  }
  catch (error) {
    console.warn('Cannot apply signup attribution to PostHog', error)
  }
}
