import { describe, expect, it } from 'vitest'
import { classifyBuildTransition, mapBuildFailureCategory } from '../supabase/functions/_backend/utils/build_tracking.ts'

describe('classifyBuildTransition', () => {
  it.concurrent('returns "started" when pending becomes running', () => {
    expect(classifyBuildTransition({ previous: 'pending', next: 'running', timeoutApplied: false })).toBe('started')
  })

  it.concurrent('returns "started" when queued becomes running', () => {
    expect(classifyBuildTransition({ previous: 'queued', next: 'running', timeoutApplied: false })).toBe('started')
  })

  it.concurrent('returns "succeeded" when any non-terminal becomes success', () => {
    expect(classifyBuildTransition({ previous: 'running', next: 'succeeded', timeoutApplied: false })).toBe('succeeded')
    expect(classifyBuildTransition({ previous: 'pending', next: 'succeeded', timeoutApplied: false })).toBe('succeeded')
  })

  it.concurrent('returns "failed" when any non-terminal becomes failed', () => {
    expect(classifyBuildTransition({ previous: 'running', next: 'failed', timeoutApplied: false })).toBe('failed')
  })

  it.concurrent('returns "timed_out" when timeoutApplied is true', () => {
    expect(classifyBuildTransition({ previous: 'running', next: 'failed', timeoutApplied: true })).toBe('timed_out')
    expect(classifyBuildTransition({ previous: 'running', next: 'succeeded', timeoutApplied: true })).toBe('timed_out')
  })

  it.concurrent('returns null when previous status is already terminal (idempotency)', () => {
    expect(classifyBuildTransition({ previous: 'succeeded', next: 'succeeded', timeoutApplied: false })).toBeNull()
    expect(classifyBuildTransition({ previous: 'failed', next: 'failed', timeoutApplied: false })).toBeNull()
    expect(classifyBuildTransition({ previous: 'cancelled', next: 'cancelled', timeoutApplied: false })).toBeNull()
    expect(classifyBuildTransition({ previous: 'expired', next: 'expired', timeoutApplied: false })).toBeNull()
    expect(classifyBuildTransition({ previous: 'released', next: 'released', timeoutApplied: false })).toBeNull()
  })

  it.concurrent('returns null when previous is terminal even if timeoutApplied is true', () => {
    expect(classifyBuildTransition({ previous: 'failed', next: 'failed', timeoutApplied: true })).toBeNull()
  })

  it.concurrent('returns null when no state change happened (no transition)', () => {
    expect(classifyBuildTransition({ previous: 'pending', next: 'pending', timeoutApplied: false })).toBeNull()
    expect(classifyBuildTransition({ previous: 'running', next: 'running', timeoutApplied: false })).toBeNull()
  })

  it.concurrent('returns "timed_out" even when previous === next (timeout overrides no-change)', () => {
    expect(classifyBuildTransition({ previous: 'running', next: 'running', timeoutApplied: true })).toBe('timed_out')
  })
})

describe('mapBuildFailureCategory', () => {
  it.concurrent('returns timeout when the timeout flag is set', () => {
    expect(mapBuildFailureCategory({ timeoutApplied: true, errorMessage: null })).toBe('timeout')
  })

  it.concurrent('returns validation_error for validation-style messages', () => {
    expect(mapBuildFailureCategory({ timeoutApplied: false, errorMessage: 'Invalid build_mode value' })).toBe('validation_error')
    expect(mapBuildFailureCategory({ timeoutApplied: false, errorMessage: 'missing credentials' })).toBe('validation_error')
  })

  it.concurrent('returns builder_error when there is any other non-empty error', () => {
    expect(mapBuildFailureCategory({ timeoutApplied: false, errorMessage: 'gradle compile failed' })).toBe('builder_error')
  })

  it.concurrent('returns unknown when timeoutApplied is false and error is empty', () => {
    expect(mapBuildFailureCategory({ timeoutApplied: false, errorMessage: null })).toBe('unknown')
    expect(mapBuildFailureCategory({ timeoutApplied: false, errorMessage: '' })).toBe('unknown')
  })
})
