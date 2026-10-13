// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from 'vitest'
import {
  CAPGO_ATTRIBUTION_COOKIE_NAME,
  parseSignupAttributionRecord,
  serializeCapgoAttributionCookie,
} from '../supabase/functions/shared/signup-attribution.ts'
import { captureConsoleAttributionFromLocation } from '../src/services/signupAttribution.ts'

function writeTestCookie(attribution: ReturnType<typeof parseSignupAttributionRecord>): void {
  const serialized = serializeCapgoAttributionCookie(attribution)
  document.cookie = `${CAPGO_ATTRIBUTION_COOKIE_NAME}=${encodeURIComponent(serialized)}; path=/`
}

function readTestCookie(): Record<string, string> {
  const match = document.cookie.match(new RegExp(`(?:^|; )${CAPGO_ATTRIBUTION_COOKIE_NAME}=([^;]*)`))
  if (!match)
    return {}
  return JSON.parse(decodeURIComponent(match[1])) as Record<string, string>
}

describe('captureConsoleAttributionFromLocation', () => {
  afterEach(() => {
    document.cookie = `${CAPGO_ATTRIBUTION_COOKIE_NAME}=; path=/; max-age=0`
    window.history.replaceState({}, '', '/')
  })

  it('keeps referral-only cookie ref when landing on /login without query params', () => {
    writeTestCookie(parseSignupAttributionRecord({
      ref: 'plugin_old',
      signup_source: 'plugin_old',
    }))

    window.history.replaceState({}, '', '/login')
    captureConsoleAttributionFromLocation()

    expect(readTestCookie()).toMatchObject({
      ref: 'plugin_old',
      signup_source: 'plugin_old',
      first_touch_type: 'console',
      first_touch_path: '/login',
    })
  })

  it('prefers URL ref over an existing cookie when login already has first touch', () => {
    writeTestCookie(parseSignupAttributionRecord({
      ref: 'plugin_old',
      signup_source: 'plugin_old',
      first_touch_type: 'docs',
      first_touch_path: '/docs/intro/',
    }))

    window.history.replaceState({}, '', '/login?ref=plugin_new')
    captureConsoleAttributionFromLocation()

    expect(readTestCookie()).toMatchObject({
      ref: 'plugin_new',
      signup_source: 'plugin_new',
      first_touch_type: 'docs',
      first_touch_path: '/docs/intro/',
    })
  })
})
