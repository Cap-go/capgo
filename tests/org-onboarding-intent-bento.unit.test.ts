import { describe, expect, it, vi } from 'vitest'
import {
  buildOnboardingIntentBentoEventData,
  buildOnboardingIntentBentoTags,
  parseOrgOnboardingIntent,
} from '../supabase/functions/_backend/utils/org_onboarding_intent.ts'

vi.mock('../supabase/functions/_backend/utils/utils.ts', () => ({
  getEnv: (_c: unknown, key: string) => key === 'WEBAPP_URL' ? 'https://console.capgo.app/' : undefined,
  backgroundTask: async (_c: unknown, task: () => Promise<unknown>) => task(),
}))

function createContext() {
  return {
    get: (key: string) => key === 'requestId' ? 'request-id' : undefined,
  } as any
}

describe('parseOrgOnboardingIntent', () => {
  it.concurrent('returns unknown for invalid payloads', () => {
    expect(parseOrgOnboardingIntent(null)).toBe('unknown')
    expect(parseOrgOnboardingIntent({})).toBe('unknown')
    expect(parseOrgOnboardingIntent({ intent: 'invalid' })).toBe('unknown')
  })

  it.concurrent('returns the stored intent when valid', () => {
    expect(parseOrgOnboardingIntent({ intent: 'ota' })).toBe('ota')
    expect(parseOrgOnboardingIntent({ intent: 'builder' })).toBe('builder')
    expect(parseOrgOnboardingIntent({ intent: 'both' })).toBe('both')
    expect(parseOrgOnboardingIntent({ intent: 'exploring' })).toBe('exploring')
  })
})

describe('buildOnboardingIntentBentoTags', () => {
  it.concurrent('activates one intent tag and removes the others', () => {
    expect(buildOnboardingIntentBentoTags('both')).toEqual({
      segments: ['onboarding_intent:both'],
      deleteSegments: [
        'onboarding_intent:unknown',
        'onboarding_intent:ota',
        'onboarding_intent:builder',
        'onboarding_intent:exploring',
      ],
    })
  })
})

describe('buildOnboardingIntentBentoEventData', () => {
  it.concurrent('includes intent-specific onboarding URLs for Bento emails', () => {
    const c = createContext()

    const ota = buildOnboardingIntentBentoEventData(c, 'ota', {
      id: 'org-1',
      name: 'Acme',
      website: 'https://acme.example/',
    })
    expect(ota.onboarding_intent).toBe('ota')
    expect(ota.onboarding_url).toBe('https://console.capgo.app/app/new')
    expect(ota.onboarding_url_ota).toBe('https://console.capgo.app/app/new')

    const builder = buildOnboardingIntentBentoEventData(c, 'builder', {
      id: 'org-1',
      name: 'Acme',
      website: null,
    })
    expect(builder.onboarding_intent).toBe('builder')
    expect(builder.onboarding_url).toBe('https://console.capgo.app/app/new')

    const exploring = buildOnboardingIntentBentoEventData(c, 'exploring', {
      id: 'org-1',
      name: 'Acme',
      website: null,
    })
    expect(exploring.onboarding_url).toBe('https://console.capgo.app/apps')
  })
})
