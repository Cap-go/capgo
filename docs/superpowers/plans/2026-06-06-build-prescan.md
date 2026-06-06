# Build Pre-Scan (Phase 1: engine + 22 checks) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `capgo build prescan` plus an automatic pre-upload scan in `build request` that catches user-preventable build failures (bad/expired credentials, skipped `cap sync`, broken node_modules layout, permission mismatches) before anything is uploaded.

**Architecture:** A check-registry engine in `cli/src/build/prescan/`. Each check is a `PrescanCheck` object returning structured `Finding`s against a shared `ScanContext` (capacitor config + merged credentials parsed once). Engine runs checks in parallel with crash isolation and a time budget; a pure `decideOutcome` function maps findings + flags to proceed/ask/block; reporters render terminal or `--json`.

**Tech Stack:** TypeScript (existing CLI), `node-forge` (already a dependency — P12/X.509), `fast-xml-parser` (single new dependency — Info.plist), Bun test runner (`bun test`), commander (existing CLI wiring).

**Spec:** `docs/superpowers/specs/2026-06-06-build-prescan-design.md`. The AndroidManifest 31-check pack is **Phase 2 — a separate plan**; this plan ships everything else (engine, CLI surface, cross-platform 6, iOS 9, Android core 7).

**Working directory:** `cli/` inside the repo (worktree `/Users/michaltremblay/Developer/capgo-new/.claude/worktrees/build-prescan`). All paths below are relative to `cli/` unless they start with `docs/`.

**Conventions for every task:**
- Run tests with: `bun test test/prescan/<file>.test.ts` from `cli/`.
- Tests use `bun:test` (`import { describe, expect, it } from 'bun:test'`) — new style for this feature; existing `.mjs` script-tests are untouched.
- Fixtures are generated in-test into `mkdtempSync` dirs (no binary files committed). A shared fixture helper is built in Task 2.
- Commit after every green test run. Conventional commits, no attribution lines.

---

## File structure (locked)

```
cli/src/build/prescan/
├── types.ts        # Severity, Finding, PrescanCheck, ScanContext, PrescanReport
├── engine.ts       # runPrescan(), decideOutcome()
├── report.ts       # renderTerminalReport(), renderJsonReport()
├── prompt.ts       # resolveWarningGate() — interactive proceed/exit
├── context.ts      # buildScanContext()
├── gradle.ts       # tiny shared parsers: gradleProperties(), settingsGradleModuleCount(), buildGradle helpers
├── checks/
│   ├── shared.ts            # cap-sync-stale, node-linker-layout, bundle-id-consistency
│   ├── shared-remote.ts     # apikey-permission, app-exists
│   ├── credentials.ts       # credentials-saved (local — reads merged credentials)
│   ├── ios-certs.ts         # p12-opens, p12-expiry, asc-key-valid
│   ├── ios-profiles.ts      # profile-expiry, profile-bundle-match, profile-type-vs-mode,
│   │                        #   cert-profile-pairing, targets-covered
│   ├── ios-plist.ts         # infoplist-sanity
│   ├── android-keystore.ts  # keystore-opens, keystore-expiry
│   └── android-project.ts   # cordova-vars-present, gradle-props-heuristics, play-sa-json,
│                            #   flavor-exists, agp8-package-attr
├── registry.ts     # ALL_CHECKS: PrescanCheck[]
└── command.ts      # prescanCommand() for commander; runPrescanGate() used by request.ts
cli/test/prescan/
├── helpers.ts      # makeProject() fixture builder, makeP12(), makeProfileXml(), makeCtx()
├── engine.test.ts
├── report.test.ts
├── checks-shared.test.ts
├── checks-credentials.test.ts
├── checks-ios-certs.test.ts
├── checks-ios-profiles.test.ts
├── checks-ios-plist.test.ts
├── checks-android-keystore.test.ts
├── checks-android-project.test.ts
└── command.test.ts
```

---

### Task 1: Types + engine (run, crash isolation, remote-skip, outcome)

**Files:**
- Create: `src/build/prescan/types.ts`
- Create: `src/build/prescan/engine.ts`
- Test: `test/prescan/engine.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// test/prescan/engine.test.ts
import { describe, expect, it } from 'bun:test'
import { decideOutcome, runPrescan } from '../../src/build/prescan/engine'
import type { PrescanCheck, ScanContext } from '../../src/build/prescan/types'

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
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `cd cli && bun test test/prescan/engine.test.ts`
Expected: FAIL — cannot resolve `../../src/build/prescan/engine`

- [ ] **Step 3: Implement types.ts**

```ts
// src/build/prescan/types.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../types/supabase.types'
import type { CapacitorConfig } from '../../schemas/config'

export type Severity = 'error' | 'warning' | 'info'
export type Platform = 'ios' | 'android'

export interface Finding {
  id: string
  severity: Severity
  title: string
  detail?: string
  fix?: string
  docsUrl?: string
}

export interface ScanContext {
  appId: string
  platform: Platform
  projectDir: string
  config?: CapacitorConfig
  /** merged credentials, env-var style keys (BUILD_CERTIFICATE_BASE64, ANDROID_KEYSTORE_FILE, ...) */
  credentials?: Record<string, string>
  distributionMode?: 'app_store' | 'ad_hoc'
  androidFlavor?: string
  apikey?: string
  supabase?: SupabaseClient<Database>
}

export interface PrescanCheck {
  id: string
  platforms: Platform[]
  /** requires ctx.supabase; skipped (with notice) when absent */
  remote?: boolean
  appliesTo?: (ctx: ScanContext) => boolean
  run: (ctx: ScanContext) => Promise<Finding[]>
}

export interface PrescanReport {
  findings: Finding[]
  counts: Record<Severity, number>
  skippedRemote: number
  durationMs: number
  checksRun: number
}

export type PrescanOutcome = 'proceed' | 'ask' | 'block'

export interface OutcomeOptions {
  failOnWarnings?: boolean
  ignoreFatal?: boolean
}
```

NOTE: verify the supabase Database types import path by looking at how `src/utils.ts` imports it (`zigrep "types/supabase" src/utils.ts`) and match it exactly.

- [ ] **Step 4: Implement engine.ts**

```ts
// src/build/prescan/engine.ts
import type { Finding, OutcomeOptions, PrescanCheck, PrescanOutcome, PrescanReport, ScanContext, Severity } from './types'

interface EngineOptions { checkTimeoutMs?: number }

const DEFAULT_CHECK_TIMEOUT_MS = 10_000

export async function runPrescan(ctx: ScanContext, checks: PrescanCheck[], options: EngineOptions = {}): Promise<PrescanReport> {
  const start = Date.now()
  const timeoutMs = options.checkTimeoutMs ?? DEFAULT_CHECK_TIMEOUT_MS
  const applicable = checks.filter(c => c.platforms.includes(ctx.platform) && (c.appliesTo ? c.appliesTo(ctx) : true))
  const remoteSkipped = applicable.filter(c => c.remote && !ctx.supabase)
  const runnable = applicable.filter(c => !(c.remote && !ctx.supabase))

  const findings = (await Promise.all(runnable.map(c => runIsolated(c, ctx, timeoutMs)))).flat()

  if (remoteSkipped.length > 0) {
    findings.push({
      id: 'prescan/remote-skipped',
      severity: 'info',
      title: `${remoteSkipped.length} remote check(s) skipped (no apikey or offline)`,
      detail: remoteSkipped.map(c => c.id).join(', '),
    })
  }

  const counts: Record<Severity, number> = { error: 0, warning: 0, info: 0 }
  for (const f of findings) counts[f.severity]++

  return { findings, counts, skippedRemote: remoteSkipped.length, durationMs: Date.now() - start, checksRun: runnable.length }
}

async function runIsolated(check: PrescanCheck, ctx: ScanContext, timeoutMs: number): Promise<Finding[]> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<Finding[]>((resolve) => {
    timer = setTimeout(() => resolve([{
      id: 'prescan/check-timeout',
      severity: 'info',
      title: `Check ${check.id} timed out and was skipped`,
    }]), timeoutMs)
  })
  try {
    return await Promise.race([check.run(ctx), timeout])
  }
  catch (error) {
    return [{
      id: 'prescan/check-crashed',
      severity: 'info',
      title: `Check ${check.id} crashed and was skipped`,
      detail: error instanceof Error ? error.message : String(error),
    }]
  }
  finally {
    if (timer) clearTimeout(timer)
  }
}

export function decideOutcome(report: Pick<PrescanReport, 'counts'>, options: OutcomeOptions): PrescanOutcome {
  if (options.ignoreFatal) return 'proceed'
  if (report.counts.error > 0) return 'block'
  if (report.counts.warning > 0) return options.failOnWarnings ? 'block' : 'ask'
  return 'proceed'
}
```

- [ ] **Step 5: Run tests, verify they pass**

Run: `cd cli && bun test test/prescan/engine.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 6: Commit**

```bash
git add cli/src/build/prescan/types.ts cli/src/build/prescan/engine.ts cli/test/prescan/engine.test.ts
git commit -m "feat(cli): prescan engine with crash isolation and outcome model"
```

---

### Task 2: Test fixture helpers

**Files:**
- Create: `test/prescan/helpers.ts`
- Test: (helpers are exercised by every later task; smoke-tested here via a tiny self-test)

- [ ] **Step 1: Implement helpers**

```ts
// test/prescan/helpers.ts
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import forge from 'node-forge'
import type { ScanContext } from '../../src/build/prescan/types'

/** Create a temp project dir from a {relativePath: content} map. */
export function makeProject(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'prescan-'))
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true })
    writeFileSync(join(dir, rel), content)
  }
  return dir
}

export function makeCtx(partial: Partial<ScanContext> & { projectDir: string }): ScanContext {
  return { appId: 'com.demo.app', platform: 'ios', ...partial }
}

export interface MadeP12 {
  base64: string
  password: string
  sha1: string            // lowercase hex of the cert
  notAfter: Date
}

/** Self-signed cert + key wrapped in a password-protected P12 (pure node-forge, no binaries). */
export function makeP12(opts: { password?: string, notAfter?: Date, cn?: string } = {}): MadeP12 {
  const password = opts.password ?? 'test-pass'
  const keys = forge.pki.rsa.generateKeyPair(2048)
  const cert = forge.pki.createCertificate()
  cert.publicKey = keys.publicKey
  cert.serialNumber = '01'
  cert.validity.notBefore = new Date(Date.now() - 86_400_000)
  cert.validity.notAfter = opts.notAfter ?? new Date(Date.now() + 365 * 86_400_000)
  const attrs = [{ name: 'commonName', value: opts.cn ?? 'Apple Distribution: Test' }]
  cert.setSubject(attrs)
  cert.setIssuer(attrs)
  cert.sign(keys.privateKey, forge.md.sha256.create())

  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], password, { algorithm: '3des' })
  const der = forge.asn1.toDer(p12Asn1).getBytes()
  const base64 = forge.util.encode64(der)

  const certDer = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes()
  const md = forge.md.sha1.create()
  md.update(certDer)
  const sha1 = md.digest().toHex().toLowerCase()

  return { base64, password, sha1, notAfter: cert.validity.notAfter }
}

/** Provisioning-profile XML the existing mobileprovision parser accepts (it scans for <?xml..</plist>). */
export function makeProfileXml(opts: {
  bundleId?: string
  teamId?: string
  expiration?: Date
  type?: 'app_store' | 'ad_hoc' | 'development'
  certSha1s?: string[]
} = {}): string {
  const teamId = opts.teamId ?? 'TEAM123456'
  const bundleId = opts.bundleId ?? 'com.demo.app'
  const expiration = (opts.expiration ?? new Date(Date.now() + 30 * 86_400_000)).toISOString().replace(/\.\d{3}Z$/, 'Z')
  // profile type markers used by parseMobileprovisionDetailed:
  //   app_store: no ProvisionedDevices + no ProvisionsAllDevices, development: <key>get-task-allow</key><true/>
  //   ad_hoc: ProvisionedDevices present
  const typeBlock = opts.type === 'ad_hoc'
    ? '<key>ProvisionedDevices</key><array><string>0000000000000000000000000000000000000000</string></array>'
    : opts.type === 'development'
      ? '<key>ProvisionedDevices</key><array><string>0000000000000000000000000000000000000000</string></array><key>Entitlements</key><dict><key>get-task-allow</key><true/></dict>'
      : ''
  const certs = (opts.certSha1s ?? []).map(() => '<data>AAAA</data>').join('')
  // DeveloperCertificates carry DER certs; the parser SHA1-hashes them. For tests we instead
  // build the data blocks from real DER when pairing matters — see makeProfileXmlWithCerts.
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Name</key><string>Test Profile</string>
<key>UUID</key><string>11111111-2222-3333-4444-555555555555</string>
<key>TeamIdentifier</key><array><string>${teamId}</string></array>
<key>ExpirationDate</key><date>${expiration}</date>
<key>Entitlements</key><dict>
  <key>application-identifier</key><string>${teamId}.${bundleId}</string>
</dict>
${typeBlock}
<key>DeveloperCertificates</key><array>${certs}</array>
</dict></plist>`
}

/** Profile XML whose DeveloperCertificates contain the actual DER of a makeP12 cert (for pairing tests). */
export function makeProfileXmlWithCert(p12: MadeP12, opts: Parameters<typeof makeProfileXml>[0] = {}): string {
  const p12Obj = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(forge.util.decode64(p12.base64)), p12.password)
  const certBag = p12Obj.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag]![0]!
  const certDer = forge.asn1.toDer(forge.pki.certificateToAsn1(certBag.cert!)).getBytes()
  const b64 = forge.util.encode64(certDer)
  const xml = makeProfileXml(opts)
  return xml.replace('<key>DeveloperCertificates</key><array></array>', `<key>DeveloperCertificates</key><array><data>${b64}</data></array>`)
}
```

- [ ] **Step 2: Smoke-test the helpers**

Append to `test/prescan/engine.test.ts`:

```ts
import { makeP12, makeProfileXmlWithCert, makeProject } from './helpers'

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
```

- [ ] **Step 3: Run, verify pass.** `cd cli && bun test test/prescan/engine.test.ts` → PASS. NOTE: if `parseMobileprovisionDetailed`'s actual type-detection markers differ from the comment above, read `src/build/mobileprovision-parser.ts` and adjust `makeProfileXml`'s `typeBlock` to produce the markers it looks for — the helper must round-trip through the real parser.

- [ ] **Step 4: Commit**

```bash
git add cli/test/prescan/helpers.ts cli/test/prescan/engine.test.ts
git commit -m "test(cli): prescan fixture helpers (in-memory p12 + profile xml)"
```

---

### Task 3: Reporters (terminal + JSON)

**Files:**
- Create: `src/build/prescan/report.ts`
- Test: `test/prescan/report.test.ts`

- [ ] **Step 1: Failing tests**

```ts
// test/prescan/report.test.ts
import { describe, expect, it } from 'bun:test'
import { renderJsonReport, renderTerminalReport } from '../../src/build/prescan/report'
import type { PrescanReport } from '../../src/build/prescan/types'

const report: PrescanReport = {
  findings: [
    { id: 'ios/p12-expiry', severity: 'error', title: 'Certificate expired', detail: 'expired 2026-01-01', fix: 'Renew and re-save credentials' },
    { id: 'android/gradle-props-heuristics', severity: 'warning', title: 'Serial Gradle build' },
    { id: 'prescan/remote-skipped', severity: 'info', title: '2 remote check(s) skipped (no apikey or offline)' },
  ],
  counts: { error: 1, warning: 1, info: 1 },
  skippedRemote: 2,
  durationMs: 123,
  checksRun: 20,
}

describe('renderTerminalReport', () => {
  it('groups by severity with fix hints and a summary line', () => {
    const out = renderTerminalReport(report, { verbose: false })
    expect(out).toContain('Certificate expired')
    expect(out).toContain('Renew and re-save credentials')
    expect(out).toContain('ios/p12-expiry')
    expect(out).toContain('1 error')
    expect(out).toContain('1 warning')
    // errors before warnings
    expect(out.indexOf('Certificate expired')).toBeLessThan(out.indexOf('Serial Gradle build'))
  })
})

describe('renderJsonReport', () => {
  it('emits stable machine-readable shape', () => {
    const parsed = JSON.parse(renderJsonReport(report))
    expect(parsed.version).toBe(1)
    expect(parsed.counts.error).toBe(1)
    expect(parsed.findings[0]).toEqual({
      id: 'ios/p12-expiry', severity: 'error', title: 'Certificate expired',
      detail: 'expired 2026-01-01', fix: 'Renew and re-save credentials',
    })
    expect(parsed.checksRun).toBe(20)
  })
})
```

- [ ] **Step 2: Run, verify fail.** `bun test test/prescan/report.test.ts` → module not found.

- [ ] **Step 3: Implement**

```ts
// src/build/prescan/report.ts
import type { Finding, PrescanReport, Severity } from './types'

const ORDER: Severity[] = ['error', 'warning', 'info']
const BADGE: Record<Severity, string> = { error: '✖ ERROR', warning: '⚠ WARN ', info: 'ℹ INFO ' }

export function renderTerminalReport(report: PrescanReport, opts: { verbose?: boolean } = {}): string {
  const lines: string[] = []
  for (const sev of ORDER) {
    for (const f of report.findings.filter(x => x.severity === sev)) {
      lines.push(`${BADGE[sev]}  ${f.title}  [${f.id}]`)
      if (f.detail) lines.push(`         ${f.detail}`)
      if (f.fix) lines.push(`         fix: ${f.fix}`)
      if (f.docsUrl) lines.push(`         docs: ${f.docsUrl}`)
    }
  }
  const { error, warning, info } = report.counts
  lines.push('')
  lines.push(`prescan: ${report.checksRun} checks in ${report.durationMs}ms — ${error} error(s), ${warning} warning(s), ${info} info`)
  if (opts.verbose) lines.push(`remote checks skipped: ${report.skippedRemote}`)
  return lines.join('\n')
}

export function renderJsonReport(report: PrescanReport): string {
  const findings = report.findings.map((f: Finding) => {
    const out: Record<string, string> = { id: f.id, severity: f.severity, title: f.title }
    if (f.detail) out.detail = f.detail
    if (f.fix) out.fix = f.fix
    if (f.docsUrl) out.docsUrl = f.docsUrl
    return out
  })
  return JSON.stringify({ version: 1, counts: report.counts, checksRun: report.checksRun, durationMs: report.durationMs, skippedRemote: report.skippedRemote, findings }, null, 2)
}
```

- [ ] **Step 4: Run, verify pass.** `bun test test/prescan/report.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add cli/src/build/prescan/report.ts cli/test/prescan/report.test.ts
git commit -m "feat(cli): prescan terminal and json reporters"
```

---

### Task 4: Shared local checks (cap-sync-stale, node-linker-layout, bundle-id-consistency) + gradle helpers

**Files:**
- Create: `src/build/prescan/gradle.ts`
- Create: `src/build/prescan/checks/shared.ts`
- Test: `test/prescan/checks-shared.test.ts`

- [ ] **Step 1: Failing tests**

```ts
// test/prescan/checks-shared.test.ts
import { describe, expect, it } from 'bun:test'
import { bundleIdConsistency, capSyncStale, nodeLinkerLayout } from '../../src/build/prescan/checks/shared'
import { makeCtx, makeProject } from './helpers'

const PKG = JSON.stringify({ dependencies: { '@capacitor/core': '7.0.0', '@capacitor/camera': '7.0.0', '@capacitor/android': '7.0.0' } })

describe('shared/cap-sync-stale', () => {
  it('errors when webDir is missing', async () => {
    const dir = makeProject({ 'package.json': PKG })
    const ctx = makeCtx({ projectDir: dir, platform: 'android', config: { appId: 'com.demo.app', appName: 'x', webDir: 'dist' } as any })
    const findings = await capSyncStale.run(ctx)
    expect(findings.some(f => f.id === 'shared/cap-sync-stale' && f.severity === 'error' && f.title.includes('webDir'))).toBe(true)
  })

  it('errors when an installed capacitor plugin is missing from capacitor.settings.gradle', async () => {
    const dir = makeProject({
      'package.json': PKG,
      'dist/index.html': '<html></html>',
      'android/capacitor.settings.gradle': `include ':capacitor-android'\n// no camera here`,
    })
    const ctx = makeCtx({ projectDir: dir, platform: 'android', config: { appId: 'com.demo.app', appName: 'x', webDir: 'dist' } as any })
    const findings = await capSyncStale.run(ctx)
    expect(findings.some(f => f.severity === 'error' && (f.detail ?? '').includes('@capacitor/camera'))).toBe(true)
  })

  it('passes on a synced android project', async () => {
    const dir = makeProject({
      'package.json': PKG,
      'dist/index.html': '<html></html>',
      'android/capacitor.settings.gradle': `include ':capacitor-android'\ninclude ':capacitor-camera'\nproject(':capacitor-camera').projectDir = new File('../node_modules/@capacitor/camera/android')`,
    })
    const ctx = makeCtx({ projectDir: dir, platform: 'android', config: { appId: 'com.demo.app', appName: 'x', webDir: 'dist' } as any })
    expect(await capSyncStale.run(ctx)).toEqual([])
  })
})

describe('shared/node-linker-layout', () => {
  it('errors when node_modules/.bun exists', async () => {
    const dir = makeProject({ 'node_modules/.bun/placeholder': '', 'package.json': PKG })
    const findings = await nodeLinkerLayout.run(makeCtx({ projectDir: dir }))
    expect(findings[0]?.severity).toBe('error')
    expect(findings[0]?.fix).toContain('--linker=hoisted')
  })

  it('warns when node_modules/.pnpm exists', async () => {
    const dir = makeProject({ 'node_modules/.pnpm/placeholder': '', 'package.json': PKG })
    expect((await nodeLinkerLayout.run(makeCtx({ projectDir: dir })))[0]?.severity).toBe('warning')
  })

  it('passes with hoisted layout', async () => {
    const dir = makeProject({ 'node_modules/@capacitor/core/package.json': '{}', 'package.json': PKG })
    expect(await nodeLinkerLayout.run(makeCtx({ projectDir: dir }))).toEqual([])
  })
})

describe('shared/bundle-id-consistency', () => {
  it('warns when gradle applicationId differs from capacitor appId', async () => {
    const dir = makeProject({
      'android/app/build.gradle': `android { defaultConfig { applicationId "com.other.app" } }`,
    })
    const ctx = makeCtx({ projectDir: dir, platform: 'android', config: { appId: 'com.demo.app', appName: 'x', webDir: 'dist' } as any })
    const findings = await bundleIdConsistency.run(ctx)
    expect(findings[0]?.severity).toBe('warning')
    expect(findings[0]?.detail).toContain('com.other.app')
  })

  it('passes when they match', async () => {
    const dir = makeProject({
      'android/app/build.gradle': `android { defaultConfig { applicationId "com.demo.app" } }`,
    })
    const ctx = makeCtx({ projectDir: dir, platform: 'android', config: { appId: 'com.demo.app', appName: 'x', webDir: 'dist' } as any })
    expect(await bundleIdConsistency.run(ctx)).toEqual([])
  })
})
```

- [ ] **Step 2: Run, verify fail.** `bun test test/prescan/checks-shared.test.ts`

- [ ] **Step 3: Implement gradle.ts**

```ts
// src/build/prescan/gradle.ts
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export function readTextIfExists(path: string): string | null {
  return existsSync(path) ? readFileSync(path, 'utf8') : null
}

/** Parse android/gradle.properties into a key→value map (ignores comments/blank lines). */
export function gradleProperties(projectDir: string): Record<string, string> {
  const raw = readTextIfExists(join(projectDir, 'android', 'gradle.properties'))
  const out: Record<string, string> = {}
  if (!raw) return out
  for (const line of raw.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#') || t.startsWith('//')) continue
    const eq = t.indexOf('=')
    if (eq > 0) out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim()
  }
  return out
}

/** Count `include ':…'` modules in android/capacitor.settings.gradle (proxy for plugin module count). */
export function settingsGradleModuleCount(projectDir: string): number {
  const raw = readTextIfExists(join(projectDir, 'android', 'capacitor.settings.gradle'))
  if (!raw) return 0
  return (raw.match(/^\s*include\s+':/gm) ?? []).length
}

export function appBuildGradle(projectDir: string): string | null {
  return readTextIfExists(join(projectDir, 'android', 'app', 'build.gradle'))
    ?? readTextIfExists(join(projectDir, 'android', 'app', 'build.gradle.kts'))
}

export function gradleApplicationId(projectDir: string): string | null {
  const gradle = appBuildGradle(projectDir)
  const m = gradle?.match(/applicationId\s*[=( ]\s*["']([\w.]+)["']/)
  return m?.[1] ?? null
}
```

- [ ] **Step 4: Implement checks/shared.ts**

```ts
// src/build/prescan/checks/shared.ts
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gradleApplicationId, readTextIfExists } from '../gradle'
import type { Finding, PrescanCheck, ScanContext } from '../types'

/** dependencies that are capacitor plugins (heuristic: @capacitor/* minus tooling, plus capacitor-* community names) */
function capacitorPluginDeps(projectDir: string): string[] {
  const pkgRaw = readTextIfExists(join(projectDir, 'package.json'))
  if (!pkgRaw) return []
  let pkg: { dependencies?: Record<string, string> }
  try { pkg = JSON.parse(pkgRaw) } catch { return [] }
  const NON_PLUGINS = new Set(['@capacitor/core', '@capacitor/cli', '@capacitor/ios', '@capacitor/android', '@capacitor/assets', '@capacitor/synapse'])
  return Object.keys(pkg.dependencies ?? {}).filter(d => d.startsWith('@capacitor/') && !NON_PLUGINS.has(d))
}

/** '@capacitor/camera' -> 'capacitor-camera' (cap sync's gradle project naming) */
function gradleModuleName(dep: string): string {
  return dep.replace(/^@/, '').replace(/\//g, '-')
}

export const capSyncStale: PrescanCheck = {
  id: 'shared/cap-sync-stale',
  platforms: ['ios', 'android'],
  async run(ctx: ScanContext): Promise<Finding[]> {
    const findings: Finding[] = []
    const webDir = ctx.config?.webDir ?? 'dist'
    if (!existsSync(join(ctx.projectDir, webDir))) {
      findings.push({
        id: 'shared/cap-sync-stale', severity: 'error',
        title: `webDir "${webDir}" does not exist — web assets were never built`,
        fix: 'Run your web build (e.g. `npm run build`) then `npx cap sync` before requesting a build',
      })
      return findings
    }
    const plugins = capacitorPluginDeps(ctx.projectDir)
    if (ctx.platform === 'android' && plugins.length > 0) {
      const settings = readTextIfExists(join(ctx.projectDir, 'android', 'capacitor.settings.gradle'))
      if (settings === null) {
        findings.push({
          id: 'shared/cap-sync-stale', severity: 'error',
          title: 'android/capacitor.settings.gradle is missing — `npx cap sync android` was never run',
          fix: 'Run `npx cap sync android`',
        })
      }
      else {
        const missing = plugins.filter(p => !settings.includes(`:${gradleModuleName(p)}`))
        if (missing.length > 0) {
          findings.push({
            id: 'shared/cap-sync-stale', severity: 'error',
            title: `${missing.length} Capacitor plugin(s) not synced into the Android project`,
            detail: `missing from capacitor.settings.gradle: ${missing.join(', ')}`,
            fix: 'Run `npx cap sync android` (sync, not copy — copy does not regenerate plugin projects)',
          })
        }
      }
    }
    if (ctx.platform === 'ios' && plugins.length > 0) {
      const podfile = readTextIfExists(join(ctx.projectDir, 'ios', 'App', 'Podfile'))
      if (podfile === null) {
        findings.push({
          id: 'shared/cap-sync-stale', severity: 'error',
          title: 'ios/App/Podfile is missing — `npx cap sync ios` was never run',
          fix: 'Run `npx cap sync ios`',
        })
      }
    }
    return findings
  },
}

export const nodeLinkerLayout: PrescanCheck = {
  id: 'shared/node-linker-layout',
  platforms: ['ios', 'android'],
  async run(ctx: ScanContext): Promise<Finding[]> {
    const nm = join(ctx.projectDir, 'node_modules')
    if (existsSync(join(nm, '.bun'))) {
      return [{
        id: 'shared/node-linker-layout', severity: 'error',
        title: 'bun isolated node_modules layout detected — Capacitor Gradle/Pod paths will not resolve ("No variants exist")',
        fix: 'Reinstall with `bun install --linker=hoisted`',
      }]
    }
    if (existsSync(join(nm, '.pnpm'))) {
      return [{
        id: 'shared/node-linker-layout', severity: 'warning',
        title: 'pnpm symlinked node_modules layout detected — Capacitor native builds often need a hoisted layout',
        fix: 'If the build fails resolving @capacitor/* paths, set `node-linker=hoisted` in .npmrc and reinstall',
      }]
    }
    return []
  },
}

export const bundleIdConsistency: PrescanCheck = {
  id: 'shared/bundle-id-consistency',
  platforms: ['ios', 'android'],
  async run(ctx: ScanContext): Promise<Finding[]> {
    const expected = ctx.config?.appId ?? ctx.appId
    if (ctx.platform === 'android') {
      const actual = gradleApplicationId(ctx.projectDir)
      if (actual && actual !== expected) {
        return [{
          id: 'shared/bundle-id-consistency', severity: 'warning',
          title: 'Gradle applicationId differs from the Capacitor appId',
          detail: `capacitor.config appId: ${expected} — android/app/build.gradle applicationId: ${actual}`,
          fix: 'Align them (or pass the intended appId explicitly to `build request`)',
        }]
      }
      return []
    }
    // ios: compare against pbxproj signable targets
    const { findSignableTargets, readPbxproj } = await import('../../pbxproj-parser')
    const pbx = readPbxproj(join(ctx.projectDir, 'ios', 'App'))
    if (!pbx) return []
    const targets = findSignableTargets(pbx)
    if (targets.length > 0 && !targets.some(t => t.bundleId === expected)) {
      return [{
        id: 'shared/bundle-id-consistency', severity: 'warning',
        title: 'No Xcode target uses the Capacitor appId as its bundle identifier',
        detail: `capacitor appId: ${expected} — targets: ${targets.map(t => `${t.name}=${t.bundleId}`).join(', ')}`,
        fix: 'Align PRODUCT_BUNDLE_IDENTIFIER with the appId, or build with the intended appId',
      }]
    }
    return []
  },
}
```

NOTE: confirm `readPbxproj(dir)` search root by reading `src/build/pbxproj-parser.ts` — if it expects the project root (not `ios/App`), pass `ctx.projectDir` instead and re-run the tests.

- [ ] **Step 5: Run, verify pass.** `bun test test/prescan/checks-shared.test.ts` → PASS.

- [ ] **Step 6: Commit**

```bash
git add cli/src/build/prescan/gradle.ts cli/src/build/prescan/checks/shared.ts cli/test/prescan/checks-shared.test.ts
git commit -m "feat(cli): prescan shared checks (cap sync, node linker, bundle id)"
```

---

### Task 5: Remote checks (apikey-permission, app-exists) + credentials-saved

**Files:**
- Create: `src/build/prescan/checks/shared-remote.ts`
- Create: `src/build/prescan/checks/credentials.ts`
- Test: `test/prescan/checks-credentials.test.ts`

- [ ] **Step 1: Failing tests** (supabase is faked with the minimal surface used)

```ts
// test/prescan/checks-credentials.test.ts
import { describe, expect, it } from 'bun:test'
import { apikeyPermission, appExists } from '../../src/build/prescan/checks/shared-remote'
import { credentialsSaved } from '../../src/build/prescan/checks/credentials'
import { makeCtx, makeProject } from './helpers'

function fakeSupabase(opts: { permission?: boolean, appRow?: object | null }) {
  return {
    rpc: async (_fn: string, _args: object) => ({ data: opts.permission ?? false, error: null }),
    from: (_t: string) => ({
      select: (_c: string) => ({
        eq: (_k: string, _v: string) => ({
          maybeSingle: async () => ({ data: opts.appRow ?? null, error: null }),
        }),
      }),
    }),
  } as any
}

describe('shared/apikey-permission', () => {
  it('errors when permission rpc returns false', async () => {
    const ctx = makeCtx({ projectDir: '/tmp', apikey: 'k', supabase: fakeSupabase({ permission: false }) })
    const findings = await apikeyPermission.run(ctx)
    expect(findings[0]?.severity).toBe('error')
    expect(findings[0]?.title).toContain('app.build_native')
  })
  it('passes when permission granted', async () => {
    const ctx = makeCtx({ projectDir: '/tmp', apikey: 'k', supabase: fakeSupabase({ permission: true }) })
    expect(await apikeyPermission.run(ctx)).toEqual([])
  })
})

describe('shared/app-exists', () => {
  it('errors when app row is absent', async () => {
    const ctx = makeCtx({ projectDir: '/tmp', supabase: fakeSupabase({ appRow: null }) })
    expect((await appExists.run(ctx))[0]?.severity).toBe('error')
  })
  it('passes when app found', async () => {
    const ctx = makeCtx({ projectDir: '/tmp', supabase: fakeSupabase({ appRow: { app_id: 'com.demo.app' } }) })
    expect(await appExists.run(ctx)).toEqual([])
  })
})

describe('shared/credentials-saved', () => {
  it('errors when no credentials at all', async () => {
    const ctx = makeCtx({ projectDir: makeProject({}), platform: 'ios', credentials: undefined })
    expect((await credentialsSaved.run(ctx))[0]?.severity).toBe('error')
  })
  it('errors listing missing required ios keys', async () => {
    const ctx = makeCtx({ projectDir: makeProject({}), platform: 'ios', credentials: { BUILD_CERTIFICATE_BASE64: 'x' } })
    const f = (await credentialsSaved.run(ctx))[0]
    expect(f?.severity).toBe('error')
    expect(f?.detail).toContain('CAPGO_IOS_PROVISIONING_MAP')
  })
  it('errors listing missing required android keys', async () => {
    const ctx = makeCtx({ projectDir: makeProject({}), platform: 'android', credentials: { ANDROID_KEYSTORE_FILE: 'x' } })
    const f = (await credentialsSaved.run(ctx))[0]
    expect(f?.detail).toContain('KEYSTORE_KEY_ALIAS')
  })
  it('passes with complete android credentials', async () => {
    const ctx = makeCtx({ projectDir: makeProject({}), platform: 'android', credentials: {
      ANDROID_KEYSTORE_FILE: 'x', KEYSTORE_KEY_ALIAS: 'a', KEYSTORE_STORE_PASSWORD: 'p',
    } })
    expect(await credentialsSaved.run(ctx)).toEqual([])
  })
})
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement shared-remote.ts**

```ts
// src/build/prescan/checks/shared-remote.ts
import type { Finding, PrescanCheck, ScanContext } from '../types'

export const apikeyPermission: PrescanCheck = {
  id: 'shared/apikey-permission',
  platforms: ['ios', 'android'],
  remote: true,
  async run(ctx: ScanContext): Promise<Finding[]> {
    // mirrors hasCliPermission() (src/utils.ts) — call the RPC directly so a false result
    // becomes a Finding instead of a thrown error
    const { data, error } = await ctx.supabase!.rpc('cli_check_permission', {
      apikey: ctx.apikey ?? '',
      permission_key: 'app.build_native',
      org_id: null,
      app_id: ctx.appId,
      channel_id: null,
    } as never)
    if (error) {
      return [{ id: 'shared/apikey-permission', severity: 'info', title: 'Could not verify build permission (network/API error)', detail: error.message }]
    }
    if (data !== true) {
      return [{
        id: 'shared/apikey-permission', severity: 'error',
        title: `This apikey lacks the app.build_native permission for ${ctx.appId}`,
        fix: 'Use an apikey from the org that owns the app (role with native-build rights), or fix the appId',
      }]
    }
    return []
  },
}

export const appExists: PrescanCheck = {
  id: 'shared/app-exists',
  platforms: ['ios', 'android'],
  remote: true,
  async run(ctx: ScanContext): Promise<Finding[]> {
    const { data, error } = await ctx.supabase!
      .from('apps').select('app_id').eq('app_id', ctx.appId).maybeSingle()
    if (error) {
      return [{ id: 'shared/app-exists', severity: 'info', title: 'Could not verify app existence (network/API error)', detail: error.message }]
    }
    if (!data) {
      return [{
        id: 'shared/app-exists', severity: 'error',
        title: `App ${ctx.appId} is not visible to this apikey`,
        detail: 'Either the app does not exist or it belongs to an org this key cannot access',
        fix: `Create it (npx @capgo/cli app add ${ctx.appId}) or pass the right appId / apikey`,
      }]
    }
    return []
  },
}
```

NOTE: confirm the RPC argument names against `hasCliPermission` in `src/utils.ts` (L1601-1605) and copy them exactly — the test fake does not validate them, the real API does.

- [ ] **Step 4: Implement checks/credentials.ts**

```ts
// src/build/prescan/checks/credentials.ts
import type { Finding, PrescanCheck, ScanContext } from '../types'

const REQUIRED: Record<'ios' | 'android', string[]> = {
  ios: ['BUILD_CERTIFICATE_BASE64', 'CAPGO_IOS_PROVISIONING_MAP', 'APP_STORE_CONNECT_TEAM_ID'],
  android: ['ANDROID_KEYSTORE_FILE', 'KEYSTORE_KEY_ALIAS'],
}

export const credentialsSaved: PrescanCheck = {
  id: 'shared/credentials-saved',
  platforms: ['ios', 'android'],
  async run(ctx: ScanContext): Promise<Finding[]> {
    const creds = ctx.credentials
    if (!creds || Object.keys(creds).length === 0) {
      return [{
        id: 'shared/credentials-saved', severity: 'error',
        title: `No ${ctx.platform} build credentials found`,
        fix: `Save them first: npx @capgo/cli build credentials save --appId ${ctx.appId} --platform ${ctx.platform}`,
      }]
    }
    const missing = REQUIRED[ctx.platform].filter(k => !creds[k])
    if (ctx.platform === 'android' && !creds.KEYSTORE_STORE_PASSWORD && !creds.KEYSTORE_KEY_PASSWORD)
      missing.push('KEYSTORE_STORE_PASSWORD (or KEYSTORE_KEY_PASSWORD)')
    if (missing.length > 0) {
      return [{
        id: 'shared/credentials-saved', severity: 'error',
        title: `Incomplete ${ctx.platform} credentials`,
        detail: `missing: ${missing.join(', ')}`,
        fix: 'Re-run `build credentials save` with the missing values',
      }]
    }
    return []
  },
}
```

- [ ] **Step 5: Run, verify pass.** `bun test test/prescan/checks-credentials.test.ts` → PASS.

- [ ] **Step 6: Commit**

```bash
git add cli/src/build/prescan/checks/shared-remote.ts cli/src/build/prescan/checks/credentials.ts cli/test/prescan/checks-credentials.test.ts
git commit -m "feat(cli): prescan remote permission/app checks + credential completeness"
```

---

### Task 6: iOS certificate checks (p12-opens, p12-expiry, asc-key-valid)

**Files:**
- Create: `src/build/prescan/checks/ios-certs.ts`
- Test: `test/prescan/checks-ios-certs.test.ts`

- [ ] **Step 1: Failing tests**

```ts
// test/prescan/checks-ios-certs.test.ts
import { describe, expect, it } from 'bun:test'
import forge from 'node-forge'
import { ascKeyValid, openP12, p12Expiry, p12Opens } from '../../src/build/prescan/checks/ios-certs'
import { makeCtx, makeP12 } from './helpers'

function ctxWith(creds: Record<string, string>) {
  return makeCtx({ projectDir: '/tmp', platform: 'ios', credentials: creds })
}

describe('ios/p12-opens', () => {
  it('errors on wrong password', async () => {
    const p12 = makeP12({ password: 'right' })
    const f = await p12Opens.run(ctxWith({ BUILD_CERTIFICATE_BASE64: p12.base64, P12_PASSWORD: 'wrong' }))
    expect(f[0]?.severity).toBe('error')
    expect(f[0]?.title).toContain('password')
  })
  it('passes with the right password', async () => {
    const p12 = makeP12({ password: 'right' })
    expect(await p12Opens.run(ctxWith({ BUILD_CERTIFICATE_BASE64: p12.base64, P12_PASSWORD: 'right' }))).toEqual([])
  })
  it('errors on garbage base64', async () => {
    const f = await p12Opens.run(ctxWith({ BUILD_CERTIFICATE_BASE64: 'not-a-p12', P12_PASSWORD: '' }))
    expect(f[0]?.severity).toBe('error')
  })
})

describe('ios/p12-expiry', () => {
  it('errors when expired', async () => {
    const p12 = makeP12({ notAfter: new Date(Date.now() - 86_400_000) })
    const f = await p12Expiry.run(ctxWith({ BUILD_CERTIFICATE_BASE64: p12.base64, P12_PASSWORD: p12.password }))
    expect(f[0]?.severity).toBe('error')
  })
  it('warns when expiring within 30 days', async () => {
    const p12 = makeP12({ notAfter: new Date(Date.now() + 10 * 86_400_000) })
    const f = await p12Expiry.run(ctxWith({ BUILD_CERTIFICATE_BASE64: p12.base64, P12_PASSWORD: p12.password }))
    expect(f[0]?.severity).toBe('warning')
  })
  it('passes when far from expiry', async () => {
    const p12 = makeP12()
    expect(await p12Expiry.run(ctxWith({ BUILD_CERTIFICATE_BASE64: p12.base64, P12_PASSWORD: p12.password }))).toEqual([])
  })
})

describe('ios/asc-key-valid', () => {
  const goodP8 = () => {
    // minimal PEM-looking p8; format check only (full EC parse is out of scope for forge)
    const pem = '-----BEGIN PRIVATE KEY-----\nMIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwdwIBAQQg\n-----END PRIVATE KEY-----\n'
    return forge.util.encode64(pem)
  }
  it('passes with plausible key id, issuer uuid, and p8 pem', async () => {
    const f = await ascKeyValid.run(ctxWith({
      APPLE_KEY_ID: 'ABCDE12345', APPLE_ISSUER_ID: '12345678-1234-1234-1234-123456789012', APPLE_KEY_CONTENT: goodP8(),
    }))
    expect(f).toEqual([])
  })
  it('errors on malformed issuer id', async () => {
    const f = await ascKeyValid.run(ctxWith({
      APPLE_KEY_ID: 'ABCDE12345', APPLE_ISSUER_ID: 'not-a-uuid', APPLE_KEY_CONTENT: goodP8(),
    }))
    expect(f[0]?.severity).toBe('error')
  })
  it('errors when key content is not a PEM private key', async () => {
    const f = await ascKeyValid.run(ctxWith({
      APPLE_KEY_ID: 'ABCDE12345', APPLE_ISSUER_ID: '12345678-1234-1234-1234-123456789012',
      APPLE_KEY_CONTENT: forge.util.encode64('hello'),
    }))
    expect(f[0]?.severity).toBe('error')
  })
  it('is silent when ASC keys are absent (output-upload / ad_hoc flows)', async () => {
    expect(await ascKeyValid.run(ctxWith({}))).toEqual([])
  })
})
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement**

```ts
// src/build/prescan/checks/ios-certs.ts
import forge from 'node-forge'
import type { Finding, PrescanCheck, ScanContext } from '../types'

export interface OpenedP12 {
  cert: forge.pki.Certificate
  sha1: string
}

/** Open the saved P12; throws on wrong password / garbage. Exported for reuse by pairing check. */
export function openP12(base64: string, password: string): OpenedP12 {
  const der = forge.util.decode64(base64)
  const asn1 = forge.asn1.fromDer(der)
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, password)
  const bags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? []
  const cert = bags[0]?.cert
  if (!cert) throw new Error('no certificate inside the P12')
  const certDer = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes()
  const md = forge.md.sha1.create()
  md.update(certDer)
  return { cert, sha1: md.digest().toHex().toLowerCase() }
}

const has = (ctx: ScanContext, key: string) => Boolean(ctx.credentials?.[key])

export const p12Opens: PrescanCheck = {
  id: 'ios/p12-opens',
  platforms: ['ios'],
  appliesTo: ctx => has(ctx, 'BUILD_CERTIFICATE_BASE64'),
  async run(ctx): Promise<Finding[]> {
    try {
      openP12(ctx.credentials!.BUILD_CERTIFICATE_BASE64, ctx.credentials!.P12_PASSWORD ?? '')
      return []
    }
    catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const isMac = /mac|hmac|password|invalid/i.test(msg)
      return [{
        id: 'ios/p12-opens', severity: 'error',
        title: isMac ? 'The P12 certificate cannot be opened with the saved password' : 'The saved certificate is not a valid P12 file',
        detail: msg,
        fix: 'Re-export the .p12 and re-run `build credentials save` with the correct --p12-password',
      }]
    }
  },
}

const THIRTY_DAYS_MS = 30 * 86_400_000

export const p12Expiry: PrescanCheck = {
  id: 'ios/p12-expiry',
  platforms: ['ios'],
  appliesTo: ctx => has(ctx, 'BUILD_CERTIFICATE_BASE64'),
  async run(ctx): Promise<Finding[]> {
    let opened: OpenedP12
    try { opened = openP12(ctx.credentials!.BUILD_CERTIFICATE_BASE64, ctx.credentials!.P12_PASSWORD ?? '') }
    catch { return [] } // p12-opens owns that failure
    const notAfter = opened.cert.validity.notAfter
    const left = notAfter.getTime() - Date.now()
    if (left <= 0) {
      return [{
        id: 'ios/p12-expiry', severity: 'error',
        title: `Signing certificate expired on ${notAfter.toISOString().slice(0, 10)}`,
        fix: 'Create a new distribution certificate in the Apple Developer portal and re-save credentials',
      }]
    }
    if (left < THIRTY_DAYS_MS) {
      return [{
        id: 'ios/p12-expiry', severity: 'warning',
        title: `Signing certificate expires in ${Math.ceil(left / 86_400_000)} day(s) (${notAfter.toISOString().slice(0, 10)})`,
        fix: 'Renew it soon to avoid build interruptions',
      }]
    }
    return []
  },
}

const KEY_ID_RE = /^[A-Z0-9]{10}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const ascKeyValid: PrescanCheck = {
  id: 'ios/asc-key-valid',
  platforms: ['ios'],
  appliesTo: ctx => has(ctx, 'APPLE_KEY_CONTENT') || has(ctx, 'APPLE_KEY_ID') || has(ctx, 'APPLE_ISSUER_ID'),
  async run(ctx): Promise<Finding[]> {
    const findings: Finding[] = []
    const { APPLE_KEY_ID, APPLE_ISSUER_ID, APPLE_KEY_CONTENT } = ctx.credentials ?? {}
    if (APPLE_KEY_ID && !KEY_ID_RE.test(APPLE_KEY_ID))
      findings.push({ id: 'ios/asc-key-valid', severity: 'error', title: 'APPLE_KEY_ID is not a 10-char App Store Connect key ID', detail: `got: ${APPLE_KEY_ID}` })
    if (APPLE_ISSUER_ID && !UUID_RE.test(APPLE_ISSUER_ID))
      findings.push({ id: 'ios/asc-key-valid', severity: 'error', title: 'APPLE_ISSUER_ID is not a UUID', detail: `got: ${APPLE_ISSUER_ID}`, fix: 'Copy the Issuer ID from App Store Connect → Users and Access → Integrations' })
    if (APPLE_KEY_CONTENT) {
      let pem = ''
      try { pem = forge.util.decode64(APPLE_KEY_CONTENT) } catch { /* fallthrough */ }
      if (!pem.includes('-----BEGIN PRIVATE KEY-----'))
        findings.push({ id: 'ios/asc-key-valid', severity: 'error', title: 'APPLE_KEY_CONTENT does not decode to a .p8 private key PEM', fix: 'Base64-encode the raw AuthKey_XXXX.p8 file content' })
    }
    return findings
  },
}
```

- [ ] **Step 4: Run, verify pass.** `bun test test/prescan/checks-ios-certs.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add cli/src/build/prescan/checks/ios-certs.ts cli/test/prescan/checks-ios-certs.test.ts
git commit -m "feat(cli): prescan ios certificate checks (p12 open/expiry, asc key format)"
```

---

### Task 7: iOS provisioning-profile checks (expiry, bundle-match, type-vs-mode, cert pairing, targets-covered)

**Files:**
- Create: `src/build/prescan/checks/ios-profiles.ts`
- Test: `test/prescan/checks-ios-profiles.test.ts`

**Pre-step (REQUIRED, 5 min):** read `buildProvisioningMap()` in `src/build/credentials-command.ts` (~L235-252) and the consumption side in `src/build/request.ts` to confirm the exact serialized shape of `CAPGO_IOS_PROVISIONING_MAP`. The code below assumes **JSON object `{ [targetName: string]: base64Profile }`**. If reality differs (e.g. array of `target:base64` strings), adapt `parseProvisioningMap()` and the test fixtures accordingly before writing them — everything else is unchanged.

- [ ] **Step 1: Failing tests**

```ts
// test/prescan/checks-ios-profiles.test.ts
import { describe, expect, it } from 'bun:test'
import {
  certProfilePairing, parseProvisioningMap, profileBundleMatch, profileExpiry, profileTypeVsMode, targetsCovered,
} from '../../src/build/prescan/checks/ios-profiles'
import { makeCtx, makeP12, makeProfileXml, makeProfileXmlWithCert, makeProject } from './helpers'

const b64 = (s: string) => Buffer.from(s).toString('base64')
const mapWith = (xml: string) => JSON.stringify({ App: b64(xml) })

function ctxWith(creds: Record<string, string>, extra: object = {}) {
  return makeCtx({ projectDir: '/tmp', platform: 'ios', credentials: creds, distributionMode: 'app_store', ...extra })
}

describe('ios/profile-expiry', () => {
  it('errors on expired profile', async () => {
    const xml = makeProfileXml({ expiration: new Date(Date.now() - 86_400_000) })
    const f = await profileExpiry.run(ctxWith({ CAPGO_IOS_PROVISIONING_MAP: mapWith(xml) }))
    expect(f[0]?.severity).toBe('error')
  })
  it('warns within 30 days', async () => {
    const xml = makeProfileXml({ expiration: new Date(Date.now() + 5 * 86_400_000) })
    expect((await profileExpiry.run(ctxWith({ CAPGO_IOS_PROVISIONING_MAP: mapWith(xml) })))[0]?.severity).toBe('warning')
  })
})

describe('ios/profile-bundle-match', () => {
  it('errors when profile bundle id mismatches the app', async () => {
    const xml = makeProfileXml({ bundleId: 'com.other.app' })
    const f = await profileBundleMatch.run(ctxWith({ CAPGO_IOS_PROVISIONING_MAP: mapWith(xml) }))
    expect(f[0]?.severity).toBe('error')
    expect(f[0]?.detail).toContain('com.other.app')
  })
  it('accepts wildcard profiles', async () => {
    const xml = makeProfileXml({ bundleId: '*' })
    expect(await profileBundleMatch.run(ctxWith({ CAPGO_IOS_PROVISIONING_MAP: mapWith(xml) }))).toEqual([])
  })
  it('accepts exact match', async () => {
    const xml = makeProfileXml({ bundleId: 'com.demo.app' })
    expect(await profileBundleMatch.run(ctxWith({ CAPGO_IOS_PROVISIONING_MAP: mapWith(xml) }))).toEqual([])
  })
})

describe('ios/profile-type-vs-mode', () => {
  it('errors when ad_hoc profile is used for app_store distribution', async () => {
    const xml = makeProfileXml({ type: 'ad_hoc' })
    const f = await profileTypeVsMode.run(ctxWith({ CAPGO_IOS_PROVISIONING_MAP: mapWith(xml) }))
    expect(f[0]?.severity).toBe('error')
  })
  it('passes matching app_store profile', async () => {
    const xml = makeProfileXml({ type: 'app_store' })
    expect(await profileTypeVsMode.run(ctxWith({ CAPGO_IOS_PROVISIONING_MAP: mapWith(xml) }))).toEqual([])
  })
})

describe('ios/cert-profile-pairing', () => {
  it('errors when the P12 cert is not in DeveloperCertificates', async () => {
    const p12 = makeP12()
    const other = makeP12()
    const xml = makeProfileXmlWithCert(other) // profile carries a DIFFERENT cert
    const f = await certProfilePairing.run(ctxWith({
      BUILD_CERTIFICATE_BASE64: p12.base64, P12_PASSWORD: p12.password, CAPGO_IOS_PROVISIONING_MAP: mapWith(xml),
    }))
    expect(f[0]?.severity).toBe('error')
    expect(f[0]?.title).toContain('provisioning profile')
  })
  it('passes when the profile contains the P12 cert', async () => {
    const p12 = makeP12()
    const xml = makeProfileXmlWithCert(p12)
    expect(await certProfilePairing.run(ctxWith({
      BUILD_CERTIFICATE_BASE64: p12.base64, P12_PASSWORD: p12.password, CAPGO_IOS_PROVISIONING_MAP: mapWith(xml),
    }))).toEqual([])
  })
})

describe('ios/targets-covered', () => {
  it('errors when a signable target has no profile in the map', async () => {
    const dir = makeProject({
      'ios/App/App.xcodeproj/project.pbxproj': `
/* Begin PBXNativeTarget section */
  13B07F861A680F5B00A75B9A /* App */ = { isa = PBXNativeTarget; buildConfigurationList = 13B07F931A680F5B00A75B9A; name = App; productType = "com.apple.product-type.application"; };
  AAAA07F861A680F5B00A75B9 /* Widget */ = { isa = PBXNativeTarget; buildConfigurationList = AAAA07F931A680F5B00A75B9; name = Widget; productType = "com.apple.product-type.app-extension"; };
/* End PBXNativeTarget section */
buildSettings = { PRODUCT_BUNDLE_IDENTIFIER = com.demo.app; };`,
    })
    const xml = makeProfileXml()
    const ctx = makeCtx({ projectDir: dir, platform: 'ios', credentials: { CAPGO_IOS_PROVISIONING_MAP: mapWith(xml) } })
    const f = await targetsCovered.run(ctx)
    expect(f[0]?.severity).toBe('error')
    expect(f[0]?.detail).toContain('Widget')
  })
})
```

NOTE: the pbxproj fixture above is approximate — before finalizing this test, read `findSignableTargets` in `src/build/pbxproj-parser.ts` and shape the fixture so it returns two targets (`App`, `Widget`). If parsing the minimal fixture proves brittle, copy a trimmed real pbxproj from `~/Developer/capgo-saas/capgo_builder/tutorial-app/ios` into the test as a string constant.

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement**

```ts
// src/build/prescan/checks/ios-profiles.ts
import { join } from 'node:path'
import { parseMobileprovisionFromBase64 } from '../../mobileprovision-parser'
import type { Finding, PrescanCheck, ScanContext } from '../types'
import { openP12 } from './ios-certs'

// NOTE: parseMobileprovisionFromBase64 returns the basic info; for detailed fields we re-parse
// the decoded buffer through the detailed parser. If the parser module exposes
// parseMobileprovisionDetailedFromBase64 use it; otherwise add that export (5 lines, mirrors
// the file-based variant) as part of this task.
import { parseMobileprovisionDetailedFromBase64 } from '../../mobileprovision-parser'

export interface MappedProfile {
  target: string
  base64: string
}

export function parseProvisioningMap(ctx: ScanContext): MappedProfile[] {
  const raw = ctx.credentials?.CAPGO_IOS_PROVISIONING_MAP
  if (!raw) return []
  try {
    const obj = JSON.parse(raw) as Record<string, string>
    return Object.entries(obj).map(([target, base64]) => ({ target, base64 }))
  }
  catch { return [] }
}

const THIRTY_DAYS_MS = 30 * 86_400_000
const hasMap = (ctx: ScanContext) => parseProvisioningMap(ctx).length > 0

export const profileExpiry: PrescanCheck = {
  id: 'ios/profile-expiry',
  platforms: ['ios'],
  appliesTo: hasMap,
  async run(ctx): Promise<Finding[]> {
    const findings: Finding[] = []
    for (const { target, base64 } of parseProvisioningMap(ctx)) {
      const detail = parseMobileprovisionDetailedFromBase64(base64)
      if (!detail.expirationDate) continue
      const left = new Date(detail.expirationDate).getTime() - Date.now()
      if (left <= 0) {
        findings.push({
          id: 'ios/profile-expiry', severity: 'error',
          title: `Provisioning profile for target "${target}" expired on ${detail.expirationDate.slice(0, 10)}`,
          fix: 'Regenerate the profile in the Apple Developer portal and re-save credentials',
        })
      }
      else if (left < THIRTY_DAYS_MS) {
        findings.push({
          id: 'ios/profile-expiry', severity: 'warning',
          title: `Provisioning profile for target "${target}" expires in ${Math.ceil(left / 86_400_000)} day(s)`,
        })
      }
    }
    return findings
  },
}

function bundleMatches(profileBundleId: string, appBundleId: string): boolean {
  if (profileBundleId === '*') return true
  if (profileBundleId.endsWith('.*')) return appBundleId.startsWith(profileBundleId.slice(0, -1))
  return profileBundleId === appBundleId
}

export const profileBundleMatch: PrescanCheck = {
  id: 'ios/profile-bundle-match',
  platforms: ['ios'],
  appliesTo: hasMap,
  async run(ctx): Promise<Finding[]> {
    const appBundleId = ctx.config?.appId ?? ctx.appId
    const findings: Finding[] = []
    for (const { target, base64 } of parseProvisioningMap(ctx)) {
      const info = parseMobileprovisionFromBase64(base64)
      if (info.bundleId && !bundleMatches(info.bundleId, appBundleId)) {
        findings.push({
          id: 'ios/profile-bundle-match', severity: 'error',
          title: `Provisioning profile for target "${target}" is for a different bundle id`,
          detail: `profile: ${info.bundleId} — app: ${appBundleId}`,
          fix: 'Use a profile generated for this bundle id (or a wildcard profile)',
        })
      }
    }
    return findings
  },
}

export const profileTypeVsMode: PrescanCheck = {
  id: 'ios/profile-type-vs-mode',
  platforms: ['ios'],
  appliesTo: ctx => hasMap(ctx) && Boolean(ctx.distributionMode),
  async run(ctx): Promise<Finding[]> {
    const findings: Finding[] = []
    for (const { target, base64 } of parseProvisioningMap(ctx)) {
      const detail = parseMobileprovisionDetailedFromBase64(base64)
      if (detail.profileType === 'unknown') continue
      if (detail.profileType !== ctx.distributionMode) {
        findings.push({
          id: 'ios/profile-type-vs-mode', severity: 'error',
          title: `Profile for target "${target}" is ${detail.profileType} but the build requests ${ctx.distributionMode}`,
          fix: ctx.distributionMode === 'app_store'
            ? 'Generate an App Store distribution profile, or build with --ios-distribution ad_hoc'
            : 'Generate an Ad Hoc profile, or switch --ios-distribution',
        })
      }
    }
    return findings
  },
}

export const certProfilePairing: PrescanCheck = {
  id: 'ios/cert-profile-pairing',
  platforms: ['ios'],
  appliesTo: ctx => hasMap(ctx) && Boolean(ctx.credentials?.BUILD_CERTIFICATE_BASE64),
  async run(ctx): Promise<Finding[]> {
    let sha1: string
    try { sha1 = openP12(ctx.credentials!.BUILD_CERTIFICATE_BASE64, ctx.credentials!.P12_PASSWORD ?? '').sha1 }
    catch { return [] } // p12-opens owns that failure
    const findings: Finding[] = []
    for (const { target, base64 } of parseProvisioningMap(ctx)) {
      const detail = parseMobileprovisionDetailedFromBase64(base64)
      if (detail.certificateSha1s.length === 0) continue
      if (!detail.certificateSha1s.includes(sha1)) {
        findings.push({
          id: 'ios/cert-profile-pairing', severity: 'error',
          title: `Your signing certificate is not included in the provisioning profile for target "${target}"`,
          detail: `cert sha1 ${sha1} not in [${detail.certificateSha1s.join(', ')}]`,
          fix: 'Regenerate the profile selecting this distribution certificate, then re-save credentials',
        })
      }
    }
    return findings
  },
}

export const targetsCovered: PrescanCheck = {
  id: 'ios/targets-covered',
  platforms: ['ios'],
  appliesTo: hasMap,
  async run(ctx): Promise<Finding[]> {
    const { findSignableTargets, readPbxproj } = await import('../../pbxproj-parser')
    const pbx = readPbxproj(join(ctx.projectDir, 'ios', 'App'))
    if (!pbx) return []
    const targets = findSignableTargets(pbx)
    const covered = new Set(parseProvisioningMap(ctx).map(p => p.target))
    const missing = targets.filter(t => !covered.has(t.name))
    if (missing.length === 0) return []
    return [{
      id: 'ios/targets-covered', severity: 'error',
      title: `${missing.length} signable target(s) have no provisioning profile mapped`,
      detail: `uncovered: ${missing.map(t => t.name).join(', ')}`,
      fix: 'Add --ios-provisioning-profile "Target:/path/to/profile.mobileprovision" for each and re-save credentials',
    }]
  },
}
```

- [ ] **Step 4: If `parseMobileprovisionDetailedFromBase64` does not exist** add it to `src/build/mobileprovision-parser.ts` mirroring `parseMobileprovisionFromBase64` (decode base64 → call the private `parseMobileprovisionBufferDetailed`):

```ts
export function parseMobileprovisionDetailedFromBase64(base64Content: string): MobileprovisionDetail {
  const data = Buffer.from(base64Content, 'base64')
  return parseMobileprovisionBufferDetailed(data, '<base64>')
}
```

- [ ] **Step 5: Run, verify pass.** `bun test test/prescan/checks-ios-profiles.test.ts` → PASS.

- [ ] **Step 6: Commit**

```bash
git add cli/src/build/prescan/checks/ios-profiles.ts cli/src/build/mobileprovision-parser.ts cli/test/prescan/checks-ios-profiles.test.ts
git commit -m "feat(cli): prescan ios provisioning profile checks (expiry, match, pairing, coverage)"
```

---

### Task 8: iOS Info.plist sanity (infoplist-sanity) — adds fast-xml-parser

**Files:**
- Modify: `package.json` (add dependency `fast-xml-parser@^4`)
- Create: `src/build/prescan/checks/ios-plist.ts`
- Test: `test/prescan/checks-ios-plist.test.ts`

- [ ] **Step 1: Add the dependency.** Run: `cd cli && bun add fast-xml-parser@^4`. Then check `bun run build` still succeeds (the CLI bundles with `bun build.mjs` — confirm fast-xml-parser is bundled, not externalized, by checking `build.mjs` externals list).

- [ ] **Step 2: Failing tests**

```ts
// test/prescan/checks-ios-plist.test.ts
import { describe, expect, it } from 'bun:test'
import { infoplistSanity } from '../../src/build/prescan/checks/ios-plist'
import { makeCtx, makeProject } from './helpers'

const plist = (body: string) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>${body}</dict></plist>`

const BASE = `<key>CFBundleVersion</key><string>1</string><key>CFBundleShortVersionString</key><string>1.0.0</string>`

function ctxFor(plistBody: string) {
  const dir = makeProject({ 'ios/App/App/Info.plist': plist(plistBody) })
  return makeCtx({ projectDir: dir, platform: 'ios' })
}

describe('ios/infoplist-sanity', () => {
  it('errors on URL scheme with an underscore (#2431 class)', async () => {
    const f = await infoplistSanity.run(ctxFor(`${BASE}
<key>CFBundleURLTypes</key><array><dict>
  <key>CFBundleURLSchemes</key><array><string>my_app</string></array>
</dict></array>`))
    expect(f.some(x => x.severity === 'error' && x.title.includes('URL scheme'))).toBe(true)
  })
  it('warns when CFBundleVersion is missing', async () => {
    const f = await infoplistSanity.run(ctxFor(`<key>CFBundleShortVersionString</key><string>1.0.0</string>`))
    expect(f.some(x => x.severity === 'warning' && x.title.includes('CFBundleVersion'))).toBe(true)
  })
  it('warns on placeholder purpose strings', async () => {
    const f = await infoplistSanity.run(ctxFor(`${BASE}
<key>NSCameraUsageDescription</key><string></string>`))
    expect(f.some(x => x.severity === 'warning' && x.title.includes('NSCameraUsageDescription'))).toBe(true)
  })
  it('passes a sane plist', async () => {
    const f = await infoplistSanity.run(ctxFor(`${BASE}
<key>CFBundleURLTypes</key><array><dict>
  <key>CFBundleURLSchemes</key><array><string>myapp</string></array>
</dict></array>
<key>NSCameraUsageDescription</key><string>To take profile pictures</string>`))
    expect(f).toEqual([])
  })
  it('is silent when Info.plist is absent (non-standard layout)', async () => {
    const dir = makeProject({})
    expect(await infoplistSanity.run(makeCtx({ projectDir: dir, platform: 'ios' }))).toEqual([])
  })
})
```

- [ ] **Step 3: Run, verify fail.**

- [ ] **Step 4: Implement**

```ts
// src/build/prescan/checks/ios-plist.ts
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { XMLParser } from 'fast-xml-parser'
import type { Finding, PrescanCheck } from '../types'

/** Convert parsed plist <dict> (alternating key/value arrays from fast-xml-parser) into a JS object. */
function plistDictToObject(dict: any): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (!dict) return out
  const keys: string[] = Array.isArray(dict.key) ? dict.key : dict.key !== undefined ? [dict.key] : []
  // fast-xml-parser keeps sibling value elements in document order per tag name; rebuild order-insensitively:
  // we only need shallow keys + their raw values, so collect every non-key child as candidate values in order.
  const valueTags = ['string', 'integer', 'real', 'true', 'false', 'date', 'data', 'array', 'dict']
  const values: unknown[] = []
  for (const tag of valueTags) {
    if (dict[tag] === undefined) continue
    const arr = Array.isArray(dict[tag]) ? dict[tag] : [dict[tag]]
    for (const v of arr) values.push(v)
  }
  // NOTE: order across different value tags is not preserved by fast-xml-parser; for the
  // shallow keys we check (strings only) this is acceptable — we look keys up individually below.
  keys.forEach((k, i) => { out[k] = values[i] })
  return out
}

/** Extract a top-level <string> value for a key without relying on sibling ordering. */
function plistStringValue(raw: string, key: string): string | null {
  const re = new RegExp(`<key>${key}</key>\\s*<string>([\\s\\S]*?)</string>`)
  return raw.match(re)?.[1] ?? null
}

const SCHEME_RE = /^[a-z][a-z0-9+.-]*$/i // RFC 3986/1738 scheme grammar — no underscores
const PURPOSE_KEYS = [
  'NSCameraUsageDescription', 'NSMicrophoneUsageDescription', 'NSPhotoLibraryUsageDescription',
  'NSLocationWhenInUseUsageDescription', 'NSLocationAlwaysAndWhenInUseUsageDescription',
  'NSContactsUsageDescription', 'NSFaceIDUsageDescription', 'NSBluetoothAlwaysUsageDescription',
]
const PLACEHOLDERS = new Set(['', 'todo', 'tbd', 'description', 'usage description', 'lorem ipsum'])

export const infoplistSanity: PrescanCheck = {
  id: 'ios/infoplist-sanity',
  platforms: ['ios'],
  async run(ctx): Promise<Finding[]> {
    const plistPath = join(ctx.projectDir, 'ios', 'App', 'App', 'Info.plist')
    if (!existsSync(plistPath)) return []
    const raw = readFileSync(plistPath, 'utf8')
    const findings: Finding[] = []

    if (!raw.includes('<key>CFBundleVersion</key>')) {
      findings.push({ id: 'ios/infoplist-sanity', severity: 'warning', title: 'Info.plist has no CFBundleVersion', fix: 'Add CFBundleVersion (build number) — App Store uploads require it' })
    }
    if (!raw.includes('<key>CFBundleShortVersionString</key>')) {
      findings.push({ id: 'ios/infoplist-sanity', severity: 'warning', title: 'Info.plist has no CFBundleShortVersionString', fix: 'Add the marketing version (e.g. 1.0.0)' })
    }

    // URL schemes: collect every <string> inside CFBundleURLSchemes arrays
    const schemesBlocks = raw.match(/<key>CFBundleURLSchemes<\/key>\s*<array>([\s\S]*?)<\/array>/g) ?? []
    for (const block of schemesBlocks) {
      for (const m of block.matchAll(/<string>([\s\S]*?)<\/string>/g)) {
        const scheme = m[1].trim()
        if (scheme && !SCHEME_RE.test(scheme)) {
          findings.push({
            id: 'ios/infoplist-sanity', severity: 'error',
            title: `Invalid URL scheme "${scheme}" — App Store upload will reject it`,
            detail: 'Schemes must match RFC 3986: letters, digits, "+", "-", "." only (no underscores)',
            fix: 'Rename the scheme (e.g. replace "_" with "-") in Info.plist and your deep-link config',
          })
        }
      }
    }

    for (const key of PURPOSE_KEYS) {
      if (!raw.includes(`<key>${key}</key>`)) continue
      const value = plistStringValue(raw, key)
      if (value === null || PLACEHOLDERS.has(value.trim().toLowerCase()) || value.trim().length < 8) {
        findings.push({
          id: 'ios/infoplist-sanity', severity: 'warning',
          title: `${key} is empty or placeholder text`,
          fix: 'App Review rejects vague purpose strings — describe the actual user-facing reason',
        })
      }
    }
    return findings
  },
}
```

NOTE: the implementation deliberately uses targeted regexes over full plist parsing (plist sibling order is lost in fast-xml-parser's object mode); `fast-xml-parser` stays in package.json for the Phase 2 AndroidManifest pack which parses well-formed XML trees. If you prefer, drop the unused `plistDictToObject` helper entirely — do not leave dead code.

- [ ] **Step 5: Run, verify pass; delete the unused `plistDictToObject`/`XMLParser` import if you went the regex route.** `bun test test/prescan/checks-ios-plist.test.ts` → PASS.

- [ ] **Step 6: Commit**

```bash
git add cli/package.json cli/bun.lock cli/src/build/prescan/checks/ios-plist.ts cli/test/prescan/checks-ios-plist.test.ts
git commit -m "feat(cli): prescan Info.plist sanity (url schemes, versions, purpose strings)"
```

---

### Task 9: Android keystore checks (keystore-opens, keystore-expiry)

**Files:**
- Create: `src/build/prescan/checks/android-keystore.ts`
- Test: `test/prescan/checks-android-keystore.test.ts`

Keystores arrive as `ANDROID_KEYSTORE_FILE` (base64). Two on-disk formats: **PKCS12** (modern default; node-forge opens it — wrong password throws) and **JKS** (legacy; magic `0xFEEDFEED`). For JKS we implement: magic/version detection, alias listing (aliases are plaintext modified-UTF8), and the integrity check — last 20 bytes are `SHA1(password_utf16be + "Mighty Aphrodite" + preceding_bytes)` — using `node:crypto`. Certificate expiry is checked for PKCS12 (cert bags) and JKS (DER cert via forge).

- [ ] **Step 1: Failing tests** (PKCS12 generated with forge; JKS via a tiny hand-built binary writer in the test)

```ts
// test/prescan/checks-android-keystore.test.ts
import { describe, expect, it } from 'bun:test'
import { createHash } from 'node:crypto'
import forge from 'node-forge'
import { keystoreExpiry, keystoreOpens } from '../../src/build/prescan/checks/android-keystore'
import { makeCtx, makeP12 } from './helpers'

function ctxWith(creds: Record<string, string>) {
  return makeCtx({ projectDir: '/tmp', platform: 'android', credentials: creds })
}

/** Minimal JKS with zero entries but a valid integrity hash for `password`. */
function makeEmptyJks(password: string): string {
  const head = Buffer.alloc(12)
  head.writeUInt32BE(0xFEEDFEED, 0) // magic
  head.writeUInt32BE(2, 4)          // version
  head.writeUInt32BE(0, 8)          // entry count
  const pwBytes = Buffer.from(password, 'utf16le').swap16() // utf-16BE
  const digest = createHash('sha1')
    .update(Buffer.concat([pwBytes, Buffer.from('Mighty Aphrodite', 'utf8'), head]))
    .digest()
  return Buffer.concat([head, digest]).toString('base64')
}

describe('android/keystore-opens', () => {
  it('opens a PKCS12 keystore with right password + alias', async () => {
    const p12 = makeP12({ password: 'store-pass' })
    const f = await keystoreOpens.run(ctxWith({
      ANDROID_KEYSTORE_FILE: p12.base64, KEYSTORE_STORE_PASSWORD: 'store-pass', KEYSTORE_KEY_ALIAS: 'any',
    }))
    // forge p12s from makeP12 have no friendlyName aliases — alias check downgrades to skip
    expect(f.filter(x => x.severity === 'error')).toEqual([])
  })
  it('errors on wrong PKCS12 password', async () => {
    const p12 = makeP12({ password: 'store-pass' })
    const f = await keystoreOpens.run(ctxWith({
      ANDROID_KEYSTORE_FILE: p12.base64, KEYSTORE_STORE_PASSWORD: 'nope', KEYSTORE_KEY_ALIAS: 'any',
    }))
    expect(f[0]?.severity).toBe('error')
    expect(f[0]?.title).toContain('password')
  })
  it('verifies JKS integrity hash (right password passes)', async () => {
    const f = await keystoreOpens.run(ctxWith({
      ANDROID_KEYSTORE_FILE: makeEmptyJks('secret'), KEYSTORE_STORE_PASSWORD: 'secret', KEYSTORE_KEY_ALIAS: 'k',
    }))
    // empty JKS: integrity ok, alias missing → error mentions the alias
    expect(f[0]?.detail ?? f[0]?.title ?? '').toContain('alias')
  })
  it('errors on wrong JKS password', async () => {
    const f = await keystoreOpens.run(ctxWith({
      ANDROID_KEYSTORE_FILE: makeEmptyJks('secret'), KEYSTORE_STORE_PASSWORD: 'wrong', KEYSTORE_KEY_ALIAS: 'k',
    }))
    expect(f[0]?.severity).toBe('error')
    expect(f[0]?.title).toContain('password')
  })
  it('errors on garbage data', async () => {
    const f = await keystoreOpens.run(ctxWith({
      ANDROID_KEYSTORE_FILE: Buffer.from('garbage').toString('base64'), KEYSTORE_STORE_PASSWORD: 'x', KEYSTORE_KEY_ALIAS: 'k',
    }))
    expect(f[0]?.severity).toBe('error')
  })
})

describe('android/keystore-expiry', () => {
  it('warns when the PKCS12 signing cert expires before 2033-10-01', async () => {
    const p12 = makeP12({ password: 'p', notAfter: new Date('2030-01-01') })
    const f = await keystoreExpiry.run(ctxWith({ ANDROID_KEYSTORE_FILE: p12.base64, KEYSTORE_STORE_PASSWORD: 'p' }))
    expect(f[0]?.severity).toBe('warning')
  })
  it('passes long-validity certs', async () => {
    const p12 = makeP12({ password: 'p', notAfter: new Date('2055-01-01') })
    expect(await keystoreExpiry.run(ctxWith({ ANDROID_KEYSTORE_FILE: p12.base64, KEYSTORE_STORE_PASSWORD: 'p' }))).toEqual([])
  })
})
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement**

```ts
// src/build/prescan/checks/android-keystore.ts
import { createHash } from 'node:crypto'
import forge from 'node-forge'
import type { Finding, PrescanCheck, ScanContext } from '../types'

const JKS_MAGIC = 0xFEEDFEED

type KeystoreKind = 'jks' | 'pkcs12' | 'unknown'

function keystoreKind(buf: Buffer): KeystoreKind {
  if (buf.length >= 4 && buf.readUInt32BE(0) === JKS_MAGIC) return 'jks'
  if (buf.length >= 1 && buf[0] === 0x30) return 'pkcs12' // ASN.1 SEQUENCE
  return 'unknown'
}

interface JksResult { passwordOk: boolean, aliases: string[], certsDer: Buffer[] }

/** Minimal read-only JKS reader: integrity hash + alias list + trusted/PrivateKey cert chains. */
function readJks(buf: Buffer, password: string): JksResult {
  const body = buf.subarray(0, buf.length - 20)
  const stored = buf.subarray(buf.length - 20)
  const pwBytes = Buffer.from(password, 'utf16le').swap16()
  const computed = createHash('sha1').update(Buffer.concat([pwBytes, Buffer.from('Mighty Aphrodite', 'utf8'), body])).digest()
  const passwordOk = computed.equals(stored)

  const aliases: string[] = []
  const certsDer: Buffer[] = []
  let off = 8
  const count = buf.readUInt32BE(off); off += 4
  for (let i = 0; i < count && off < body.length; i++) {
    const tag = buf.readUInt32BE(off); off += 4
    const aliasLen = buf.readUInt16BE(off); off += 2
    aliases.push(buf.subarray(off, off + aliasLen).toString('utf8')); off += aliasLen
    off += 8 // timestamp
    if (tag === 1) { // PrivateKeyEntry: key bytes + cert chain
      const keyLen = buf.readUInt32BE(off); off += 4 + keyLen
      const chainLen = buf.readUInt32BE(off); off += 4
      for (let c = 0; c < chainLen; c++) {
        const typeLen = buf.readUInt16BE(off); off += 2 + typeLen
        const certLen = buf.readUInt32BE(off); off += 4
        certsDer.push(buf.subarray(off, off + certLen)); off += certLen
      }
    }
    else { // trustedCertEntry
      const typeLen = buf.readUInt16BE(off); off += 2 + typeLen
      const certLen = buf.readUInt32BE(off); off += 4
      certsDer.push(buf.subarray(off, off + certLen)); off += certLen
    }
  }
  return { passwordOk, aliases, certsDer }
}

interface OpenedKeystore { kind: KeystoreKind, aliases: string[], notAfter: Date | null }

function openKeystore(base64: string, storePassword: string): OpenedKeystore {
  const buf = Buffer.from(base64, 'base64')
  const kind = keystoreKind(buf)
  if (kind === 'jks') {
    const jks = readJks(buf, storePassword)
    if (!jks.passwordOk) throw new Error('JKS integrity check failed — wrong store password')
    let notAfter: Date | null = null
    for (const der of jks.certsDer) {
      try {
        const cert = forge.pki.certificateFromAsn1(forge.asn1.fromDer(forge.util.createBuffer(der.toString('binary'))))
        if (!notAfter || cert.validity.notAfter < notAfter) notAfter = cert.validity.notAfter
      }
      catch { /* unparseable cert: skip */ }
    }
    return { kind, aliases: jks.aliases, notAfter }
  }
  if (kind === 'pkcs12') {
    const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(buf.toString('binary')), storePassword) // throws on wrong password
    const bags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? []
    const aliases = bags.map(b => (b.attributes?.friendlyName?.[0] as string | undefined) ?? '').filter(Boolean)
    let notAfter: Date | null = null
    for (const b of bags) {
      if (b.cert && (!notAfter || b.cert.validity.notAfter < notAfter)) notAfter = b.cert.validity.notAfter
    }
    return { kind, aliases, notAfter }
  }
  throw new Error('Unrecognized keystore format (expected JKS or PKCS12)')
}

const hasKeystore = (ctx: ScanContext) => Boolean(ctx.credentials?.ANDROID_KEYSTORE_FILE)
const storePassword = (ctx: ScanContext) => ctx.credentials?.KEYSTORE_STORE_PASSWORD ?? ctx.credentials?.KEYSTORE_KEY_PASSWORD ?? ''

export const keystoreOpens: PrescanCheck = {
  id: 'android/keystore-opens',
  platforms: ['android'],
  appliesTo: hasKeystore,
  async run(ctx): Promise<Finding[]> {
    let ks: OpenedKeystore
    try { ks = openKeystore(ctx.credentials!.ANDROID_KEYSTORE_FILE, storePassword(ctx)) }
    catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const pw = /password|mac|integrity/i.test(msg)
      return [{
        id: 'android/keystore-opens', severity: 'error',
        title: pw ? 'The keystore cannot be opened with the saved store password' : 'The saved keystore is not a valid JKS/PKCS12 file',
        detail: msg,
        fix: 'Verify the keystore file and --keystore-store-password, then re-run `build credentials save`',
      }]
    }
    const alias = ctx.credentials?.KEYSTORE_KEY_ALIAS
    if (alias && ks.aliases.length > 0 && !ks.aliases.includes(alias)) {
      return [{
        id: 'android/keystore-opens', severity: 'error',
        title: `Key alias "${alias}" not found in the keystore`,
        detail: `available aliases: ${ks.aliases.join(', ') || '(none)'}`,
        fix: 'Use one of the existing aliases or the correct keystore file',
      }]
    }
    return []
  },
}

const PLAY_MIN_VALIDITY = new Date('2033-10-01')

export const keystoreExpiry: PrescanCheck = {
  id: 'android/keystore-expiry',
  platforms: ['android'],
  appliesTo: hasKeystore,
  async run(ctx): Promise<Finding[]> {
    let ks: OpenedKeystore
    try { ks = openKeystore(ctx.credentials!.ANDROID_KEYSTORE_FILE, storePassword(ctx)) }
    catch { return [] } // keystore-opens owns the failure
    if (ks.notAfter && ks.notAfter < PLAY_MIN_VALIDITY) {
      return [{
        id: 'android/keystore-expiry', severity: 'warning',
        title: `Signing certificate validity ends ${ks.notAfter.toISOString().slice(0, 10)} — Play requires validity through Oct 2033 for new apps`,
        fix: 'Generate a keystore with ≥25y validity (keytool -validity 10000) for new apps',
      }]
    }
    return []
  },
}
```

- [ ] **Step 4: Run, verify pass.** `bun test test/prescan/checks-android-keystore.test.ts` → PASS. The JKS byte-offset parsing is the most fragile code in this plan — if offsets misbehave, debug against the test's `makeEmptyJks` first (12-byte header + 20-byte digest), then against a real keystore generated locally with `keytool` if available (do NOT commit it).

- [ ] **Step 5: Commit**

```bash
git add cli/src/build/prescan/checks/android-keystore.ts cli/test/prescan/checks-android-keystore.test.ts
git commit -m "feat(cli): prescan android keystore checks (jks/pkcs12 open, alias, validity)"
```

---

### Task 10: Android project checks (cordova-vars, gradle heuristics, play SA, flavor, agp8 package attr)

**Files:**
- Create: `src/build/prescan/checks/android-project.ts`
- Test: `test/prescan/checks-android-project.test.ts`

- [ ] **Step 1: Failing tests**

```ts
// test/prescan/checks-android-project.test.ts
import { describe, expect, it } from 'bun:test'
import {
  agp8PackageAttr, cordovaVarsPresent, flavorExists, gradlePropsHeuristics, playSaJson,
} from '../../src/build/prescan/checks/android-project'
import { makeCtx, makeProject } from './helpers'

const aCtx = (dir: string, extra: object = {}) => makeCtx({ projectDir: dir, platform: 'android', ...extra })

describe('android/cordova-vars-present', () => {
  it('errors when cordova plugins exist but variables file is missing', async () => {
    const dir = makeProject({
      'package.json': JSON.stringify({ dependencies: { 'cordova-plugin-device': '2.0.0' } }),
      'android/app/build.gradle': '',
    })
    const f = await cordovaVarsPresent.run(aCtx(dir))
    expect(f[0]?.severity).toBe('error')
    expect(f[0]?.fix).toContain('cap sync')
  })
  it('passes when the file exists', async () => {
    const dir = makeProject({
      'package.json': JSON.stringify({ dependencies: { 'cordova-plugin-device': '2.0.0' } }),
      'android/capacitor-cordova-android-plugins/cordova.variables.gradle': 'ext {}',
    })
    expect(await cordovaVarsPresent.run(aCtx(dir))).toEqual([])
  })
  it('does not apply without cordova plugins', async () => {
    const dir = makeProject({ 'package.json': JSON.stringify({ dependencies: {} }) })
    expect(cordovaVarsPresent.appliesTo!(aCtx(dir))).toBe(false)
  })
})

describe('android/gradle-props-heuristics', () => {
  const settings = Array.from({ length: 40 }, (_, i) => `include ':plugin-${i}'`).join('\n')
  it('warns: many modules + parallel off', async () => {
    const dir = makeProject({
      'android/capacitor.settings.gradle': settings,
      'android/gradle.properties': 'org.gradle.jvmargs=-Xmx4096m',
    })
    const f = await gradlePropsHeuristics.run(aCtx(dir))
    expect(f.some(x => x.title.includes('parallel'))).toBe(true)
  })
  it('warns: workers.max=1 neutering parallel', async () => {
    const dir = makeProject({
      'android/capacitor.settings.gradle': settings,
      'android/gradle.properties': 'org.gradle.parallel=true\norg.gradle.workers.max=1',
    })
    const f = await gradlePropsHeuristics.run(aCtx(dir))
    expect(f.some(x => x.title.includes('workers.max'))).toBe(true)
  })
  it('warns: low heap with many modules', async () => {
    const dir = makeProject({
      'android/capacitor.settings.gradle': settings,
      'android/gradle.properties': 'org.gradle.parallel=true\norg.gradle.jvmargs=-Xmx1536m',
    })
    const f = await gradlePropsHeuristics.run(aCtx(dir))
    expect(f.some(x => x.title.includes('heap') || x.title.includes('Xmx'))).toBe(true)
  })
  it('silent on a small, tuned project', async () => {
    const dir = makeProject({
      'android/capacitor.settings.gradle': `include ':capacitor-android'`,
      'android/gradle.properties': 'org.gradle.jvmargs=-Xmx1536m',
    })
    expect(await gradlePropsHeuristics.run(aCtx(dir))).toEqual([])
  })
})

describe('android/play-sa-json', () => {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64')
  it('errors on non-service-account json', async () => {
    const ctx = aCtx(makeProject({}), { credentials: { PLAY_CONFIG_JSON: b64({ type: 'authorized_user' }) } })
    expect((await playSaJson.run(ctx))[0]?.severity).toBe('error')
  })
  it('errors on missing private_key', async () => {
    const ctx = aCtx(makeProject({}), { credentials: { PLAY_CONFIG_JSON: b64({ type: 'service_account', client_email: 'a@b.iam' }) } })
    expect((await playSaJson.run(ctx))[0]?.detail).toContain('private_key')
  })
  it('passes a complete service account', async () => {
    const ctx = aCtx(makeProject({}), { credentials: { PLAY_CONFIG_JSON: b64({ type: 'service_account', client_email: 'a@b.iam', private_key: '-----BEGIN PRIVATE KEY-----' }) } })
    expect(await playSaJson.run(ctx)).toEqual([])
  })
})

describe('android/flavor-exists', () => {
  const gradle = `android { productFlavors { dev { dimension "env" } prod { dimension "env" } } }`
  it('errors on unknown flavor', async () => {
    const ctx = aCtx(makeProject({ 'android/app/build.gradle': gradle }), { androidFlavor: 'staging' })
    const f = await flavorExists.run(ctx)
    expect(f[0]?.severity).toBe('error')
    expect(f[0]?.detail).toContain('dev')
  })
  it('passes known flavor', async () => {
    const ctx = aCtx(makeProject({ 'android/app/build.gradle': gradle }), { androidFlavor: 'dev' })
    expect(await flavorExists.run(ctx)).toEqual([])
  })
})

describe('android/agp8-package-attr', () => {
  it('errors when manifest has package= and gradle has namespace', async () => {
    const dir = makeProject({
      'android/app/src/main/AndroidManifest.xml': `<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.demo.app"><application/></manifest>`,
      'android/app/build.gradle': `android { namespace "com.demo.app" }`,
    })
    expect((await agp8PackageAttr.run(aCtx(dir)))[0]?.severity).toBe('error')
  })
  it('passes a namespace-only project', async () => {
    const dir = makeProject({
      'android/app/src/main/AndroidManifest.xml': `<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application/></manifest>`,
      'android/app/build.gradle': `android { namespace "com.demo.app" }`,
    })
    expect(await agp8PackageAttr.run(aCtx(dir))).toEqual([])
  })
})
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement**

```ts
// src/build/prescan/checks/android-project.ts
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { appBuildGradle, gradleProperties, readTextIfExists, settingsGradleModuleCount } from '../gradle'
import type { Finding, PrescanCheck, ScanContext } from '../types'

function hasCordovaPlugins(ctx: ScanContext): boolean {
  const pkgRaw = readTextIfExists(join(ctx.projectDir, 'package.json'))
  if (!pkgRaw) return false
  try {
    const deps = Object.keys((JSON.parse(pkgRaw).dependencies ?? {}) as Record<string, string>)
    return deps.some(d => d.startsWith('cordova-plugin-') || d.startsWith('@awesome-cordova-plugins/'))
  }
  catch { return false }
}

export const cordovaVarsPresent: PrescanCheck = {
  id: 'android/cordova-vars-present',
  platforms: ['android'],
  appliesTo: hasCordovaPlugins,
  async run(ctx): Promise<Finding[]> {
    const path = join(ctx.projectDir, 'android', 'capacitor-cordova-android-plugins', 'cordova.variables.gradle')
    if (existsSync(path)) return []
    return [{
      id: 'android/cordova-vars-present', severity: 'error',
      title: 'cordova.variables.gradle is missing — the cloud build cannot compile your Cordova plugins',
      detail: 'This generated file is gitignored; `cap copy` does not create it, only `cap sync` does',
      fix: 'Run `npx cap sync android` before requesting the build',
    }]
  },
}

const MANY_MODULES = 30
const MIN_HEAP_MB_FOR_LARGE = 2048

function xmxMb(jvmargs: string | undefined): number | null {
  const m = jvmargs?.match(/-Xmx(\d+)([mMgG])/)
  if (!m) return null
  const n = Number.parseInt(m[1], 10)
  return /g/i.test(m[2]) ? n * 1024 : n
}

export const gradlePropsHeuristics: PrescanCheck = {
  id: 'android/gradle-props-heuristics',
  platforms: ['android'],
  async run(ctx): Promise<Finding[]> {
    const modules = settingsGradleModuleCount(ctx.projectDir)
    const props = gradleProperties(ctx.projectDir)
    const findings: Finding[] = []
    const parallel = props['org.gradle.parallel'] === 'true'

    if (modules > MANY_MODULES && !parallel) {
      findings.push({
        id: 'android/gradle-props-heuristics', severity: 'warning',
        title: `${modules} Gradle modules build serially — org.gradle.parallel is not enabled`,
        fix: 'Add `org.gradle.parallel=true` (and `org.gradle.caching=true`) to android/gradle.properties',
      })
    }
    if (parallel && props['org.gradle.workers.max'] === '1') {
      findings.push({
        id: 'android/gradle-props-heuristics', severity: 'warning',
        title: 'org.gradle.workers.max=1 makes org.gradle.parallel=true a no-op',
        fix: 'Remove the workers.max cap (or raise it) so parallel project execution can work',
      })
    }
    const heap = xmxMb(props['org.gradle.jvmargs'])
    if (modules > MANY_MODULES && heap !== null && heap < MIN_HEAP_MB_FOR_LARGE) {
      findings.push({
        id: 'android/gradle-props-heuristics', severity: 'warning',
        title: `Gradle heap -Xmx${heap}m is small for ${modules} modules — D8/R8 may stall or OOM`,
        fix: 'Raise org.gradle.jvmargs, e.g. `-Xmx4096m -XX:MaxMetaspaceSize=1024m`',
      })
    }
    return findings
  },
}

export const playSaJson: PrescanCheck = {
  id: 'android/play-sa-json',
  platforms: ['android'],
  appliesTo: ctx => Boolean(ctx.credentials?.PLAY_CONFIG_JSON),
  async run(ctx): Promise<Finding[]> {
    let parsed: Record<string, unknown>
    try { parsed = JSON.parse(Buffer.from(ctx.credentials!.PLAY_CONFIG_JSON, 'base64').toString('utf8')) }
    catch {
      return [{ id: 'android/play-sa-json', severity: 'error', title: 'PLAY_CONFIG_JSON does not decode to valid JSON', fix: 'Base64-encode the raw service-account .json file' }]
    }
    if (parsed.type !== 'service_account') {
      return [{ id: 'android/play-sa-json', severity: 'error', title: 'PLAY_CONFIG_JSON is not a service-account key', detail: `type: ${String(parsed.type)}`, fix: 'Create a service-account key in Google Cloud Console (IAM → Service Accounts → Keys)' }]
    }
    const missing = ['private_key', 'client_email'].filter(k => !parsed[k])
    if (missing.length > 0) {
      return [{ id: 'android/play-sa-json', severity: 'error', title: 'Service-account JSON is incomplete', detail: `missing: ${missing.join(', ')}`, fix: 'Re-download the key file — it must contain private_key and client_email' }]
    }
    return []
  },
}

export const flavorExists: PrescanCheck = {
  id: 'android/flavor-exists',
  platforms: ['android'],
  appliesTo: ctx => Boolean(ctx.androidFlavor),
  async run(ctx): Promise<Finding[]> {
    const gradle = appBuildGradle(ctx.projectDir)
    if (!gradle) return []
    const block = gradle.match(/productFlavors\s*\{([\s\S]*)\}/)?.[1]
    if (!block) {
      return [{
        id: 'android/flavor-exists', severity: 'error',
        title: `--android-flavor "${ctx.androidFlavor}" passed but build.gradle declares no productFlavors`,
        fix: 'Drop the flag or add the flavor to android/app/build.gradle',
      }]
    }
    const flavors = [...block.matchAll(/^\s*(\w+)\s*\{/gm)].map(m => m[1]).filter(f => f !== 'dimension')
    if (!flavors.includes(ctx.androidFlavor!)) {
      return [{
        id: 'android/flavor-exists', severity: 'error',
        title: `Product flavor "${ctx.androidFlavor}" not found in build.gradle`,
        detail: `declared flavors: ${flavors.join(', ') || '(none parsed)'}`,
        fix: 'Use one of the declared flavors or add the missing one',
      }]
    }
    return []
  },
}

export const agp8PackageAttr: PrescanCheck = {
  id: 'android/agp8-package-attr',
  platforms: ['android'],
  async run(ctx): Promise<Finding[]> {
    const manifest = readTextIfExists(join(ctx.projectDir, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'))
    const gradle = appBuildGradle(ctx.projectDir)
    if (!manifest || !gradle) return []
    const hasPackageAttr = /<manifest[^>]*\spackage\s*=\s*"/.test(manifest)
    const hasNamespace = /namespace\s*[=( ]\s*["']/.test(gradle)
    if (hasPackageAttr && hasNamespace) {
      return [{
        id: 'android/agp8-package-attr', severity: 'error',
        title: 'AndroidManifest.xml still has a package= attribute — AGP 8+ fails the build',
        detail: 'build.gradle declares `namespace`, so the manifest attribute is forbidden',
        fix: 'Delete the package="…" attribute from android/app/src/main/AndroidManifest.xml',
      }]
    }
    return []
  },
}
```

- [ ] **Step 4: Run, verify pass.** `bun test test/prescan/checks-android-project.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add cli/src/build/prescan/checks/android-project.ts cli/test/prescan/checks-android-project.test.ts
git commit -m "feat(cli): prescan android project checks (cordova vars, gradle heuristics, play sa, flavor, agp8)"
```

---

### Task 11: Registry + context builder + warning prompt

**Files:**
- Create: `src/build/prescan/registry.ts`
- Create: `src/build/prescan/context.ts`
- Create: `src/build/prescan/prompt.ts`
- Test: extend `test/prescan/engine.test.ts` (registry shape only — context/prompt are exercised in Task 12's command tests)

- [ ] **Step 1: Failing test (registry completeness)**

Append to `test/prescan/engine.test.ts`:

```ts
import { ALL_CHECKS } from '../../src/build/prescan/registry'

describe('registry', () => {
  it('contains all 22 phase-1 checks with unique ids', () => {
    const ids = ALL_CHECKS.map(c => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.length).toBe(22)
    for (const expected of [
      'shared/apikey-permission', 'shared/app-exists', 'shared/credentials-saved',
      'shared/cap-sync-stale', 'shared/node-linker-layout', 'shared/bundle-id-consistency',
      'ios/p12-opens', 'ios/p12-expiry', 'ios/profile-expiry', 'ios/profile-bundle-match',
      'ios/profile-type-vs-mode', 'ios/cert-profile-pairing', 'ios/targets-covered',
      'ios/infoplist-sanity', 'ios/asc-key-valid',
      'android/keystore-opens', 'android/keystore-expiry', 'android/cordova-vars-present',
      'android/gradle-props-heuristics', 'android/play-sa-json', 'android/flavor-exists',
      'android/agp8-package-attr',
    ]) expect(ids).toContain(expected)
  })
})
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement registry.ts**

```ts
// src/build/prescan/registry.ts
import type { PrescanCheck } from './types'
import { bundleIdConsistency, capSyncStale, nodeLinkerLayout } from './checks/shared'
import { apikeyPermission, appExists } from './checks/shared-remote'
import { credentialsSaved } from './checks/credentials'
import { ascKeyValid, p12Expiry, p12Opens } from './checks/ios-certs'
import { certProfilePairing, profileBundleMatch, profileExpiry, profileTypeVsMode, targetsCovered } from './checks/ios-profiles'
import { infoplistSanity } from './checks/ios-plist'
import { keystoreExpiry, keystoreOpens } from './checks/android-keystore'
import { agp8PackageAttr, cordovaVarsPresent, flavorExists, gradlePropsHeuristics, playSaJson } from './checks/android-project'

export const ALL_CHECKS: PrescanCheck[] = [
  apikeyPermission, appExists, credentialsSaved,
  capSyncStale, nodeLinkerLayout, bundleIdConsistency,
  p12Opens, p12Expiry, profileExpiry, profileBundleMatch, profileTypeVsMode,
  certProfilePairing, targetsCovered, infoplistSanity, ascKeyValid,
  keystoreOpens, keystoreExpiry, cordovaVarsPresent, gradlePropsHeuristics,
  playSaJson, flavorExists, agp8PackageAttr,
]
```

- [ ] **Step 4: Implement context.ts**

```ts
// src/build/prescan/context.ts
import { getConfig } from '../../utils'
import { mergeCredentials } from '../credentials'
import type { Platform, ScanContext } from './types'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../types/supabase.types'

export interface BuildScanContextArgs {
  appId?: string
  platform: Platform
  projectDir: string
  distributionMode?: 'app_store' | 'ad_hoc'
  androidFlavor?: string
  apikey?: string
  supabase?: SupabaseClient<Database>
  /** pre-merged credentials when called from build request (avoids double work) */
  credentials?: Record<string, string>
}

export async function buildScanContext(args: BuildScanContextArgs): Promise<ScanContext> {
  let config
  try { config = (await getConfig(true)).config }
  catch { config = undefined } // no capacitor project — checks degrade individually
  const appId = args.appId ?? config?.appId
  if (!appId) throw new Error('Missing appId: pass it explicitly or run inside a Capacitor project')
  const credentials = args.credentials
    ?? (await mergeCredentials(appId, args.platform) as Record<string, string> | undefined)
  return {
    appId,
    platform: args.platform,
    projectDir: args.projectDir,
    config,
    credentials,
    distributionMode: args.distributionMode,
    androidFlavor: args.androidFlavor,
    apikey: args.apikey,
    supabase: args.supabase,
  }
}
```

NOTE: `getConfig` reads from cwd, not an arbitrary dir. Check how `request.ts` handles `--path` (it may chdir or pass the path) and mirror it: if `request.ts` resolves config relative to `options.path`, do the same here (read its handling around the `getConfig` call). If `mergeCredentials`'s real signature differs (it takes `cliArgs` third), pass `undefined`.

- [ ] **Step 5: Implement prompt.ts**

```ts
// src/build/prescan/prompt.ts
import { confirm, isCancel } from '@clack/prompts'
import { canPromptInteractively } from '../../utils'
import type { PrescanOutcome } from './types'

/**
 * Resolve an 'ask' outcome: interactive → user decides; non-interactive → proceed (per spec).
 * Returns the final go/no-go.
 */
export async function resolveWarningGate(outcome: PrescanOutcome, opts: { silent?: boolean } = {}): Promise<'proceed' | 'block'> {
  if (outcome !== 'ask') return outcome === 'block' ? 'block' : 'proceed'
  if (!canPromptInteractively({ silent: opts.silent })) return 'proceed'
  const answer = await confirm({ message: 'Prescan found warnings. Proceed with the build anyway?' })
  if (isCancel(answer) || answer === false) return 'block'
  return 'proceed'
}
```

NOTE: confirm `@clack/prompts` is the prompt library used elsewhere in the CLI (`zigrep "@clack/prompts" src/ | zigread first hit`); if the codebase uses a different helper (e.g. a wrapper in utils), use that instead for consistent styling.

- [ ] **Step 6: Run, verify pass.** `bun test test/prescan/engine.test.ts` → PASS (registry test green). Run full suite so far: `bun test test/prescan/` → all PASS.

- [ ] **Step 7: Commit**

```bash
git add cli/src/build/prescan/registry.ts cli/src/build/prescan/context.ts cli/src/build/prescan/prompt.ts cli/test/prescan/engine.test.ts
git commit -m "feat(cli): prescan registry, scan context builder, warning gate"
```

---

### Task 12: `command.ts` + standalone `build prescan` wiring

**Files:**
- Create: `src/build/prescan/command.ts`
- Modify: `src/index.ts` (after the `build request` registration, ~L853)
- Test: `test/prescan/command.test.ts`

- [ ] **Step 1: Failing tests** (test the exported pure-ish pieces: exit-code mapping and flag validation — full CLI smoke happens in Step 6)

```ts
// test/prescan/command.test.ts
import { describe, expect, it } from 'bun:test'
import { exitCodeFor, validateFlags } from '../../src/build/prescan/command'

describe('validateFlags', () => {
  it('rejects ignore-fatal + fail-on-warnings', () => {
    expect(() => validateFlags({ ignoreFatal: true, failOnWarnings: true }))
      .toThrow(/contradictory/i)
  })
  it('accepts each alone', () => {
    expect(() => validateFlags({ ignoreFatal: true })).not.toThrow()
    expect(() => validateFlags({ failOnWarnings: true })).not.toThrow()
  })
})

describe('exitCodeFor', () => {
  const counts = (error: number, warning: number) => ({ error, warning, info: 0 })
  it('0 when clean', () => expect(exitCodeFor(counts(0, 0), {})).toBe(0))
  it('1 on errors', () => expect(exitCodeFor(counts(1, 0), {})).toBe(1))
  it('0 on warnings by default', () => expect(exitCodeFor(counts(0, 2), {})).toBe(0))
  it('2 on warnings with failOnWarnings', () => expect(exitCodeFor(counts(0, 2), { failOnWarnings: true })).toBe(2))
  it('0 always with ignoreFatal', () => expect(exitCodeFor(counts(3, 3), { ignoreFatal: true })).toBe(0))
})
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement command.ts**

```ts
// src/build/prescan/command.ts
import { exit } from 'node:process'
import { intro, log, outro } from '@clack/prompts'
import { createSupabaseClient, findSavedKey } from '../../utils'
import { buildScanContext } from './context'
import { decideOutcome, runPrescan } from './engine'
import { resolveWarningGate } from './prompt'
import { ALL_CHECKS } from './registry'
import { renderJsonReport, renderTerminalReport } from './report'
import type { OutcomeOptions, Platform, PrescanReport, Severity } from './types'

export interface PrescanCommandOptions {
  platform?: string
  path?: string
  apikey?: string
  androidFlavor?: string
  iosDist?: 'app_store' | 'ad_hoc'
  json?: boolean
  failOnWarnings?: boolean
  ignoreFatal?: boolean
  verbose?: boolean
  supaHost?: string
  supaAnon?: string
}

export function validateFlags(opts: Pick<PrescanCommandOptions, 'failOnWarnings' | 'ignoreFatal'>): void {
  if (opts.failOnWarnings && opts.ignoreFatal)
    throw new Error('--ignore-fatal and --fail-on-warnings are contradictory — pick one')
}

export function exitCodeFor(counts: Record<Severity, number>, opts: OutcomeOptions): number {
  if (opts.ignoreFatal) return 0
  if (counts.error > 0) return 1
  if (counts.warning > 0 && opts.failOnWarnings) return 2
  return 0
}

/** Shared scan runner used by both the standalone command and build request's gate. */
export async function executePrescan(appId: string | undefined, options: PrescanCommandOptions): Promise<PrescanReport> {
  const platform = options.platform as Platform
  if (platform !== 'ios' && platform !== 'android')
    throw new Error('--platform must be ios or android')
  let apikey: string | undefined
  let supabase
  try {
    apikey = options.apikey ?? findSavedKey(true)
    supabase = await createSupabaseClient(apikey, options.supaHost, options.supaAnon, true)
  }
  catch { /* no key: remote checks will be skipped with a notice */ }
  const ctx = await buildScanContext({
    appId,
    platform,
    projectDir: options.path ?? process.cwd(),
    distributionMode: options.iosDist,
    androidFlavor: options.androidFlavor,
    apikey,
    supabase,
  })
  return runPrescan(ctx, ALL_CHECKS)
}

export async function prescanCommand(appId: string | undefined, options: PrescanCommandOptions): Promise<void> {
  validateFlags(options)
  if (!options.json) intro('Capgo build prescan')
  const report = await executePrescan(appId, options)
  if (options.json) {
    console.log(renderJsonReport(report))
  }
  else {
    log.message(renderTerminalReport(report, { verbose: options.verbose }))
    const outcome = decideOutcome(report, options)
    outro(outcome === 'block' ? 'Prescan found blocking problems — fix them before building.' : 'Prescan finished.')
  }
  exit(exitCodeFor(report.counts, options))
}
```

NOTE: match the intro/log/outro idiom used by neighbouring commands (read the top of `src/build/needed.ts` for the established style) — substitute whatever logger the codebase standard is if not @clack.

- [ ] **Step 4: Wire into `src/index.ts`** — after the `build request` registration block (~L853), insert:

```ts
build
  .command('prescan [appId]')
  .description(`Scan your project and saved credentials for problems that would fail a cloud build — before uploading anything.

Checks credentials (expiry, passwords, profile pairing), project state (cap sync, node_modules layout), and platform config. Runs automatically inside \`build request\`; this command runs it standalone (e.g. in CI).`)
  .option('--platform <platform>', 'Target platform: ios or android (required)')
  .option('--path <path>', 'Path to the project directory (default: current directory)')
  .option('-a, --apikey <apikey>', optionDescriptions.apikey)
  .option('--android-flavor <flavor>', 'Android: product flavor the build will use')
  .addOption(new Option('--ios-dist <mode>', 'iOS: distribution mode to validate against').choices(['app_store', 'ad_hoc']))
  .option('--json', 'Output a machine-readable JSON report')
  .option('--fail-on-warnings', 'Exit non-zero when warnings are found (CI)')
  .option('--ignore-fatal', 'Diagnostic mode: report everything but always exit 0')
  .option('--verbose', optionDescriptions.verbose)
  .option('--supa-host <supaHost>', optionDescriptions.supaHost)
  .option('--supa-anon <supaAnon>', optionDescriptions.supaAnon)
  .action(prescanCommand)
```

Add the import at the top of `src/index.ts` next to the other build imports: `import { prescanCommand } from './build/prescan/command'`. Check that `optionDescriptions.supaHost`/`supaAnon` exist (zigrep `supaHost` in index.ts) — if request uses plain strings for those options, copy its exact style.

- [ ] **Step 5: Run unit tests.** `bun test test/prescan/command.test.ts` → PASS.

- [ ] **Step 6: CLI smoke test.** Run:

```bash
cd cli && bun run build && node dist/index.js build prescan --platform android --path /tmp/definitely-not-a-project --ignore-fatal || true
node dist/index.js build prescan --platform android --ignore-fatal --fail-on-warnings; echo "exit=$?"
```

Expected: first command prints a report (cap-sync/webDir errors etc.) and exits 0 (`--ignore-fatal`); second prints the contradictory-flags error and exits non-zero.

- [ ] **Step 7: Commit**

```bash
git add cli/src/build/prescan/command.ts cli/src/index.ts cli/test/prescan/command.test.ts
git commit -m "feat(cli): capgo build prescan standalone command"
```

---

### Task 13: Auto-run inside `build request`

**Files:**
- Modify: `src/build/request.ts` (insert gate immediately before the `zipDirectory` call at ~L1688; add options)
- Modify: `src/index.ts` (add `--no-prescan`, `--prescan-ignore-fatal`, `--fail-on-warnings` to the `request` command, ~L853)
- Test: `test/prescan/command.test.ts` (gate unit) + manual smoke

- [ ] **Step 1: Failing test for the gate helper**

Append to `test/prescan/command.test.ts`:

```ts
import { runPrescanGate } from '../../src/build/prescan/command'

describe('runPrescanGate', () => {
  const fakeReport = (error: number, warning: number) => ({
    findings: [], counts: { error, warning, info: 0 }, skippedRemote: 0, durationMs: 1, checksRun: 1,
  })
  it('returns proceed when scan disabled', async () => {
    const r = await runPrescanGate({ enabled: false } as any, async () => fakeReport(9, 9))
    expect(r).toBe('proceed')
  })
  it('blocks on errors', async () => {
    const r = await runPrescanGate({ enabled: true } as any, async () => fakeReport(1, 0))
    expect(r).toBe('block')
  })
  it('proceeds on errors with ignoreFatal', async () => {
    const r = await runPrescanGate({ enabled: true, ignoreFatal: true } as any, async () => fakeReport(1, 0))
    expect(r).toBe('proceed')
  })
  it('proceeds (non-interactive) on warnings', async () => {
    const r = await runPrescanGate({ enabled: true, interactive: false } as any, async () => fakeReport(0, 1))
    expect(r).toBe('proceed')
  })
  it('never throws when the scan itself crashes — proceeds with a notice', async () => {
    const r = await runPrescanGate({ enabled: true } as any, async () => { throw new Error('scanner bug') })
    expect(r).toBe('proceed')
  })
})
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement `runPrescanGate` in command.ts**

```ts
// append to src/build/prescan/command.ts
import { renderTerminalReport as renderForGate } from './report' // already imported above — reuse

export interface PrescanGateOptions {
  enabled: boolean
  ignoreFatal?: boolean
  failOnWarnings?: boolean
  /** test seam; defaults to canPromptInteractively() at call time */
  interactive?: boolean
  silent?: boolean
}

/**
 * Used by build request. Runs the scan via the provided thunk, prints the report,
 * and resolves to 'proceed' | 'block'. NEVER throws: a crashing scanner proceeds with a notice
 * (the scanner must never be worse than no scanner).
 */
export async function runPrescanGate(
  opts: PrescanGateOptions,
  scan: () => Promise<PrescanReport>,
): Promise<'proceed' | 'block'> {
  if (!opts.enabled) return 'proceed'
  let report: PrescanReport
  try { report = await scan() }
  catch (e) {
    log.warn(`prescan crashed and was skipped: ${e instanceof Error ? e.message : String(e)}`)
    return 'proceed'
  }
  if (report.findings.length > 0)
    log.message(renderTerminalReport(report, {}))
  const outcome = decideOutcome(report, { ignoreFatal: opts.ignoreFatal, failOnWarnings: opts.failOnWarnings })
  if (outcome === 'ask') {
    if (opts.interactive === false) return 'proceed'
    return resolveWarningGate('ask', { silent: opts.silent })
  }
  return outcome
}
```

(Adjust imports — `decideOutcome`, `resolveWarningGate`, `log` are already imported at the top of command.ts.)

- [ ] **Step 4: Insert the gate into request.ts.** Immediately BEFORE the zip block at ~L1688 (`log.info(\`Zipping ${platform} project...`)), insert:

```ts
    // ---- prescan gate (see src/build/prescan/) ----
    if (options.prescan !== false) {
      const { executePrescan, runPrescanGate } = await import('./prescan/command')
      const gate = await runPrescanGate(
        {
          enabled: true,
          ignoreFatal: options.prescanIgnoreFatal,
          failOnWarnings: options.failOnWarnings,
          silent,
        },
        () => executePrescan(appId, {
          platform,
          path: projectDir,
          apikey: options.apikey,
          androidFlavor: options.androidFlavor,
          iosDist: options.iosDistribution,
          supaHost: options.supaHost,
          supaAnon: options.supaAnon,
        }),
      )
      if (gate === 'block') {
        log.error('Prescan found blocking problems — nothing was uploaded. Fix the errors above or re-run with --prescan-ignore-fatal / --no-prescan.')
        await sendEvent(apikey, { channel: 'build', event: 'Prescan blocked', icon: '🛡️', user_id: orgId, tags: { 'app-id': appId, platform } } as any, options.verbose)
        exit(1)
      }
    }
```

IMPORTANT adaptation notes for the implementer (verify each against the surrounding code; variable names must match the local scope at L1688): `appId`, `platform`, `projectDir`, `silent`, `orgId`, `options` all exist in `requestBuildInternal` scope — read 30 lines above the insertion point and reuse the exact local names. The `sendEvent` call shape must copy a neighbouring `sendEvent` call in the same file (search `sendEvent(` in request.ts) — match its tags/user_id pattern exactly rather than the sketch above.

- [ ] **Step 5: Add the flags in `src/index.ts`** on the `build request` command (after `--ai-analytics`):

```ts
  .option('--no-prescan', 'Skip the automatic pre-build scan')
  .option('--prescan-ignore-fatal', 'Run the pre-build scan but never block the build (report only)')
  .option('--fail-on-warnings', 'Treat prescan warnings as fatal')
```

(commander turns `--no-prescan` into `options.prescan === false` automatically.) Also extend the `RequestBuildOptions` type in request.ts with `prescan?: boolean`, `prescanIgnoreFatal?: boolean`, `failOnWarnings?: boolean` — find the options interface near the top of request.ts.

- [ ] **Step 6: Run all tests + typecheck + smoke.**

```bash
cd cli && bun test test/prescan/ && bun run build
node dist/index.js build request --help | grep -A1 prescan
```

Expected: all tests PASS, build clean, help shows the three new flags.

- [ ] **Step 7: Commit**

```bash
git add cli/src/build/prescan/command.ts cli/src/build/request.ts cli/src/index.ts cli/test/prescan/command.test.ts
git commit -m "feat(cli): run prescan automatically before build request upload"
```

---

### Task 14: Telemetry + docs + suite wiring

**Files:**
- Modify: `src/build/prescan/command.ts` (one `sendEvent` after each standalone scan)
- Modify: `package.json` (add `test:prescan` script; chain it into the main `test` script)
- Modify: `README.md` (CLI README — add prescan section)

- [ ] **Step 1: Telemetry.** In `prescanCommand` (NOT in the gate — request.ts already sends its own events), after the report is produced and only when an apikey exists, add:

```ts
  if (apikeyUsedForScan) {
    await sendEvent(apikeyUsedForScan, {
      channel: 'build',
      event: 'Prescan run',
      icon: '🛡️',
      tags: {
        'app-id': appId ?? 'unknown',
        platform: options.platform ?? 'unknown',
        errors: String(report.counts.error),
        warnings: String(report.counts.warning),
        'finding-ids': report.findings.filter(f => f.severity !== 'info').map(f => f.id).join(',').slice(0, 200),
      },
    } as any, options.verbose).catch(() => {})
  }
```

To get `apikeyUsedForScan`, refactor `executePrescan` to return `{ report, apikey }` — update the Task 13 gate call site accordingly (it ignores the apikey). Copy the exact `sendEvent` payload shape from an existing call in `src/build/request.ts`.

- [ ] **Step 2: Test script.** In `cli/package.json` scripts add `"test:prescan": "bun test test/prescan/"` and append ` && bun run test:prescan` to the main `"test"` chain (mirror how `test:bundle` is chained).

- [ ] **Step 3: README.** Add a `### build prescan` section to the CLI README documenting: what it scans (one line per category), the auto-run inside `build request`, and the four flags (`--json`, `--fail-on-warnings`, `--ignore-fatal`/`--prescan-ignore-fatal`, `--no-prescan`) with one-line semantics each. Keep it under 40 lines, match the README's existing command-doc style.

- [ ] **Step 4: Full verification.**

```bash
cd cli && bun run build && bun run test:prescan && bun run lint 2>/dev/null || true
```

Expected: build green, all prescan tests pass. If the repo has a lint script, fix any new violations.

- [ ] **Step 5: Commit**

```bash
git add cli/src/build/prescan/command.ts cli/package.json cli/README.md
git commit -m "feat(cli): prescan telemetry, test suite wiring, docs"
```

---

## Self-review checklist (run after Task 14)

- [ ] Spec coverage: all 22 phase-1 checks implemented and in the registry test; flags (`--json`, `--fail-on-warnings`, `--ignore-fatal`, `--prescan-ignore-fatal`, `--no-prescan`) wired; warning prompt interactive-only; remote-skip notice; crash isolation; 10s budget; exit codes 0/1/2.
- [ ] The scanner never blocks on its own bugs (gate try/catch test green).
- [ ] `bun run build` produces a bundle that includes fast-xml-parser (check `meta.json` or run the dist smoke test from Task 12).
- [ ] Phase 2 reminder: AndroidManifest 31-check pack is NOT in this plan — file a follow-up plan after this ships.
