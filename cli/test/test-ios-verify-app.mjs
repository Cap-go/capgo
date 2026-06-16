#!/usr/bin/env node
/**
 * iOS verify-app — the remote App Store verification ENGINE effect (PR #2397 port).
 *
 * Drives `runIosEffect('verify-app', …)` with MOCKED IosEffectDeps (no fs, no
 * network) and asserts the PR #2397 behavior the TUI used to implement
 * driver-side (ui/app.tsx) now lives in the engine:
 *
 *   INITIAL fetch — parallel listApps+listBundleIds, FRESH detectBundleIds
 *   re-detect, classifyAppVerification:
 *     - exact-match       → persists iosBundleIdOverride (+ context appId) and
 *       advances to carried.pendingVerifyNext ?? creating-certificate.
 *     - fetch-failed      → warns + passes through (no persist).
 *     - no-release-config → warns + passes through (no persist).
 *     - wrong-build-id    → PARKS with the picker state in transient.
 *     - no-app-*          → PARKS with verifyPath 'create-app' pre-seeded.
 *
 *   GATE resolver (carried.verifyAction) — pick / create-new / autofix /
 *   continue / recheck / open / back / cancel, including the Path-A
 *   writeReleaseBundleId auto-fix, the Path-B re-poll + ask-before-reopen,
 *   evaluateGate attempt escalation, and the cancel → error exit sink.
 *
 *   verifying-key routing — create-new → verify-app; import app_store →
 *   verify-app + transient.pendingVerifyNext (the import continuation);
 *   import ad_hoc → the import continuation directly; pendingRecoveryAction →
 *   import-create-profile-only (unchanged).
 *
 * EPHEMERAL contract: parking persists NOTHING; the single persisted write is
 * the verified iosBundleIdOverride (+ iosBundleIdContextAppId) on a gate PASS.
 */
import { Buffer } from 'node:buffer'
import process from 'node:process'

const {
  runIosEffect,
  iosViewForStep,
  applyIosInput,
} = await import('../src/build/onboarding/ios/flow.ts')

console.log('🧪 iOS verify-app — engine effect + carried-driven gate (PR #2397 port)\n')

let testsPassed = 0
let testsFailed = 0

async function test(name, fn) {
  try {
    await fn()
    console.log(`✅ ${name}`)
    testsPassed++
  }
  catch (err) {
    console.error(`❌ ${name}`)
    console.error(`   ${err instanceof Error ? err.message : String(err)}`)
    testsFailed++
  }
}

function assert(condition, message) {
  if (!condition)
    throw new Error(message || 'Assertion failed')
}

function assertEquals(actual, expected, message) {
  if (actual !== expected)
    throw new Error(message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

const APP_ID = 'com.example.app'
const OTHER_ID = 'com.other.app'

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const MATCHING_APP = { id: 'ASC1', bundleId: APP_ID, name: 'Example App' }
const OTHER_APP = { id: 'ASC2', bundleId: OTHER_ID, name: 'Other App' }

/** A DetectedBundleIds shape whose Release id is `release` (or unresolved). */
function detected({ release = APP_ID, debug = null, resolved = true, capacitor = APP_ID } = {}) {
  const pbxproj = resolved ? { value: release, source: 'pbxproj-release', label: 'project.pbxproj (Release config)' } : null
  return {
    pbxproj,
    debug: debug ? { value: debug, source: 'pbxproj-debug', label: 'project.pbxproj (Debug config)' } : null,
    plist: null,
    capacitor: { value: capacitor, source: 'capacitor-config', label: 'capacitor.config.ts (appId)' },
    recommended: pbxproj ?? { value: capacitor, source: 'capacitor-config', label: 'capacitor.config.ts (appId)' },
    mismatch: false,
    debugReleaseDiffer: Boolean(debug && resolved && debug !== release),
    releaseResolved: resolved,
    candidates: [],
  }
}

function iosProgress(overrides = {}) {
  const { completedSteps: completedOverrides, ...rest } = overrides
  return {
    platform: 'ios',
    appId: APP_ID,
    startedAt: '2026-06-03T00:00:00.000Z',
    setupMethod: 'create-new',
    p8Path: '/x.p8',
    keyId: 'KEY1',
    issuerId: 'ISS1',
    ...rest,
    completedSteps: {
      apiKeyVerified: { keyId: 'KEY1', issuerId: 'ISS1' },
      ...completedOverrides,
    },
  }
}

function makeDeps(overrides = {}) {
  const calls = []
  const logs = []
  let lastSaved = null

  const deps = {
    appId: APP_ID,
    listApps: async (...a) => { calls.push({ name: 'listApps', args: a }); return [MATCHING_APP, OTHER_APP] },
    listBundleIds: async (...a) => { calls.push({ name: 'listBundleIds', args: a }); return [APP_ID, OTHER_ID] },
    detectBundleIds: (...a) => { calls.push({ name: 'detectBundleIds', args: a }); return detected() },
    writeReleaseBundleId: (...a) => { calls.push({ name: 'writeReleaseBundleId', args: a }); return { changed: 1 } },
    ensureBundleId: async (...a) => { calls.push({ name: 'ensureBundleId', args: a }) },
    openExternal: async (...a) => { calls.push({ name: 'openExternal', args: a }) },
    verifyApiKey: async (...a) => { calls.push({ name: 'verifyApiKey', args: a }); return { teamId: 'TEAM123' } },
    readFile: async (...a) => { calls.push({ name: 'readFile', args: a }); return Buffer.from('P8') },
    saveProgress: async (appId, progress) => { calls.push({ name: 'saveProgress', args: [appId, progress] }); lastSaved = progress },
    loadProgress: async () => null,
    onLog: (message, color) => logs.push({ message, color }),
    ...overrides,
  }
  deps.__calls = calls
  deps.__logs = logs
  deps.__lastSaved = () => lastSaved
  return deps
}

// ════════════════════════════════════════════════════════════════════════════════
// (1) INITIAL fetch — exits
// ════════════════════════════════════════════════════════════════════════════════

await test('exact-match → creating-certificate (fallback); persists iosBundleIdOverride + iosBundleIdContextAppId; logs ✓', async () => {
  const deps = makeDeps()
  const res = await runIosEffect('verify-app', iosProgress(), deps)
  assertEquals(res.next, 'creating-certificate', 'no pendingVerifyNext carried → falls back to creating-certificate')
  assertEquals(res.progress.iosBundleIdOverride, APP_ID, 'the verified Release id is persisted as the override')
  assertEquals(res.progress.iosBundleIdContextAppId, APP_ID, 'the capacitor appId snapshot is persisted for drift detection')
  assertEquals(deps.__lastSaved()?.iosBundleIdOverride, APP_ID, 'saveProgress wrote the override (the persistVerifyOverride write)')
  assertEquals(res.transient.verifyResult, 'exact-match', 'transient carries the classification for the driver telemetry')
  assertEquals(res.transient.verifyReleaseBundleId, APP_ID, 'transient carries the fresh-detected Release id')
  assert(deps.__logs.some(l => l.message.includes('✓ Building "Example App"')), 'logs the exact-match pass line')
  assert(deps.__calls.some(c => c.name === 'listApps') && deps.__calls.some(c => c.name === 'listBundleIds'), 'fetches apps + bundleIds')
})

await test('exact-match honors carried.pendingVerifyNext (the import continuation)', async () => {
  const deps = makeDeps({ carried: { pendingVerifyNext: 'import-validating-all-certs' } })
  const res = await runIosEffect('verify-app', iosProgress({ setupMethod: 'import-existing', importDistribution: 'app_store' }), deps)
  assertEquals(res.next, 'import-validating-all-certs', 'a carried pendingVerifyNext routes the pass to the import continuation')
  assertEquals(res.progress.iosBundleIdOverride, APP_ID, 'the override is persisted on the import path too')
})

await test('exact-match with a failing saveProgress STILL advances (warn, in-memory override kept)', async () => {
  const deps = makeDeps({ saveProgress: async () => { throw new Error('disk full') } })
  const res = await runIosEffect('verify-app', iosProgress(), deps)
  assertEquals(res.next, 'creating-certificate', 'a save failure is non-fatal — the pass still advances')
  assertEquals(res.progress.iosBundleIdOverride, APP_ID, 'the in-memory override is still returned')
  assert(deps.__logs.some(l => l.message.includes('could not save the bundle ID override') && l.color === 'yellow'), 'warns about the failed save')
})

await test('fetch-failed (listApps throws) → pass-through; verifyResult fetch-failed; NO persist; warns', async () => {
  const deps = makeDeps({ listApps: async () => { throw new Error('503') } })
  const res = await runIosEffect('verify-app', iosProgress(), deps)
  assertEquals(res.next, 'creating-certificate', 'an ASC failure passes through (never traps the user)')
  assertEquals(res.transient.verifyResult, 'fetch-failed', 'transient surfaces the fetch failure for telemetry')
  assert(res.progress.iosBundleIdOverride === undefined, 'no override persisted on a fetch failure')
  assert(!deps.__calls.some(c => c.name === 'saveProgress'), 'no saveProgress on a fetch failure')
  assert(deps.__logs.some(l => l.message.includes("Couldn't reach App Store Connect to verify") && l.color === 'yellow'), 'warns visibly')
})

await test('fetch-failed honors carried.pendingVerifyNext', async () => {
  const deps = makeDeps({ listApps: async () => { throw new Error('503') }, carried: { pendingVerifyNext: 'import-pick-identity' } })
  const res = await runIosEffect('verify-app', iosProgress({ setupMethod: 'import-existing', importDistribution: 'app_store' }), deps)
  assertEquals(res.next, 'import-pick-identity', 'the pass-through still routes to the carried import continuation')
})

await test('no-release-config (unresolved Release) → pass-through; verifyResult no-release-config; NO persist; warns', async () => {
  const deps = makeDeps({ detectBundleIds: () => detected({ resolved: false }) })
  const res = await runIosEffect('verify-app', iosProgress(), deps)
  assertEquals(res.next, 'creating-certificate', 'no Release config → skip gating, pass through')
  assertEquals(res.transient.verifyResult, 'no-release-config', 'transient surfaces the skip reason')
  assertEquals(res.transient.verifyReleaseBundleId, '', 'no Release id resolved')
  assert(!deps.__calls.some(c => c.name === 'saveProgress'), 'no persist when skipping')
  assert(deps.__logs.some(l => l.message.includes('Could not resolve a Release PRODUCT_BUNDLE_IDENTIFIER')), 'warns about the unresolved Release config')
})

await test('wrong-build-id (apps exist, none match) → PARKS on verify-app with the picker state (no verifyPath)', async () => {
  const deps = makeDeps({ detectBundleIds: () => detected({ release: 'com.not.matching' }) })
  const res = await runIosEffect('verify-app', iosProgress(), deps)
  assertEquals(res.next, 'verify-app', 'parks for the picker')
  assertEquals(res.transient.verifyResult, 'wrong-build-id', 'classification rides transient')
  assert(res.transient.verifyPath === undefined, 'wrong-build-id does NOT pre-seed a gate path (picker first)')
  assertEquals(res.transient.verifyApps.length, 2, 'the picker source rides transient')
  assertEquals(res.transient.verifyReleaseBundleId, 'com.not.matching', 'the fresh Release id rides transient')
  assert(!deps.__calls.some(c => c.name === 'saveProgress'), 'parking persists NOTHING')
})

await test('no apps at all → PARKS with verifyPath create-app pre-seeded (registered + unregistered)', async () => {
  for (const registered of [[APP_ID], []]) {
    const deps = makeDeps({ listApps: async () => [], listBundleIds: async () => registered })
    const res = await runIosEffect('verify-app', iosProgress(), deps)
    assertEquals(res.next, 'verify-app', 'parks for the Path B gate')
    assertEquals(res.transient.verifyPath, 'create-app', 'Path B is pre-seeded (no picker needed)')
    assertEquals(
      res.transient.verifyResult,
      registered.length > 0 ? 'no-app-identifier-exists' : 'no-app-unregistered',
      'the registered/unregistered split rides transient',
    )
  }
})

await test('Debug ≠ Release → transient verifyDebugBundleId + verifyDebugReleaseDiffer + a yellow log (still passes on exact-match)', async () => {
  const deps = makeDeps({ detectBundleIds: () => detected({ debug: 'com.debug.app' }) })
  const res = await runIosEffect('verify-app', iosProgress(), deps)
  assertEquals(res.transient.verifyDebugBundleId, 'com.debug.app', 'the Debug id rides transient for the warning box')
  assertEquals(res.transient.verifyDebugReleaseDiffer, true, 'the differ flag rides transient for telemetry')
  assert(deps.__logs.some(l => l.message.includes('Debug builds "com.debug.app"') && l.color === 'yellow'), 'logs the awareness note')
  assertEquals(res.next, 'creating-certificate', 'the note never gates — exact-match still passes')
})

// ════════════════════════════════════════════════════════════════════════════════
// (2) GATE resolver — picker actions
// ════════════════════════════════════════════════════════════════════════════════

const PARKED = { verifyReleaseBundleId: 'com.not.matching', verifyApps: [MATCHING_APP, OTHER_APP], verifyRegisteredIds: [APP_ID], verifyResult: 'wrong-build-id' }

await test("resolver 'pick' (non-matching app) → Path A with verifyChosenApp; parks; persists nothing", async () => {
  const deps = makeDeps({ carried: { ...PARKED, verifyAction: 'pick', verifyChosenApp: MATCHING_APP } })
  const res = await runIosEffect('verify-app', iosProgress(), deps)
  assertEquals(res.next, 'verify-app', 'stays parked on the Path A gate')
  assertEquals(res.transient.verifyPath, 'fix-build-id', 'routes into Path A')
  assertEquals(res.transient.verifyChosenApp.bundleId, APP_ID, 'the chosen app rides transient')
  assert(!deps.__calls.some(c => c.name === 'saveProgress'), 'a pick persists nothing')
})

await test("resolver 'pick' (app already matching the release id) → defensive straight pass + persist", async () => {
  const deps = makeDeps({ carried: { ...PARKED, verifyReleaseBundleId: APP_ID, verifyAction: 'pick', verifyChosenApp: MATCHING_APP } })
  const res = await runIosEffect('verify-app', iosProgress(), deps)
  assertEquals(res.next, 'creating-certificate', 'a matching pick passes straight through')
  assertEquals(res.progress.iosBundleIdOverride, APP_ID, 'the override is persisted on the defensive pass')
})

await test("resolver 'create-new' (picker escape) → Path B", async () => {
  const deps = makeDeps({ carried: { ...PARKED, verifyAction: 'create-new' } })
  const res = await runIosEffect('verify-app', iosProgress(), deps)
  assertEquals(res.next, 'verify-app', 'stays parked on the Path B gate')
  assertEquals(res.transient.verifyPath, 'create-app', 'routes into Path B')
})

// ════════════════════════════════════════════════════════════════════════════════
// (3) GATE resolver — Path A (fix-build-id): continue + autofix
// ════════════════════════════════════════════════════════════════════════════════

await test("resolver 'continue' BLOCKED (fresh detect still wrong) → verifyAttempt 1, stays, fresh release id mirrored", async () => {
  const deps = makeDeps({
    detectBundleIds: () => detected({ release: 'com.not.matching' }),
    carried: { ...PARKED, verifyAction: 'continue', verifyChosenApp: MATCHING_APP, verifyPath: 'fix-build-id' },
  })
  const res = await runIosEffect('verify-app', iosProgress(), deps)
  assertEquals(res.next, 'verify-app', 'a blocked re-check stays parked')
  assertEquals(res.transient.verifyAttempt, 1, 'the attempt counter advances (escalation)')
  assertEquals(res.transient.verifyReleaseBundleId, 'com.not.matching', 'the fresh-detected id is mirrored either way')
  assert(!deps.__calls.some(c => c.name === 'saveProgress'), 'a blocked re-check persists nothing')
})

await test("resolver 'continue' attempts keep counting (2 → 3 → …) from the carried verifyAttempt", async () => {
  const deps = makeDeps({
    detectBundleIds: () => detected({ release: 'com.not.matching' }),
    carried: { ...PARKED, verifyAction: 'continue', verifyChosenApp: MATCHING_APP, verifyPath: 'fix-build-id', verifyAttempt: 2 },
  })
  const res = await runIosEffect('verify-app', iosProgress(), deps)
  assertEquals(res.transient.verifyAttempt, 3, 'the attempt threads from carried and increments')
})

await test("resolver 'continue' SATISFIED (user fixed pbxproj) → persist the NEW release id + advance", async () => {
  const deps = makeDeps({
    detectBundleIds: () => detected({ release: APP_ID }),
    carried: { ...PARKED, verifyAction: 'continue', verifyChosenApp: MATCHING_APP, verifyPath: 'fix-build-id' },
  })
  const res = await runIosEffect('verify-app', iosProgress(), deps)
  assertEquals(res.next, 'creating-certificate', 'the gate passes')
  assertEquals(res.progress.iosBundleIdOverride, APP_ID, 'the NEW (fixed) Release id is persisted as the override')
  assert(deps.__logs.some(l => l.message.includes('✓ Building "Example App"')), 'logs the pass line with the chosen app name')
})

await test("resolver 'autofix' → writeReleaseBundleId(releaseId → chosen.bundleId), logs 🔧, then re-checks (passes with the default detect)", async () => {
  let written = false
  const deps = makeDeps({
    detectBundleIds: () => detected({ release: written ? APP_ID : 'com.not.matching' }),
    writeReleaseBundleId: (fromId, toId) => {
      written = true
      assertEquals(fromId, 'com.not.matching', 'rewrites assignments equal to the CURRENT build id')
      assertEquals(toId, APP_ID, "rewrites them to the chosen app's bundle id")
      return { changed: 2 }
    },
    carried: { ...PARKED, verifyAction: 'autofix', verifyChosenApp: MATCHING_APP, verifyPath: 'fix-build-id' },
  })
  const res = await runIosEffect('verify-app', iosProgress(), deps)
  assert(deps.__logs.some(l => l.message.includes('🔧 Updated PRODUCT_BUNDLE_IDENTIFIER')), 'logs the auto-fix')
  assertEquals(res.next, 'creating-certificate', 'the post-fix re-check passes the gate')
  assertEquals(res.progress.iosBundleIdOverride, APP_ID, 'the fixed Release id is persisted')
})

await test("resolver 'autofix' with changed=0 → warns 'Couldn't find' and the re-check stays blocked", async () => {
  const deps = makeDeps({
    detectBundleIds: () => detected({ release: 'com.not.matching' }),
    writeReleaseBundleId: () => ({ changed: 0 }),
    carried: { ...PARKED, verifyAction: 'autofix', verifyChosenApp: MATCHING_APP, verifyPath: 'fix-build-id' },
  })
  const res = await runIosEffect('verify-app', iosProgress(), deps)
  assert(deps.__logs.some(l => l.message.includes("Couldn't find PRODUCT_BUNDLE_IDENTIFIER") && l.color === 'yellow'), 'warns nothing matched')
  assertEquals(res.next, 'verify-app', 'still blocked')
  assertEquals(res.transient.verifyAttempt, 1, 'the blocked re-check counts the attempt')
})

await test("resolver 'autofix' with a THROWING write → warns 'Could not write' and still re-checks", async () => {
  const deps = makeDeps({
    detectBundleIds: () => detected({ release: 'com.not.matching' }),
    writeReleaseBundleId: () => { throw new Error('EACCES') },
    carried: { ...PARKED, verifyAction: 'autofix', verifyChosenApp: MATCHING_APP, verifyPath: 'fix-build-id' },
  })
  const res = await runIosEffect('verify-app', iosProgress(), deps)
  assert(deps.__logs.some(l => l.message.includes('Could not write to your Xcode project') && l.color === 'yellow'), 'warns about the write failure')
  assertEquals(res.next, 'verify-app', 'still blocked (the re-check ran)')
})

// ════════════════════════════════════════════════════════════════════════════════
// (4) GATE resolver — Path B (create-app): recheck + open + back + cancel
// ════════════════════════════════════════════════════════════════════════════════

const PARKED_B = { verifyReleaseBundleId: APP_ID, verifyApps: [], verifyRegisteredIds: [], verifyResult: 'no-app-unregistered', verifyPath: 'create-app' }

await test("resolver 'recheck' SATISFIED (the app now exists) → persist + advance to the carried pendingVerifyNext", async () => {
  const deps = makeDeps({
    listApps: async () => [MATCHING_APP],
    carried: { ...PARKED_B, verifyAction: 'recheck', pendingVerifyNext: 'import-validating-all-certs' },
  })
  const res = await runIosEffect('verify-app', iosProgress({ setupMethod: 'import-existing', importDistribution: 'app_store' }), deps)
  assertEquals(res.next, 'import-validating-all-certs', 'the re-poll pass routes to the carried import continuation')
  assertEquals(res.progress.iosBundleIdOverride, APP_ID, 'the verified id is persisted on the re-poll pass')
})

await test("resolver 'recheck' BLOCKED (still no app) → verifyAttempt+1 + verifyAskReopen + refreshed verifyApps", async () => {
  const deps = makeDeps({
    listApps: async () => [OTHER_APP],
    carried: { ...PARKED_B, verifyAction: 'recheck', verifyAttempt: 1 },
  })
  const res = await runIosEffect('verify-app', iosProgress(), deps)
  assertEquals(res.next, 'verify-app', 'stays parked')
  assertEquals(res.transient.verifyAttempt, 2, 'the attempt counts')
  assertEquals(res.transient.verifyAskReopen, true, 'asks before re-opening the browser')
  assertEquals(res.transient.verifyApps.length, 1, 'the re-polled app list is refreshed')
})

await test("resolver 'recheck' FETCH FAILURE → still counts the attempt + asks; warns about connectivity", async () => {
  const deps = makeDeps({
    listApps: async () => { throw new Error('offline') },
    carried: { ...PARKED_B, verifyAction: 'recheck' },
  })
  const res = await runIosEffect('verify-app', iosProgress(), deps)
  assertEquals(res.next, 'verify-app', 'stays parked')
  assertEquals(res.transient.verifyAttempt, 1, 'the failed re-check is NOT a silent no-op')
  assertEquals(res.transient.verifyAskReopen, true, 'still asks before re-opening')
  assert(deps.__logs.some(l => l.message.includes("Couldn't reach App Store Connect to re-check")), 'warns distinctly from "app still missing"')
})

await test("resolver 'open' → ensureBundleId(releaseId) + openExternal(ASC apps page); clears verifyAskReopen; stays", async () => {
  const deps = makeDeps({ carried: { ...PARKED_B, verifyAction: 'open', verifyAskReopen: true } })
  const res = await runIosEffect('verify-app', iosProgress(), deps)
  assertEquals(res.next, 'verify-app', 'opening the page never advances the gate')
  assertEquals(res.transient.verifyAskReopen, false, 'the ask-reopen flag resets')
  const ensure = deps.__calls.find(c => c.name === 'ensureBundleId')
  assert(ensure && ensure.args[0] === APP_ID, 'registers the identifier first (idempotent) so the form can select it')
  const open = deps.__calls.find(c => c.name === 'openExternal')
  assert(open && open.args[0] === 'https://appstoreconnect.apple.com/apps', 'opens the ASC apps page')
})

await test("resolver 'open' is best-effort: a failing ensureBundleId AND a failing openExternal never abort", async () => {
  const deps = makeDeps({
    ensureBundleId: async () => { throw new Error('409') },
    openExternal: async () => { throw new Error('no browser') },
    carried: { ...PARKED_B, verifyAction: 'reopen' },
  })
  const res = await runIosEffect('verify-app', iosProgress(), deps)
  assertEquals(res.next, 'verify-app', 'still parked (no crash)')
  assert(deps.__logs.some(l => l.message.includes('Could not open your browser')), 'falls back to the manual URL hint')
})

await test("resolver 'back' → resets to the picker (verifyPath/chosen/attempt/askReopen)", async () => {
  const deps = makeDeps({ carried: { ...PARKED, verifyAction: 'back', verifyPath: 'fix-build-id', verifyChosenApp: MATCHING_APP, verifyAttempt: 2, verifyAskReopen: true } })
  const res = await runIosEffect('verify-app', iosProgress(), deps)
  assertEquals(res.next, 'verify-app', 'back stays on the step (the picker re-renders)')
  assertEquals(res.transient.verifyPath, null, 'gate path resets to the picker')
  assertEquals(res.transient.verifyChosenApp, null, 'the chosen app resets')
  assertEquals(res.transient.verifyAttempt, 0, 'the attempt counter resets')
  assertEquals(res.transient.verifyAskReopen, false, 'the ask-reopen flag resets')
})

await test("resolver 'cancel' → the error exit sink (no retryStep), persists nothing", async () => {
  const deps = makeDeps({ carried: { ...PARKED, verifyAction: 'cancel', verifyPath: 'fix-build-id' } })
  const res = await runIosEffect('verify-app', iosProgress(), deps)
  assertEquals(res.next, 'error', 'cancel routes to the error exit sink')
  assert(res.transient.error && res.transient.error.includes('cancelled'), 'the sink carries a human message')
  assert(res.transient.retryStep === undefined, 'no retryStep — the exit sink offers no Try again')
  assert(!deps.__calls.some(c => c.name === 'saveProgress'), 'cancel persists nothing')
})

// ════════════════════════════════════════════════════════════════════════════════
// (5) verifying-key routing into verify-app (the PR #2397 next changes)
// ════════════════════════════════════════════════════════════════════════════════

await test('verifying-key (create-new) → verify-app with NO pendingVerifyNext', async () => {
  const deps = makeDeps({ carried: { p8Content: Buffer.from('P8') } })
  const res = await runIosEffect('verifying-key', iosProgress({ completedSteps: {} }), deps)
  assertEquals(res.next, 'verify-app', 'create-new detours through the remote verification gate')
  assert(res.transient.pendingVerifyNext === undefined, 'no pendingVerifyNext — verify-app falls back to creating-certificate')
})

await test('verifying-key (import app_store, importMatches > 0) → verify-app + pendingVerifyNext=import-validating-all-certs', async () => {
  const deps = makeDeps({ carried: { p8Content: Buffer.from('P8'), importMatches: [{ identity: { sha1: 'a'.repeat(40) }, profiles: [] }] } })
  const progress = iosProgress({ setupMethod: 'import-existing', importDistribution: 'app_store', completedSteps: {} })
  const res = await runIosEffect('verifying-key', progress, deps)
  assertEquals(res.next, 'verify-app', 'import app_store detours through verify-app')
  assertEquals(res.transient.pendingVerifyNext, 'import-validating-all-certs', 'matches>0 → the eager batch validation is the continuation')
})

await test('verifying-key (import app_store, NO importMatches) → verify-app + pendingVerifyNext=import-pick-identity', async () => {
  const deps = makeDeps({ carried: { p8Content: Buffer.from('P8') } })
  const progress = iosProgress({ setupMethod: 'import-existing', importDistribution: 'app_store', completedSteps: {} })
  const res = await runIosEffect('verifying-key', progress, deps)
  assertEquals(res.next, 'verify-app', 'import app_store detours through verify-app')
  assertEquals(res.transient.pendingVerifyNext, 'import-pick-identity', 'no matches → the identity picker is the continuation')
})

await test('verifying-key (import ad_hoc) → the import continuation DIRECTLY (verify-app skipped)', async () => {
  const deps = makeDeps({ carried: { p8Content: Buffer.from('P8') } })
  const progress = iosProgress({ setupMethod: 'import-existing', importDistribution: 'ad_hoc', completedSteps: {} })
  const res = await runIosEffect('verifying-key', progress, deps)
  assertEquals(res.next, 'import-pick-identity', 'ad_hoc never uploads to TestFlight → no verify-app detour')
  assert(res.transient.pendingVerifyNext === undefined, 'no pendingVerifyNext on the ad_hoc skip')
})

await test('verifying-key (pendingRecoveryAction) → import-create-profile-only (UNCHANGED, no verify-app)', async () => {
  const deps = makeDeps({ carried: { p8Content: Buffer.from('P8') } })
  const progress = iosProgress({ setupMethod: 'import-existing', importDistribution: 'app_store', pendingRecoveryAction: 'import-create-profile-only', completedSteps: {} })
  const res = await runIosEffect('verifying-key', progress, deps)
  assertEquals(res.next, 'import-create-profile-only', 'the deferred recovery action resumes without a verify-app detour')
  assert(res.transient.pendingVerifyNext === undefined, 'no pendingVerifyNext on the recovery resume')
  assert(res.progress.pendingRecoveryAction === undefined, 'the marker is cleared so it cannot re-fire')
})

// ════════════════════════════════════════════════════════════════════════════════
// (6) VIEW + reducer contracts
// ════════════════════════════════════════════════════════════════════════════════

await test('VIEW: auto before classification; picker / Path A / Path B / ask-reopen choices once parked', async () => {
  const base = iosProgress()
  assertEquals(iosViewForStep('verify-app', base, { appId: APP_ID }).kind, 'auto', 'no verifyResult → auto (the initial fetch)')

  const picker = iosViewForStep('verify-app', base, { appId: APP_ID, ...PARKED })
  assertEquals(picker.kind, 'choice', 'parked wrong-build-id → the picker choice')
  const pickerValues = picker.options.map(o => o.value)
  assert(pickerValues.includes(APP_ID) && pickerValues.includes(OTHER_ID) && pickerValues.includes('__create_new__'), 'one option per app + the create-new escape')

  const pathA = iosViewForStep('verify-app', base, { appId: APP_ID, ...PARKED, verifyPath: 'fix-build-id', verifyChosenApp: MATCHING_APP })
  assertEquals(JSON.stringify(pathA.options.map(o => o.value)), JSON.stringify(['autofix', 'continue', 'back', 'cancel']), 'Path A offers autofix/continue/back/cancel')

  const pathB = iosViewForStep('verify-app', base, { appId: APP_ID, ...PARKED_B })
  assertEquals(JSON.stringify(pathB.options.map(o => o.value)), JSON.stringify(['open', 'recheck', 'cancel']), 'Path B (no apps) offers open/recheck/cancel — no back without apps')

  const pathBWithApps = iosViewForStep('verify-app', base, { appId: APP_ID, ...PARKED_B, verifyApps: [OTHER_APP] })
  assert(pathBWithApps.options.map(o => o.value).includes('back'), 'Path B offers back when the account has apps to pick')

  const reopen = iosViewForStep('verify-app', base, { appId: APP_ID, ...PARKED_B, verifyAskReopen: true })
  assertEquals(JSON.stringify(reopen.options.map(o => o.value)), JSON.stringify(['recheck', 'reopen', 'cancel']), 'after a blocked re-poll: recheck/reopen/cancel')
})

await test('REDUCER: applyIosInput(verify-app) is a no-op (the pick is EPHEMERAL)', async () => {
  const before = iosProgress()
  const after = applyIosInput('verify-app', before, { step: 'verify-app', value: 'autofix' })
  assertEquals(JSON.stringify(after), JSON.stringify(before), 'the reducer persists nothing — the resolver owns the routing')
})

await test('EPHEMERAL: no verify* field ever lands in the persisted progress', async () => {
  const deps = makeDeps()
  const res = await runIosEffect('verify-app', iosProgress(), deps)
  const json = JSON.stringify(deps.__lastSaved())
  for (const forbidden of ['verifyApps', 'verifyPath', 'verifyAttempt', 'pendingVerifyNext', 'verifyResult', 'verifyAction'])
    assert(!json.includes(forbidden), `persisted progress leaked "${forbidden}"`)
  assert(res.progress.iosBundleIdOverride, 'only the documented override marker is persisted')
})

// ─── Summary ─────────────────────────────────────────────────────────────────────

console.log(`\n${testsPassed} passed, ${testsFailed} failed`)
if (testsFailed > 0)
  process.exit(1)
