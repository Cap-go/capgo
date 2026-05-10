import { describe, expect, it } from 'vitest'
import {
  calculateBuildRuntimeSeconds,
  calculateTimeoutCompletedAt,
  capBuildRuntimeSeconds,
  DEFAULT_BUILD_TIMEOUT_SECONDS,
  formatBuildTimeoutError,
  hasBuildTimedOut,
  MAX_BUILD_TIMEOUT_SECONDS,
  MIN_BUILD_TIMEOUT_SECONDS,
  normalizeBuildTimeoutSeconds,
  shouldApplyBuildTimeout,
} from '../supabase/functions/_backend/utils/build_timeout.ts'

describe('build timeout helpers', () => {
  it.concurrent('defaults and clamps timeout settings', () => {
    expect(normalizeBuildTimeoutSeconds(null)).toBe(DEFAULT_BUILD_TIMEOUT_SECONDS)
    expect(normalizeBuildTimeoutSeconds(60)).toBe(MIN_BUILD_TIMEOUT_SECONDS)
    expect(normalizeBuildTimeoutSeconds(999999)).toBe(MAX_BUILD_TIMEOUT_SECONDS)
    expect(normalizeBuildTimeoutSeconds(901.9)).toBe(901)
  })

  it.concurrent('calculates runtime from builder timestamps', () => {
    expect(calculateBuildRuntimeSeconds(1_000, 31_999)).toBe(30)
    expect(calculateBuildRuntimeSeconds(31_000, 1_000)).toBe(0)
    expect(calculateBuildRuntimeSeconds(null, 31_000)).toBeNull()
  })

  it.concurrent('detects running and completed builds past their timeout', () => {
    expect(hasBuildTimedOut(1_000, null, 900, 901_000)).toBe(true)
    expect(hasBuildTimedOut(1_000, null, 900, 900_000)).toBe(false)
    expect(hasBuildTimedOut(1_000, 901_000, 900)).toBe(true)
    expect(hasBuildTimedOut(1_000, 899_000, 900)).toBe(false)
  })

  it.concurrent('caps billable runtime at the configured timeout', () => {
    expect(capBuildRuntimeSeconds(900_000, 900)).toBe(900)
    expect(capBuildRuntimeSeconds(450, 900)).toBe(450)
    expect(calculateTimeoutCompletedAt(1_000, 900)).toBe(901_000)
  })

  it.concurrent('formats the timeout message in minutes', () => {
    expect(formatBuildTimeoutError(900)).toBe('Build exceeded configured timeout of 15 minutes')
  })

  it.concurrent('applies timeout to running builds past their timeout', () => {
    expect(shouldApplyBuildTimeout(1_000, null, 'running', 900, '2026-05-10T00:00:00.000Z', 901_000)).toBe(true)
    expect(shouldApplyBuildTimeout(1_000, null, 'running', 900, '2026-05-10T00:00:00.000Z', 899_000)).toBe(false)
  })

  it.concurrent('applies timeout to terminal builds only when the setting predates completion', () => {
    expect(shouldApplyBuildTimeout(1_000, 901_000, 'succeeded', 900, '1970-01-01T00:10:00.000Z')).toBe(true)
    expect(shouldApplyBuildTimeout(1_000, 901_000, 'succeeded', 900, '1970-01-01T00:20:00.000Z')).toBe(false)
  })
})
