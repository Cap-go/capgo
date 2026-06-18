// test/prescan/request-gate.test.ts
// Wiring tests for the prescan gate inside requestBuildInternal.
import type { BuildRequestOptions } from '../../src/schemas/build'
import { Buffer } from 'node:buffer'
import { afterEach, describe, expect, it } from 'bun:test'
import { executePrescan } from '../../src/build/prescan/command'
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

// Locks the deletion-before-gate invariant for play-sa-access on the
// --no-playstore-upload path: request.ts deletes PLAY_CONFIG_JSON from
// mergedCredentials (request.ts:1393) BEFORE handing the SAME object to
// executePrescan at the gate (request.ts:1620). willUploadToPlay keys purely
// off ctx.credentials.PLAY_CONFIG_JSON, so the deletion must suppress the
// outbound Google probe. These tests run the real executePrescan seam with a
// global-fetch spy so any Play network attempt is observable (and hermetic: no
// real Google call is ever allowed).
describe('play-sa-access probe is gated by PLAY_CONFIG_JSON presence in the threaded credentials', () => {
  const PLAY_JSON_B64 = Buffer.from(JSON.stringify({
    type: 'service_account',
    client_email: 'ci@demo.iam.gserviceaccount.com',
    project_id: 'demo-proj',
    private_key: '-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----\n',
    token_uri: 'https://oauth2.googleapis.com/token',
  }), 'utf8').toString('base64')

  const ANDROID_PROJECT = {
    'android/app/build.gradle': 'android {\n  defaultConfig {\n    applicationId "com.demo.app"\n  }\n}\n',
  }

  const realFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  /** Block all outbound fetch so any Play network attempt fails fast and hermetically. */
  function installFetchSpy(): void {
    globalThis.fetch = (async () => {
      // Fail closed: a blocked call becomes a clean network-error in the
      // validator, so the scan still completes without a real Google request.
      throw new Error('network blocked in test')
    }) as typeof fetch
  }

  it('runs the Play access check when PLAY_CONFIG_JSON is present in the credentials', async () => {
    installFetchSpy()
    const { report } = await executePrescan('com.demo.app', {
      platform: 'android',
      path: makeProject(ANDROID_PROJECT),
      credentials: { PLAY_CONFIG_JSON: PLAY_JSON_B64 },
    })
    // The check's appliesTo passed and it ran -> it emits a play-sa-access
    // finding (info/error/warning depending on the offline outcome).
    expect(report.findings.some(f => f.id === 'android/play-sa-access')).toBe(true)
  })

  it('does NOT run the Play access check once PLAY_CONFIG_JSON is deleted (the --no-playstore-upload contract)', async () => {
    installFetchSpy()
    // Mirror request.ts:1393 — playstoreUpload === false deletes the key from the
    // SAME credentials object that is then threaded into executePrescan (:1620).
    const mergedCredentials: Record<string, string> = { PLAY_CONFIG_JSON: PLAY_JSON_B64 }
    delete mergedCredentials.PLAY_CONFIG_JSON
    const { report } = await executePrescan('com.demo.app', {
      platform: 'android',
      path: makeProject(ANDROID_PROJECT),
      credentials: mergedCredentials,
    })
    // appliesTo (willUploadToPlay) is false -> the check never runs, so there is
    // no play-sa-access finding of any severity.
    expect(report.findings.some(f => f.id === 'android/play-sa-access')).toBe(false)
  })
})
