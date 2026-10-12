import { describe, expect, it } from 'vitest'
import {
  mergeSignupAttribution,
  parseCapgoAttributionCookieValue,
  parseSignupAttributionRecord,
  signupAttributionEventTags,
  signupAttributionToPostHogSetOnce,
  signupPluginFromRef,
} from '../shared/signup-attribution.ts'

describe('signup attribution parsing', () => {
  it('derives signup_plugin from plugin ref', () => {
    expect(signupPluginFromRef('plugin_capacitor-updater')).toBe('capacitor-updater')
    expect(signupPluginFromRef('plugin_')).toBeUndefined()
    expect(signupPluginFromRef('other_ref')).toBeUndefined()
  })

  it('maps metadata and utm aliases to first_utm properties', () => {
    const parsed = parseSignupAttributionRecord({
      ref: 'plugin_capacitor-updater',
      utm_source: 'docs',
      first_utm_medium: 'email',
    })

    expect(parsed).toEqual({
      signup_ref: 'plugin_capacitor-updater',
      signup_plugin: 'capacitor-updater',
      signup_source: 'plugin_capacitor-updater',
      first_utm_source: 'docs',
      first_utm_medium: 'email',
    })
  })

  it('reads first touch and signup_source fields from website payloads', () => {
    const parsed = parseSignupAttributionRecord({
      signup_source: 'docs:getting-started',
      first_touch_type: 'docs',
      first_touch_path: '/docs/getting-started/',
      ref: 'plugin_updater',
    })

    expect(parsed.signup_source).toBe('docs:getting-started')
    expect(parsed.first_touch_type).toBe('docs')
    expect(parsed.first_touch_path).toBe('/docs/getting-started/')
    expect(parsed.signup_plugin).toBe('updater')
  })

  it('ignores invalid first_touch_type values', () => {
    const parsed = parseSignupAttributionRecord({
      first_touch_type: 'newsletter',
      signup_source: 'blog:hello',
    })

    expect(parsed.first_touch_type).toBeUndefined()
    expect(parsed.signup_source).toBe('blog:hello')
  })

  it('merges sources with earlier precedence winning', () => {
    const merged = mergeSignupAttribution(
      { signup_ref: 'plugin_from_metadata', signup_plugin: 'from_metadata', signup_source: 'plugin_from_metadata' },
      { signup_ref: 'plugin_from_cookie', first_utm_source: 'cookie', first_touch_type: 'plugin' },
      { signup_ref: 'plugin_from_url', first_utm_campaign: 'url' },
    )

    expect(merged.signup_ref).toBe('plugin_from_metadata')
    expect(merged.signup_plugin).toBe('from_metadata')
    expect(merged.signup_source).toBe('plugin_from_metadata')
    expect(merged.first_utm_source).toBe('cookie')
    expect(merged.first_utm_campaign).toBe('url')
    expect(merged.first_touch_type).toBe('plugin')
  })

  it('parses JSON capgo_attribution cookies', () => {
    const raw = encodeURIComponent(JSON.stringify({
      ref: 'plugin_updater',
      utm_source: 'website',
      signup_source: 'plugin_updater',
      first_touch_type: 'plugin',
      first_touch_path: '/plugins/capacitor-updater/',
    }))
    expect(parseCapgoAttributionCookieValue(raw)).toEqual({
      signup_ref: 'plugin_updater',
      signup_plugin: 'updater',
      signup_source: 'plugin_updater',
      first_touch_type: 'plugin',
      first_touch_path: '/plugins/capacitor-updater/',
      first_utm_source: 'website',
    })
  })

  it('builds PostHog set_once and event tag payloads without PII fields', () => {
    const attribution = parseSignupAttributionRecord({
      ref: 'plugin_updater',
      utm_source: 'docs',
      signup_source: 'docs:intro',
      first_touch_type: 'docs',
      first_touch_path: '/docs/intro/',
      email: 'must-not-leak@example.com',
    })

    expect(signupAttributionToPostHogSetOnce(attribution)).toEqual({
      signup_ref: 'plugin_updater',
      signup_plugin: 'updater',
      signup_source: 'docs:intro',
      first_touch_type: 'docs',
      first_touch_path: '/docs/intro/',
      first_utm_source: 'docs',
    })
    expect(signupAttributionEventTags(attribution)).toEqual({
      signup_plugin: 'updater',
      signup_source: 'docs:intro',
      first_touch_type: 'docs',
    })
  })
})
