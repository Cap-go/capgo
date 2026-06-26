// test/prescan/engine.test.ts
import { describe, expect, it } from 'bun:test'
import { decideOutcome, runPrescan } from '../../src/build/prescan/engine'
import { ALL_CHECKS } from '../../src/build/prescan/registry'
import type { PrescanCheck, ScanContext } from '../../src/build/prescan/types'
import { makeP12, makeProfileXmlWithCert, makeProject } from './helpers'

const baseCtx = { appId: 'com.demo.app', platform: 'ios', projectDir: '/tmp/none' } as ScanContext

function check(partial: Partial<PrescanCheck>): PrescanCheck {
  return { id: 'test/x', platforms: ['ios', 'android'], run: async () => [], ...partial }
}

describe('runPrescan', () => {
  it('collects findings from applicable checks only', async () => {
    const report = await runPrescan(baseCtx, [
      check({ id: 'a', run: async () => [{ id: 'a', severity: 'error', title: 'bad' }] }),
      check({ id: 'b', platforms: ['android'] }), // not applicable on ios
    ])
    expect(report.checksRun).toBe(1)
    expect(report.counts.error).toBe(1)
  })

  it('isolates crashing checks as info findings', async () => {
    const report = await runPrescan(baseCtx, [
      check({ id: 'boom', run: async () => { throw new Error('kaput') } }),
    ])
    expect(report.counts.error).toBe(0)
    const crash = report.findings.find(f => f.id === 'prescan/check-crashed')
    expect(crash?.severity).toBe('info')
    expect(crash?.detail).toContain('kaput')
  })

  it('skips remote checks without supabase and reports one info finding', async () => {
    const report = await runPrescan(baseCtx, [
      check({ id: 'r1', remote: true, run: async () => [{ id: 'r1', severity: 'error', title: 'x' }] }),
      check({ id: 'r2', remote: true }),
    ])
    expect(report.counts.error).toBe(0)
    expect(report.skippedRemote).toBe(2)
    expect(report.findings.find(f => f.id === 'prescan/remote-skipped')?.title).toContain('2')
  })

  it('respects appliesTo', async () => {
    const report = await runPrescan(baseCtx, [
      check({ id: 'c', appliesTo: () => false, run: async () => [{ id: 'c', severity: 'error', title: 'x' }] }),
    ])
    expect(report.checksRun).toBe(0)
  })

  it('times out runaway checks as info', async () => {
    const report = await runPrescan(baseCtx, [
      check({ id: 'slow', run: () => new Promise(() => {}) }),
    ], { checkTimeoutMs: 50 })
    expect(report.findings.find(f => f.id === 'prescan/check-timeout')?.severity).toBe('info')
  })
})

describe('decideOutcome', () => {
  const report = (error: number, warning: number) =>
    ({ findings: [], counts: { error, warning, info: 0 }, skippedRemote: 0, durationMs: 0, checksRun: 0 })

  it('blocks on errors', () => expect(decideOutcome(report(1, 0), {})).toBe('block'))
  it('asks on warnings', () => expect(decideOutcome(report(0, 1), {})).toBe('ask'))
  it('proceeds when clean', () => expect(decideOutcome(report(0, 0), {})).toBe('proceed'))
  it('blocks warnings with failOnWarnings', () => expect(decideOutcome(report(0, 1), { failOnWarnings: true })).toBe('block'))
  it('ignoreFatal always proceeds', () => {
    expect(decideOutcome(report(5, 5), { ignoreFatal: true })).toBe('proceed')
  })
})

describe('fixture helpers', () => {
  it('makeProject writes nested files', () => {
    const dir = makeProject({ 'a/b/c.txt': 'hi' })
    expect(require('node:fs').readFileSync(`${dir}/a/b/c.txt`, 'utf8')).toBe('hi')
  })
  it('makeP12 produces an openable p12 with a sha1', () => {
    const p12 = makeP12()
    expect(p12.sha1).toMatch(/^[0-9a-f]{40}$/)
    expect(makeProfileXmlWithCert(p12)).toContain('DeveloperCertificates')
  })
})

describe('registry', () => {
  it('contains all 47 checks with unique ids', () => {
    const ids = ALL_CHECKS.map(c => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.length).toBe(47)
    for (const expected of [
      'shared/apikey-permission', 'shared/app-exists', 'shared/credentials-saved',
      'shared/cap-sync-stale', 'shared/node-linker-layout', 'shared/bundle-id-consistency',
      'ios/p12-opens', 'ios/p12-expiry', 'ios/profile-expiry', 'ios/profile-bundle-match',
      'ios/profile-type-vs-mode', 'ios/cert-profile-pairing', 'ios/targets-covered',
      'ios/infoplist-sanity', 'ios/asc-key-valid',
      'android/keystore-opens', 'android/keystore-expiry', 'android/cordova-vars-present',
      'android/gradle-props-heuristics', 'android/play-sa-json', 'android/flavor-exists',
      'android/agp8-package-attr',
      // 13 android manifest checks
      'android/manifest-well-formed', 'android/manifest-tag-typo', 'android/manifest-namespace-uri',
      'android/manifest-missing-prefix', 'android/manifest-exported-missing', 'android/manifest-multiple-uses-sdk',
      'android/manifest-duplicate-component', 'android/manifest-unique-permission', 'android/manifest-hardcoded-debuggable',
      'android/manifest-mock-location', 'android/manifest-exported-unprotected', 'android/manifest-query-all-packages',
      'android/manifest-deeplink-valid',
      // 10 android gradle/project checks
      'android/applicationid-present', 'android/capacitor-build-gradle-applied', 'android/gradle-wrapper-present',
      'android/flavor-dimensions', 'android/google-services-file', 'android/local-properties-committed',
      'android/sdk-floors', 'android/target-sdk-play', 'android/min-sdk-capacitor', 'android/version-fields',
      // 2 store-access checks
      'android/play-sa-access', 'ios/asc-key-access',
    ]) expect(ids).toContain(expected)
  })
})

describe('runPrescan crash isolation hardening', () => {
  it('a throwing appliesTo predicate is isolated — the scan still completes', async () => {
    const report = await runPrescan(baseCtx, [
      check({ id: 'bad-predicate', appliesTo: () => { throw new Error('predicate boom') } }),
      check({ id: 'good', run: async () => [{ id: 'good', severity: 'warning', title: 'w' }] }),
    ])
    const crash = report.findings.find(f => f.id === 'prescan/check-crashed')
    expect(crash?.severity).toBe('info')
    expect(crash?.detail).toContain('predicate boom')
    // the healthy check still ran
    expect(report.counts.warning).toBe(1)
    expect(report.checksRun).toBe(1)
  })

  it('crash detail is truncated and base64-looking runs are redacted (never leak blobs)', async () => {
    const blob = 'QmFzZTY0U2VjcmV0'.repeat(20) // 320 chars of base64-ish text
    const report = await runPrescan(baseCtx, [
      check({ id: 'leaky', run: async () => { throw new Error(`parse failed: ${blob} <- secret`) } }),
    ])
    const crash = report.findings.find(f => f.id === 'prescan/check-crashed')
    expect(crash?.detail).toContain('[redacted]')
    expect(crash?.detail).not.toContain(blob)
    expect((crash?.detail ?? '').length).toBeLessThanOrEqual(200)
  })
})
