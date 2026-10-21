import { describe, expect, it } from 'vitest'
import { getMissedStepIds } from '../supabase/functions/_backend/utils/onboardingMissedSteps.ts'

describe('getMissedStepIds', () => {
  it('returns open steps that sit before the last done step', () => {
    expect(getMissedStepIds([
      { id: 'init', status: 'pending' },
      { id: 'channel', status: 'done' },
      { id: 'updater', status: undefined },
      { id: 'code', status: 'skipped' },
      { id: 'device', status: 'done' },
      { id: 'upload', status: 'pending' },
    ])).toEqual(['init', 'updater'])
  })

  it('never reports the in-order current step or the final step', () => {
    expect(getMissedStepIds([{ id: 'a', status: 'done' }, { id: 'b' }, { id: 'c' }])).toEqual([])
    expect(getMissedStepIds([{ id: 'a' }, { id: 'b', status: 'warning' }])).toEqual([])
    expect(getMissedStepIds([])).toEqual([])
  })
})
