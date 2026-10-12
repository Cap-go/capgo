import type { User } from '@supabase/supabase-js'
import type { ResolvedSignupAttribution } from '../../supabase/functions/shared/signup-attribution.ts'
import {
  CAPGO_ATTRIBUTION_COOKIE_NAME,
  parseCapgoAttributionCookieValue,
  parseSignupAttributionRecord,
  resolveConsoleSignupAttribution,
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

function readCapgoAttributionCookie(): ResolvedSignupAttribution {
  const raw = readCookieValue(CAPGO_ATTRIBUTION_COOKIE_NAME)
  return parseCapgoAttributionCookieValue(raw)
}

function readUserMetadataSignupAttribution(user: User | null | undefined): ResolvedSignupAttribution {
  if (!user?.user_metadata)
    return {}
  return parseSignupAttributionRecord(user.user_metadata as Record<string, unknown>)
}

/** Signup attribution for authenticated console sessions (metadata; cookie only during signup window). */
export function resolveSignupAttribution(user?: User | null): ResolvedSignupAttribution {
  const metadata = readUserMetadataSignupAttribution(user ?? null)
  const cookie = readCapgoAttributionCookie()
  return resolveConsoleSignupAttribution(metadata, cookie, user?.created_at)
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
