import type { User } from '@supabase/supabase-js'
import type { ResolvedSignupAttribution } from '../../supabase/functions/shared/signup-attribution.ts'
import {
  CAPGO_ATTRIBUTION_COOKIE_NAME,
  mergeSignupAttribution,
  parseCapgoAttributionCookieValue,
  parseSignupAttributionRecord,
  parseSignupAttributionSearchParams,
  signupAttributionEventTags,
  signupAttributionToPostHogSetOnce,
} from '../../supabase/functions/shared/signup-attribution.ts'

const APPLIED_STORAGE_KEY = 'capgo_signup_attribution_applied'

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

function readUrlSignupAttribution(): ResolvedSignupAttribution {
  if (typeof window === 'undefined')
    return {}
  return parseSignupAttributionSearchParams(new URLSearchParams(window.location.search))
}

function readUserMetadataSignupAttribution(user: User | null | undefined): ResolvedSignupAttribution {
  if (!user?.user_metadata)
    return {}
  return parseSignupAttributionRecord(user.user_metadata as Record<string, unknown>)
}

export function resolveSignupAttribution(user?: User | null): ResolvedSignupAttribution {
  const metadata = readUserMetadataSignupAttribution(user ?? null)
  const cookie = readCapgoAttributionCookie()
  const url = readUrlSignupAttribution()
  return mergeSignupAttribution(metadata, cookie, url)
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
    const appliedKey = `${APPLIED_STORAGE_KEY}:${user.id}`
    const fingerprint = JSON.stringify(setOnce)
    if (localStorage.getItem(appliedKey) === fingerprint)
      return

    // @ts-expect-error posthog is injected by the loader snippet
    const posthog = globalThis.posthog
    if (!posthog?.setPersonProperties)
      return

    posthog.identify(user.id)
    posthog.setPersonProperties({}, setOnce)
    localStorage.setItem(appliedKey, fingerprint)
  }
  catch (error) {
    console.warn('Cannot apply signup attribution to PostHog', error)
  }
}
