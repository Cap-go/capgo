#!/usr/bin/env node
/**
 * iOS BATCH 4 — confirm-app-id (the appId-mismatch confirmation gate).
 *
 * The confirm-app-id step appears ONLY when the iOS bundle id in the Xcode
 * project disagrees with capacitor.config.appId. That mismatch is a SYNC FS read
 * the IO-FREE engine must NOT perform — the DRIVER runs `detectIosBundleIds`,
 * records the result by persisting `pendingAppIdNext` (the router target) and
 * threads the detected candidate list through `ctx.bundleIdCandidates`. This
 * spec drives the THREE engine surfaces (mirroring ui/app.tsx:3063–3173 +
 * 247–272):
 *
 *   1. getIosResumeStep — the Phase-1 gate (mismatch pending && !confirmed →
 *      confirm-app-id) and the Phase-1b post-confirm routing (confirmed &&
 *      pendingAppIdNext → that target, no re-ask).
 *   2. iosViewForStep — the CHOICE view (candidate list + "type custom" escape)
 *      when ctx.confirmAppIdTyping is falsy vs the INPUT view when truthy.
 *   3. applyIosInput — persists iosBundleIdOverride + iosBundleIdContextAppId +
 *      appIdConfirmed (NOT the candidate list); the '__type__' sentinel + empty
 *      submissions are no-ops.
 *
 * It also proves the staleness contract: a persisted override scoped to a
 * DIFFERENT config.appId (iosBundleIdContextAppId mismatch) re-asks, exactly as
 * the TUI's `savedOverrideIsFresh` guard (app.tsx:236) leaves appIdConfirmed
 * false so the driver re-routes into the gate.
 */
import process from 'node:process'

const {
  iosViewForStep,
  applyIosInput,
} = await import('../src/build/onboarding/ios/flow.ts')

// The TOTAL iOS resume resolver — the single source of truth for the confirm-app-id
// gate (Phase 1) and the post-confirm forward routing (Phase 1b).
const {
  getIosResumeStep,
} = await import('../src/build/onboarding/ios/progress.ts')

console.log('🧪 iOS BATCH 4 — confirm-app-id view + reducer + resume routing\n')

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

// What the driver hands the view via ctx.bundleIdCandidates (the deduped, ordered
// `detectIosBundleIds().candidates` — recommended first). Shape: BundleIdCandidate.
const CANDIDATES = [
  { value: 'com.example.app.Build', source: 'pbxproj-release', label: 'project.pbxproj (Release)' },
  { value: 'com.example.app', source: 'capacitor-config', label: 'capacitor.config.appId' },
]

function iosProgress(overrides = {}) {
  const { completedSteps: completedOverrides, ...rest } = overrides
  return {
    platform: 'ios',
    appId: APP_ID,
    startedAt: '2026-06-03T00:00:00.000Z',
    ...rest,
    completedSteps: {
      ...completedOverrides,
    },
  }
}

// ─── 1) Phase-1 gate: mismatch pending && !confirmed → confirm-app-id ──────────────

await test('getIosResumeStep: mismatch pending (pendingAppIdNext set, !appIdConfirmed) → confirm-app-id', async () => {
  const p = iosProgress({ pendingAppIdNext: 'import-pick-identity' })
  assertEquals(getIosResumeStep(p), 'confirm-app-id', 'a pending mismatch parks the user on the confirm gate')
})

await test('getIosResumeStep: NO pending mismatch (legacy/in-flight file) skips the gate', async () => {
  // No pendingAppIdNext → the gate is never entered; create-new with no .p8 inputs
  // resumes at api-key-instructions (proves the gate did not fire).
  const p = iosProgress({ setupMethod: 'create-new' })
  assert(getIosResumeStep(p) !== 'confirm-app-id', 'no pendingAppIdNext → the gate is skipped entirely')
})

// ─── 2) CHOICE view (confirmAppIdTyping falsy) — candidate list + escape ───────────

await test("iosViewForStep('confirm-app-id') with NO typing ctx is a CHOICE listing candidates + a type-custom option", async () => {
  const view = iosViewForStep('confirm-app-id', iosProgress({ pendingAppIdNext: 'import-pick-identity' }), {
    appId: APP_ID,
    bundleIdCandidates: CANDIDATES,
  })
  assertEquals(view.step, 'confirm-app-id', 'view echoes the step')
  assertEquals(view.kind, 'choice', 'falsy confirmAppIdTyping → the candidate CHOICE view')
  assert(Array.isArray(view.options), 'must expose options')
  const values = view.options.map(o => o.value)
  // Every driver-provided candidate is offered, in order…
  assert(values.includes('com.example.app.Build'), 'offers the pbxproj (Xcode) candidate')
  assert(values.includes('com.example.app'), 'offers the capacitor.config candidate')
  // …plus the custom-input escape hatch (mirrors app.tsx:3161 '__type__').
  assert(values.includes('__type__'), 'offers the "type a custom bundle ID" escape option')
  assertEquals(view.options[view.options.length - 1].value, '__type__', 'the escape option is LAST')
  // Recommended (first) candidate is flagged.
  assert(view.options[0].label.includes('(recommended)'), 'the first candidate is flagged (recommended)')
  assert(!view.options[1].label.includes('(recommended)'), 'only the first candidate is flagged recommended')
})

await test("confirm-app-id CHOICE view with no driver candidates still offers the type-custom escape", async () => {
  const view = iosViewForStep('confirm-app-id', iosProgress({ pendingAppIdNext: 'import-pick-identity' }), { appId: APP_ID })
  assertEquals(view.kind, 'choice', 'still a choice when ctx.bundleIdCandidates is absent')
  assertEquals(view.options.length, 1, 'only the escape option remains when no candidates were threaded')
  assertEquals(view.options[0].value, '__type__', 'the lone option is the custom-input escape')
})

// ─── 3) INPUT view (confirmAppIdTyping truthy) — custom bundle id collection ───────

await test("iosViewForStep('confirm-app-id') with confirmAppIdTyping=true is an INPUT collecting the bundle id", async () => {
  const view = iosViewForStep('confirm-app-id', iosProgress({ pendingAppIdNext: 'import-pick-identity' }), {
    appId: APP_ID,
    confirmAppIdTyping: true,
    bundleIdCandidates: CANDIDATES,
  })
  assertEquals(view.step, 'confirm-app-id', 'view echoes the step')
  assertEquals(view.kind, 'input', 'truthy confirmAppIdTyping → the custom-input view')
  assert(Array.isArray(view.collect) && view.collect.includes('iosBundleId'), 'collects the iOS bundle id')
  assert(typeof view.prompt === 'string' && view.prompt.length > 0, 'carries a prompt')
  // The input view must NOT carry choice options.
  assert(view.options === undefined, 'the input sub-mode exposes no choice options')
})

// ─── 4) applyIosInput — persist override + context + confirmed; NOT the list ───────

await test('confirm-app-id reducer persists iosBundleIdOverride + iosBundleIdContextAppId + appIdConfirmed', async () => {
  const before = iosProgress({ pendingAppIdNext: 'import-pick-identity' })
  const after = applyIosInput('confirm-app-id', before, { step: 'confirm-app-id', value: 'com.example.app.Build' })
  assertEquals(after.iosBundleIdOverride, 'com.example.app.Build', 'persists the chosen bundle id as the Apple-side override')
  assertEquals(after.iosBundleIdContextAppId, APP_ID, 'snapshots the config.appId the override is scoped to')
  assertEquals(after.appIdConfirmed, true, 'marks appIdConfirmed so the gate is not re-shown')
  // The driver-provided candidate list is EPHEMERAL — never persisted.
  assert(!('bundleIdCandidates' in after), 'the candidate list must NOT be persisted to progress')
})

await test('confirm-app-id reducer trims the typed value before persisting', async () => {
  const before = iosProgress({ pendingAppIdNext: 'import-pick-identity' })
  const after = applyIosInput('confirm-app-id', before, { step: 'confirm-app-id', value: '  com.example.typed  ' })
  assertEquals(after.iosBundleIdOverride, 'com.example.typed', 'the persisted override is trimmed')
  assertEquals(after.appIdConfirmed, true, 'a trimmed-non-empty value confirms')
})

await test("confirm-app-id reducer treats the '__type__' escape sentinel as a no-op (never persisted as a bundle id)", async () => {
  const before = iosProgress({ pendingAppIdNext: 'import-pick-identity' })
  const after = applyIosInput('confirm-app-id', before, { step: 'confirm-app-id', value: '__type__' })
  assert(after.iosBundleIdOverride === undefined, "the '__type__' sentinel must NOT be persisted as an override")
  assert(after.appIdConfirmed === undefined || after.appIdConfirmed === false, 'the escape sentinel does not confirm')
})

await test('confirm-app-id reducer ignores an empty submission (stays on the gate)', async () => {
  const before = iosProgress({ pendingAppIdNext: 'import-pick-identity' })
  const after = applyIosInput('confirm-app-id', before, { step: 'confirm-app-id', value: '   ' })
  assert(after.iosBundleIdOverride === undefined, 'an empty value is a no-op')
  assert(after.appIdConfirmed === undefined || after.appIdConfirmed === false, 'an empty value does not confirm')
  assertEquals(getIosResumeStep(after), 'confirm-app-id', 'an un-confirmed gate still re-asks on resume')
})

// ─── 5) Phase-1b post-confirm routing: confirmed → pendingAppIdNext, NO re-ask ─────

await test('AFTER confirm: getIosResumeStep routes to pendingAppIdNext and does NOT re-ask', async () => {
  let p = iosProgress({ pendingAppIdNext: 'import-pick-identity' })
  // Sanity: pre-confirm the gate fires.
  assertEquals(getIosResumeStep(p), 'confirm-app-id', 'pre-confirm the gate is shown')
  // The user confirms a value at the gate.
  p = applyIosInput('confirm-app-id', p, { step: 'confirm-app-id', value: 'com.example.app.Build' })
  // Post-confirm (pendingAppIdNext not yet cleared by the driver): resume routes
  // FORWARD to the recorded target — NOT back to confirm-app-id (no re-ask).
  assertEquals(getIosResumeStep(p), 'import-pick-identity', 'resume routes to the recorded pendingAppIdNext target')
  assert(getIosResumeStep(p) !== 'confirm-app-id', 'a confirmed gate is NEVER re-asked')
})

await test('AFTER confirm with a DIFFERENT pendingAppIdNext target: resume honors that target', async () => {
  let p = iosProgress({ pendingAppIdNext: 'verifying-key' })
  p = applyIosInput('confirm-app-id', p, { step: 'confirm-app-id', value: 'com.example.app.Build' })
  assertEquals(getIosResumeStep(p), 'verifying-key', 'the post-confirm router honors whatever target the driver recorded')
})

await test('AFTER the driver clears pendingAppIdNext: the post-confirm branch is dormant (no re-ask, normal routing)', async () => {
  // The TUI clears pendingAppIdNext on the next applyInput (setPendingAppIdNext(null),
  // app.tsx:3085). Modeled here: confirmed + override scoped to THIS appId + no
  // pendingAppIdNext → the gate is fully behind us; create-new with no .p8 inputs
  // resumes at api-key-instructions.
  const p = iosProgress({
    setupMethod: 'create-new',
    appIdConfirmed: true,
    iosBundleIdOverride: 'com.example.app.Build',
    iosBundleIdContextAppId: APP_ID,
  })
  assert(getIosResumeStep(p) !== 'confirm-app-id', 'with pendingAppIdNext cleared the gate never re-fires')
  assertEquals(getIosResumeStep(p), 'api-key-instructions', 'resume falls through to the normal create-new routing')
})

// ─── 6) Staleness contract: a fresh override for a DIFFERENT appId re-asks ─────────

await test('a confirmed override scoped to a DIFFERENT config.appId is stale → driver re-routes into the gate (re-ask)', async () => {
  // The TUI's savedOverrideIsFresh (app.tsx:236) is:
  //   iosBundleIdOverride !== undefined && iosBundleIdContextAppId === currentAppId
  // When the user renamed the app between runs, the saved override's context
  // (an OLD appId) no longer equals the current appId, so the driver does NOT
  // trust it: it leaves appIdConfirmed false and (on re-detecting the mismatch)
  // re-records pendingAppIdNext. The engine then re-shows the gate.
  const p = iosProgress({
    // Override saved last run, but for a DIFFERENT (old) config.appId.
    iosBundleIdOverride: 'com.OLD.app.Build',
    iosBundleIdContextAppId: 'com.OLD.app', // ≠ current APP_ID
    // Driver-recorded: stale override is not trusted → not confirmed, mismatch re-pending.
    appIdConfirmed: false,
    pendingAppIdNext: 'import-pick-identity',
  })
  assert(p.iosBundleIdContextAppId !== p.appId, 'the saved override is scoped to a DIFFERENT appId (stale)')
  assertEquals(getIosResumeStep(p), 'confirm-app-id', 'a stale override (context appId mismatch) re-asks at the gate')
})

await test('a fresh override scoped to the CURRENT config.appId is trusted → NO re-ask', async () => {
  // Same shape but the override's context MATCHES the current appId → fresh →
  // appIdConfirmed true, pendingAppIdNext cleared → the gate stays skipped.
  const p = iosProgress({
    setupMethod: 'create-new',
    iosBundleIdOverride: 'com.example.app.Build',
    iosBundleIdContextAppId: APP_ID, // === current appId
    appIdConfirmed: true,
  })
  assert(p.iosBundleIdContextAppId === p.appId, 'the saved override is scoped to the CURRENT appId (fresh)')
  assert(getIosResumeStep(p) !== 'confirm-app-id', 'a fresh, confirmed override never re-asks')
})

await test('re-confirming after a context change re-scopes iosBundleIdContextAppId to the NEW appId', async () => {
  // Stale override for the old appId, mismatch re-pending. The user re-confirms
  // (here picks the new pbxproj value). The reducer re-snapshots the context to
  // the CURRENT appId, so the next run treats it as fresh.
  const stale = iosProgress({
    iosBundleIdOverride: 'com.OLD.app.Build',
    iosBundleIdContextAppId: 'com.OLD.app',
    appIdConfirmed: false,
    pendingAppIdNext: 'import-pick-identity',
  })
  const after = applyIosInput('confirm-app-id', stale, { step: 'confirm-app-id', value: 'com.example.app.Build' })
  assertEquals(after.iosBundleIdContextAppId, APP_ID, 're-confirm re-scopes the context to the current appId')
  assertEquals(after.iosBundleIdOverride, 'com.example.app.Build', 're-confirm overwrites the stale override')
  assertEquals(after.appIdConfirmed, true, 're-confirm sets appIdConfirmed')
})

// ─── Summary ─────────────────────────────────────────────────────────────────────

console.log(`\n${testsPassed} passed, ${testsFailed} failed`)
if (testsFailed > 0)
  process.exit(1)
