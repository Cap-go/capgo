// test/prescan/request-gate.test.ts
// Wiring tests for the prescan gate inside requestBuildInternal.
import type { BuildRequestOptions } from '../../src/schemas/build'
import { describe, expect, it } from 'bun:test'
import { requestBuildInternal } from '../../src/build/request'
import { makeProject } from './helpers'

describe('build request rejects contradictory prescan flags', () => {
  it('--prescan-ignore-fatal + --fail-on-warnings fails before any network call', async () => {
    const result = await requestBuildInternal(
      'com.demo.app',
      // prescan: true mirrors what requestBuildCommand injects for `build request` (the only
      // entrypoint that opts in). The gate + flag validation are opt-in (options.prescan === true).
      { platform: 'android', prescan: true, prescanIgnoreFatal: true, failOnWarnings: true } as BuildRequestOptions,
      true, // silent: no clack output from the test
    )
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/contradictory/i)
    // proves the validation throws before a job is ever requested
    expect(result.jobId).toBeUndefined()
  })

  it('--no-prescan skips the flag validation (combination is then irrelevant)', async () => {
    const result = await requestBuildInternal(
      'com.demo.app',
      {
        platform: 'android',
        prescan: false,
        prescanIgnoreFatal: true,
        failOnWarnings: true,
        // empty project: the run fails fast and offline at the capacitor-config step,
        // proving it got PAST flag validation
        path: makeProject({}),
        apikey: 'fake-key-for-test',
      } as BuildRequestOptions,
      true,
    )
    expect(result.success).toBe(false)
    expect(result.error ?? '').not.toMatch(/contradictory/i)
  })
})
