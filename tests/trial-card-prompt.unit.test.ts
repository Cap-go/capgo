import { describe, expect, it } from 'vitest'
import {
  getTrialCardPromptMoment,
  markTrialCardPromptShown,
  readTrialCardPromptState,
  writeTrialCardPromptState,
} from '../src/utils/trialCardPrompt'

const NOW = Date.parse('2026-05-10T12:00:00.000Z')
const HOUR = 60 * 60 * 1000

function moment(trialDaysLeft: number, overrides: Partial<Parameters<typeof getTrialCardPromptMoment>[0]> = {}) {
  return getTrialCardPromptMoment({
    trialDaysLeft,
    paying: false,
    hasRealDevices: true,
    state: { shown: [] },
    now: NOW,
    ...overrides,
  })
}

describe('trial card prompt timing', () => {
  it.concurrent('asks when the app first reaches real devices early in the trial', () => {
    expect(moment(13)).toBe('activated')
  })

  it.concurrent('never asks without real devices, when paying, or too close to the trial end', () => {
    expect(moment(13, { hasRealDevices: false })).toBeNull()
    expect(moment(13, { paying: true })).toBeNull()
    expect(moment(3)).toBeNull()
  })

  it.concurrent('asks again mid-trial and before the trial ends, once per moment', () => {
    const afterActivated = markTrialCardPromptShown({ shown: [] }, 'activated', NOW - 3 * 24 * HOUR)
    expect(moment(8, { state: afterActivated })).toBe('mid-trial')
    expect(moment(5, { state: afterActivated })).toBe('trial-ending')

    const afterEnding = markTrialCardPromptShown(afterActivated, 'trial-ending', NOW - 24 * HOUR)
    expect(afterEnding.shown).toEqual(['activated', 'mid-trial', 'trial-ending'])
    expect(moment(4, { state: afterEnding })).toBeNull()
  })

  it.concurrent('keeps at least 20 hours between two prompts', () => {
    const state = markTrialCardPromptShown({ shown: [] }, 'activated', NOW - 2 * HOUR)
    expect(moment(8, { state })).toBeNull()
  })

  it.concurrent('shows only the latest moment to an org activated late in the trial', () => {
    expect(moment(5)).toBe('trial-ending')
  })

  it.concurrent('stores the state per org and ignores corrupted values', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value) },
    }
    writeTrialCardPromptState('org-a', { shown: ['activated'], lastShownAt: NOW }, storage)
    expect(readTrialCardPromptState('org-a', storage)).toEqual({ shown: ['activated'], lastShownAt: NOW })
    expect(readTrialCardPromptState('org-b', storage)).toEqual({ shown: [], lastShownAt: undefined })

    values.set('capgo-trial-card-prompt:org-c', '{not json')
    expect(readTrialCardPromptState('org-c', storage)).toEqual({ shown: [] })
  })
})
