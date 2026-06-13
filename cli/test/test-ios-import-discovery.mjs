#!/usr/bin/env node
/**
 * iOS BATCH 5 — import discovery effects/choice spec.
 *
 * Drives `iosViewForStep` / `applyIosInput` / `runIosEffect` for the three
 * import-discovery steps with MOCKED IosEffectDeps (no fs, no `security`, no
 * network):
 *
 *   import-distribution-mode (choice ◆ persisted-driven):
 *     applyIosInput persists setupMethod='import-existing' + importDistribution;
 *     the driver routes the NEXT step via getImportEntryStep —
 *       'ad_hoc'    → import-pick-identity  (no .p8 chain)
 *       'app_store' → api-key-instructions  (fresh) | the furthest partial .p8
 *                     step | verifying-key  (.p8 chain already partial/complete)
 *       '__cancel__'→ import-distribution-mode (re-enter the setup fork; importDistribution
 *                     cleared, setupMethod='create-new')
 *
 *   import-scanning (effect ★):
 *     deps.listSigningIdentities + deps.scanProvisioningProfiles + the
 *     identity↔profile matcher → transient.importMatches + transient.importProfiles;
 *     next = getImportEntryStep(progress) (the un-redirected import entry — the
 *     driver layers redirectIfMismatch on top). Zero distribution identities OR a
 *     scan throw → error.
 *
 *   import-validating-all-certs (effect ★):
 *     batch deps.classifyCertAvailability over the scanned identities + parallel
 *     deps.listProfilesForCert prefetch → transient.identityAvailability +
 *     transient.profilePrefetch; next = import-pick-identity. A batch-availability
 *     failure → error; a single profile-prefetch failure is sandboxed (still
 *     import-pick-identity).
 *
 * Like test-ios-recovery.mjs, this file acts as the headless DRIVER: the scanned
 * inventory (importMatches/importProfiles) is EPHEMERAL, so the driver threads it
 * back into the next effect via deps.carried — NOTHING here is persisted beyond
 * the setupMethod/importDistribution the distribution-mode reducer writes. The
 * engine is IO-FREE: every Keychain/Apple touch is an injected dep.
 */
import process from 'node:process'

const {
  runIosEffect,
  iosViewForStep,
  applyIosInput,
} = await import('../src/build/onboarding/ios/flow.ts')

// getImportEntryStep is the SAME router the engine uses for import-scanning's
// next + the distribution-mode driver routing. Import it so the spec asserts the
// driver routes exactly as the engine resolves.
const { getImportEntryStep } = await import('../src/build/onboarding/progress.ts')

console.log('🧪 iOS BATCH 5 — import discovery (scanning / validating / distribution-mode)\n')

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

// ─── Fixtures ──────────────────────────────────────────────────────────────────

// Two distribution identities + one development identity (the dev one must be
// filtered out — the import flow can't release-sign with it).
const IDENTITY_DIST_A = {
  sha1: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  name: 'Apple Distribution: Acme Corp (TEAMAAAAAA)',
  type: 'distribution',
  teamName: 'Acme Corp',
  teamId: 'TEAMAAAAAA',
}
const IDENTITY_DIST_B = {
  sha1: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  name: 'Apple Distribution: Acme Corp (TEAMAAAAAA)',
  type: 'distribution',
  teamName: 'Acme Corp',
  teamId: 'TEAMAAAAAA',
}
const IDENTITY_DEV = {
  sha1: 'cccccccccccccccccccccccccccccccccccccccc',
  name: 'Apple Development: Acme Corp (TEAMAAAAAA)',
  type: 'development',
  teamName: 'Acme Corp',
  teamId: 'TEAMAAAAAA',
}

// On-disk profile whose embedded cert SHA-1 matches identity A (so the matcher
// pairs it with A only). Minimal DiscoveredProfile shape (MobileprovisionDetail
// + path); only the fields the matcher/effect read are meaningful.
const PROFILE_FOR_A = {
  path: '/Users/me/Library/MobileDevice/Provisioning Profiles/A.mobileprovision',
  uuid: 'profile-A-uuid',
  name: 'Acme App Store A',
  applicationIdentifier: 'TEAMAAAAAA.com.example.app',
  bundleId: 'com.example.app',
  teamId: 'TEAMAAAAAA',
  expirationDate: '2027-01-01T00:00:00.000Z',
  profileType: 'app_store',
  certificateSha1s: [IDENTITY_DIST_A.sha1],
}

const SCANNED_IDENTITIES = [IDENTITY_DIST_A, IDENTITY_DIST_B, IDENTITY_DEV]
const SCANNED_PROFILES = [PROFILE_FOR_A]

// Apple profiles returned by the prefetch for identity A's cert — the RAW
// AscProfileSummary shape listProfilesForCert actually returns (the engine
// synthesizes DiscoveredProfile from it; hostile-review 2026-06-12 — the old
// fixture was pre-synthesized and skipped that mapping).
const APPLE_PROFILES_FOR_A = [
  {
    id: 'apple-profile-A',
    name: 'Capgo com.example.app AppStore',
    profileType: 'IOS_APP_STORE',
    profileContent: 'YXBwbGUtcHJvZmlsZS1B',
    expirationDate: '2027-02-01T00:00:00.000Z',
    bundleIdentifier: 'com.example.app',
  },
]

/**
 * Build an iOS OnboardingProgress at a given point. `setupMethod` defaults to
 * 'import-existing' (the distribution-mode/scanning steps only ever run inside
 * the import sub-flow).
 */
function iosProgress(overrides = {}) {
  const { completedSteps: completedOverrides, ...rest } = overrides
  return {
    platform: 'ios',
    appId: APP_ID,
    startedAt: '2026-06-03T00:00:00.000Z',
    setupMethod: 'import-existing',
    ...rest,
    completedSteps: {
      ...completedOverrides,
    },
  }
}

/**
 * Mocked IosEffectDeps. listSigningIdentities / scanProvisioningProfiles /
 * classifyCertAvailability / listProfilesForCert record their calls so the spec
 * can assert which helper fired. `carried` is the driver-held transient — the
 * spec threads the ephemeral scan inventory (importMatches) through it.
 */
function makeDeps(overrides = {}) {
  const calls = []

  const deps = {
    appId: APP_ID,

    listSigningIdentities: async (...a) => {
      calls.push({ name: 'listSigningIdentities', args: a })
      return SCANNED_IDENTITIES
    },
    scanProvisioningProfiles: async (...a) => {
      calls.push({ name: 'scanProvisioningProfiles', args: a })
      return SCANNED_PROFILES
    },
    // The driver pre-binds the single ASC cert fetch + SHA-1 index behind this;
    // here it just maps identity → availability. A is available (with an Apple
    // cert id), B is unavailable (no Apple-side match).
    classifyCertAvailability: async (identity) => {
      calls.push({ name: 'classifyCertAvailability', args: [identity.sha1] })
      if (identity.sha1 === IDENTITY_DIST_A.sha1) {
        return {
          available: true,
          appleCertId: 'APPLE_CERT_A',
          appleCertName: 'Apple Distribution: Acme Corp',
          appleCertExpirationDate: '2027-01-01T00:00:00.000Z',
          appleCertSerialNumber: 'SERIAL_A',
        }
      }
      return { available: false, reason: 'not-visible', reasonText: 'Not found on Apple' }
    },
    listProfilesForCert: async (certificateId) => {
      calls.push({ name: 'listProfilesForCert', args: [certificateId] })
      return APPLE_PROFILES_FOR_A
    },

    saveProgress: async (appId, progress) => { calls.push({ name: 'saveProgress', args: [appId, progress] }) },
    loadProgress: async () => null,

    onStatus: () => {},
    onLog: () => {},

    ...overrides,
  }
  deps.__calls = calls
  return deps
}

// ════════════════════════════════════════════════════════════════════════════════
// import-distribution-mode (choice ◆)
// ════════════════════════════════════════════════════════════════════════════════

console.log('🧪 import-distribution-mode — persist setupMethod/importDistribution; route via getImportEntryStep\n')

// ─── VIEW ────────────────────────────────────────────────────────────────────────

await test("iosViewForStep('import-distribution-mode') is a choice with app_store | ad_hoc | __cancel__", async () => {
  const view = iosViewForStep('import-distribution-mode', iosProgress(), {})
  assertEquals(view.step, 'import-distribution-mode', 'view echoes the step')
  assertEquals(view.kind, 'choice', 'import-distribution-mode is a choice')
  assert(Array.isArray(view.options), 'must expose options')
  const values = view.options.map(o => o.value)
  assert(values.includes('app_store'), 'offers the App Store / TestFlight option')
  assert(values.includes('ad_hoc'), 'offers the Ad-hoc option')
  assert(values.includes('__cancel__'), 'offers the cancel/use-create-new escape')
})

// ─── REDUCER + ROUTING: ad_hoc ───────────────────────────────────────────────────

await test("ad_hoc → persists setupMethod='import-existing' + importDistribution='ad_hoc'; routes to import-pick-identity", async () => {
  const before = iosProgress({ setupMethod: undefined })
  const after = applyIosInput('import-distribution-mode', before, { step: 'import-distribution-mode', value: 'ad_hoc' })
  assertEquals(after.setupMethod, 'import-existing', "ad_hoc persists setupMethod='import-existing'")
  assertEquals(after.importDistribution, 'ad_hoc', "ad_hoc persists importDistribution='ad_hoc'")
  // Driver routing (same router the engine uses post-scan).
  assertEquals(getImportEntryStep(after), 'import-pick-identity', 'ad_hoc skips the .p8 chain and goes to identity selection')
})

// ─── REDUCER + ROUTING: app_store ────────────────────────────────────────────────

await test("app_store (fresh) → persists setupMethod/importDistribution; routes to api-key-instructions", async () => {
  const before = iosProgress({ setupMethod: undefined })
  const after = applyIosInput('import-distribution-mode', before, { step: 'import-distribution-mode', value: 'app_store' })
  assertEquals(after.setupMethod, 'import-existing', "app_store persists setupMethod='import-existing'")
  assertEquals(after.importDistribution, 'app_store', "app_store persists importDistribution='app_store'")
  // Fresh app_store has no .p8 chain yet → the ASC key entry point.
  assertEquals(getImportEntryStep(after), 'api-key-instructions', 'fresh app_store needs the ASC .p8 chain')
})

await test('app_store with a previously-verified .p8 chain → routes to verifying-key (skips re-asking the .p8)', async () => {
  // The .p8 chain is fully partial-complete from a previous attempt; the
  // distribution-mode pick must NOT re-ask the .p8 file — getImportEntryStep
  // routes straight to verifying-key (the brief Apple re-check).
  const before = iosProgress({
    setupMethod: undefined,
    p8Path: '/tmp/AuthKey_66FGQZB566.p8',
    keyId: '66FGQZB566',
    issuerId: '0cd4db4a-5598-45b8-9d32-75cdf127d005',
    completedSteps: {
      apiKeyVerified: { keyId: '66FGQZB566', issuerId: '0cd4db4a-5598-45b8-9d32-75cdf127d005' },
    },
  })
  const after = applyIosInput('import-distribution-mode', before, { step: 'import-distribution-mode', value: 'app_store' })
  assertEquals(after.importDistribution, 'app_store', 'app_store persisted')
  assertEquals(getImportEntryStep(after), 'verifying-key', 'a complete .p8 chain re-verifies rather than re-asking')
})

// ─── REDUCER + ROUTING: __cancel__ ───────────────────────────────────────────────

await test("__cancel__ → switches to create-new (setupMethod='create-new'), CLEARS importDistribution; getImportEntryStep falls back to the distribution fork", async () => {
  // A user who had previously picked ad_hoc now bails to the create-new path —
  // the stale ad_hoc must be cleared so it can't leak into create-new routing.
  const before = iosProgress({ importDistribution: 'ad_hoc' })
  const after = applyIosInput('import-distribution-mode', before, { step: 'import-distribution-mode', value: '__cancel__' })
  assertEquals(after.setupMethod, 'create-new', "cancel switches setupMethod to 'create-new'")
  assert(!('importDistribution' in after), 'cancel CLEARS the stale importDistribution (no leak into create-new)')
  // A cleared import context routes to the create-new ASC key entry point.
  assertEquals(getImportEntryStep(after), 'import-distribution-mode', 'getImportEntryStep with no importDistribution falls back to the fork')
})

await test('import-distribution-mode reducer is immutable (does not mutate the input progress)', async () => {
  const before = iosProgress({ setupMethod: undefined })
  const snapshot = JSON.stringify(before)
  applyIosInput('import-distribution-mode', before, { step: 'import-distribution-mode', value: 'ad_hoc' })
  assertEquals(JSON.stringify(before), snapshot, 'the original progress object is untouched')
})

// ════════════════════════════════════════════════════════════════════════════════
// import-scanning (effect ★)
// ════════════════════════════════════════════════════════════════════════════════

console.log('\n🧪 import-scanning — scan + match → transient importMatches/importProfiles; next via getImportEntryStep\n')

await test('import-scanning (ad_hoc) → transient importMatches/importProfiles; next import-pick-identity', async () => {
  const progress = iosProgress({ importDistribution: 'ad_hoc' })
  const deps = makeDeps()
  const res = await runIosEffect('import-scanning', progress, deps)

  // Both scans fired (in parallel).
  assert(deps.__calls.some(c => c.name === 'listSigningIdentities'), 'calls listSigningIdentities')
  assert(deps.__calls.some(c => c.name === 'scanProvisioningProfiles'), 'calls scanProvisioningProfiles')

  // Transient inventory — distribution-only identities, paired with on-disk profiles.
  assert(res.transient, 'returns transient inventory')
  assert(Array.isArray(res.transient.importMatches), 'transient.importMatches is an array')
  assertEquals(res.transient.importMatches.length, 2, 'only the 2 DISTRIBUTION identities are kept (dev filtered out)')
  const matchA = res.transient.importMatches.find(m => m.identity.sha1 === IDENTITY_DIST_A.sha1)
  assert(matchA, 'identity A is in the matches')
  assertEquals(matchA.profiles.length, 1, 'identity A paired with its on-disk profile')
  assertEquals(matchA.profiles[0].uuid, 'profile-A-uuid', 'the matched profile is the one whose cert SHA-1 includes A')
  const matchB = res.transient.importMatches.find(m => m.identity.sha1 === IDENTITY_DIST_B.sha1)
  assert(matchB && matchB.profiles.length === 0, 'identity B has no on-disk profile match')
  assertEquals(res.transient.importProfiles.length, 1, 'transient.importProfiles carries the raw scanned profiles')

  // Routing — ad_hoc → import-pick-identity (getImportEntryStep).
  assertEquals(res.next, 'import-pick-identity', 'ad_hoc scan routes straight to identity selection')
  assertEquals(res.next, getImportEntryStep(progress), 'next == getImportEntryStep(progress)')

  // Persists NOTHING — the inventory is ephemeral.
  assert(!deps.__calls.some(c => c.name === 'saveProgress'), 'import-scanning persists nothing')
})

await test('import-scanning (app_store, fresh) → next api-key-instructions (the .p8 entry point)', async () => {
  const progress = iosProgress({ importDistribution: 'app_store' })
  const res = await runIosEffect('import-scanning', progress, makeDeps())
  assertEquals(res.next, 'api-key-instructions', 'fresh app_store scan routes to the ASC key chain')
  assertEquals(res.next, getImportEntryStep(progress), 'next == getImportEntryStep(progress)')
  assert(res.transient.importMatches.length === 2, 'inventory still populated regardless of distribution')
})

await test('import-scanning (app_store with full verified .p8) → next verifying-key', async () => {
  const progress = iosProgress({
    importDistribution: 'app_store',
    p8Path: '/tmp/AuthKey_XXX.p8',
    keyId: 'XXX',
    issuerId: 'issuer-uuid',
    completedSteps: { apiKeyVerified: { keyId: 'XXX', issuerId: 'issuer-uuid' } },
  })
  const res = await runIosEffect('import-scanning', progress, makeDeps())
  assertEquals(res.next, 'verifying-key', 'a complete .p8 chain re-verifies after the scan')
  assertEquals(res.next, getImportEntryStep(progress), 'next == getImportEntryStep(progress)')
})

await test('import-scanning with ZERO distribution identities → error', async () => {
  // Only a development identity on this Mac — the import flow cannot proceed.
  const deps = makeDeps({ listSigningIdentities: async () => [IDENTITY_DEV] })
  const res = await runIosEffect('import-scanning', iosProgress({ importDistribution: 'ad_hoc' }), deps)
  assertEquals(res.next, 'error', 'no distribution identities routes to error')
})

await test('import-scanning with EMPTY scan results → error', async () => {
  const deps = makeDeps({ listSigningIdentities: async () => [], scanProvisioningProfiles: async () => [] })
  const res = await runIosEffect('import-scanning', iosProgress({ importDistribution: 'ad_hoc' }), deps)
  assertEquals(res.next, 'error', 'an empty Keychain routes to error')
})

await test('import-scanning when a scan throws → error (no transient leak)', async () => {
  const deps = makeDeps({ scanProvisioningProfiles: async () => { throw new Error('profile dir unreadable') } })
  const res = await runIosEffect('import-scanning', iosProgress({ importDistribution: 'ad_hoc' }), deps)
  assertEquals(res.next, 'error', 'a scan failure routes to error')
})

// ════════════════════════════════════════════════════════════════════════════════
// import-validating-all-certs (effect ★)
// ════════════════════════════════════════════════════════════════════════════════

console.log('\n🧪 import-validating-all-certs — batch availability + parallel prefetch → transient; next import-pick-identity\n')

await test('import-validating-all-certs → transient identityAvailability/profilePrefetch; next import-pick-identity', async () => {
  // Driver threads the scanned matches (from import-scanning's transient) into carried.
  const importMatches = [
    { identity: IDENTITY_DIST_A, profiles: [PROFILE_FOR_A] },
    { identity: IDENTITY_DIST_B, profiles: [] },
  ]
  const deps = makeDeps({ carried: { importMatches } })
  const res = await runIosEffect('import-validating-all-certs', iosProgress({ importDistribution: 'app_store' }), deps)

  // Routing.
  assertEquals(res.next, 'import-pick-identity', 'validation completes → the identity picker')

  // Batch availability — one classify per scanned identity.
  const classifyCalls = deps.__calls.filter(c => c.name === 'classifyCertAvailability')
  assertEquals(classifyCalls.length, 2, 'classifyCertAvailability runs once per scanned identity')

  // Transient availability map.
  assert(res.transient, 'returns transient')
  assert(res.transient.identityAvailability, 'transient.identityAvailability present')
  assertEquals(res.transient.identityAvailability[IDENTITY_DIST_A.sha1].available, true, 'identity A is available')
  assertEquals(res.transient.identityAvailability[IDENTITY_DIST_A.sha1].appleCertId, 'APPLE_CERT_A', 'A carries its Apple cert id')
  assertEquals(res.transient.identityAvailability[IDENTITY_DIST_B.sha1].available, false, 'identity B is unavailable')

  // Parallel prefetch — only the AVAILABLE identity (A, with an appleCertId) is prefetched.
  const prefetchCalls = deps.__calls.filter(c => c.name === 'listProfilesForCert')
  assertEquals(prefetchCalls.length, 1, 'only the available identity is prefetched')
  assertEquals(prefetchCalls[0].args[0], 'APPLE_CERT_A', 'prefetch uses the resolved Apple cert id')
  assert(res.transient.profilePrefetch, 'transient.profilePrefetch present')
  assertEquals(res.transient.profilePrefetch[IDENTITY_DIST_A.sha1].length, 1, 'A has its Apple profiles prefetched')
  // The prefetch returns RAW AscProfileSummary[] and the engine SYNTHESIZES each
  // into a DiscoveredProfile (synthesizeProfileFromAscSummary) — pin the mapping
  // (hostile-review 2026-06-12: the old fixture was pre-synthesized, so the
  // id→uuid / bundleIdentifier→bundleId / IOS_APP_STORE→app_store /
  // profileContent→profileBase64 mapping was never exercised).
  const synthesized = res.transient.profilePrefetch[IDENTITY_DIST_A.sha1][0]
  assertEquals(synthesized.uuid, 'apple-profile-A', 'uuid comes from the ASC summary id')
  assertEquals(synthesized.bundleId, 'com.example.app', 'bundleId comes from the ASC bundleIdentifier')
  assertEquals(synthesized.profileType, 'app_store', 'IOS_APP_STORE maps to app_store')
  assertEquals(synthesized.teamId, IDENTITY_DIST_A.teamId, 'teamId comes from the picked identity')
  assertEquals(synthesized.certificateSha1s[0], IDENTITY_DIST_A.sha1, 'certificateSha1s comes from the picked identity')
  assertEquals(synthesized.profileBase64, 'YXBwbGUtcHJvZmlsZS1B', 'profileBase64 carries the ASC profileContent')
  assert(!(IDENTITY_DIST_B.sha1 in res.transient.profilePrefetch), 'unavailable B is NOT prefetched')

  // Ephemeral — persists nothing.
  assert(!deps.__calls.some(c => c.name === 'saveProgress'), 'validation persists nothing')
})

await test('import-validating-all-certs with NO available identities → next import-pick-identity; no prefetch', async () => {
  const importMatches = [{ identity: IDENTITY_DIST_B, profiles: [] }]
  const deps = makeDeps({
    carried: { importMatches },
    classifyCertAvailability: async () => ({ available: false, reason: 'not-visible', reasonText: 'gone' }),
  })
  const res = await runIosEffect('import-validating-all-certs', iosProgress(), deps)
  assertEquals(res.next, 'import-pick-identity', 'still advances to the picker (the unavailable table renders)')
  assert(!deps.__calls.some(c => c.name === 'listProfilesForCert'), 'no available identity → no prefetch fired')
  assertEquals(Object.keys(res.transient.profilePrefetch).length, 0, 'empty prefetch map')
})

await test('import-validating-all-certs: a single prefetch failure is sandboxed (still import-pick-identity)', async () => {
  const importMatches = [{ identity: IDENTITY_DIST_A, profiles: [PROFILE_FOR_A] }]
  const deps = makeDeps({
    carried: { importMatches },
    listProfilesForCert: async () => { throw new Error('apple 503') },
  })
  const res = await runIosEffect('import-validating-all-certs', iosProgress(), deps)
  assertEquals(res.next, 'import-pick-identity', 'a prefetch failure does NOT fail the whole effect')
  // A is still classified available; it just has no prefetched profiles.
  assertEquals(res.transient.identityAvailability[IDENTITY_DIST_A.sha1].available, true, 'availability still resolved')
  assert(!(IDENTITY_DIST_A.sha1 in res.transient.profilePrefetch), 'the failed prefetch leaves A out of the map')
})

await test('import-validating-all-certs: batch availability failure → error', async () => {
  const importMatches = [{ identity: IDENTITY_DIST_A, profiles: [PROFILE_FOR_A] }]
  const deps = makeDeps({
    carried: { importMatches },
    classifyCertAvailability: async () => { throw new Error('cert list fetch failed') },
  })
  const res = await runIosEffect('import-validating-all-certs', iosProgress(), deps)
  assertEquals(res.next, 'error', 'a batch availability failure routes to error')
})

await test('import-validating-all-certs with no carried matches → next import-pick-identity; empty maps', async () => {
  // Crash-recovery shape: carried lost. The effect degrades to empty maps and
  // still advances (the picker re-renders from a fresh scan upstream).
  const deps = makeDeps({ carried: {} })
  const res = await runIosEffect('import-validating-all-certs', iosProgress(), deps)
  assertEquals(res.next, 'import-pick-identity', 'no matches still advances to the picker')
  assertEquals(Object.keys(res.transient.identityAvailability).length, 0, 'empty availability map')
  assertEquals(Object.keys(res.transient.profilePrefetch).length, 0, 'empty prefetch map')
})

// ════════════════════════════════════════════════════════════════════════════════
// DRIVER: full scan → validate handoff (transient threaded as carried)
// ════════════════════════════════════════════════════════════════════════════════

console.log('\n🧪 DRIVER: import-scanning → import-validating-all-certs (transient threaded as carried)\n')

await test('DRIVER: scan inventory threads into the validation effect via carried', async () => {
  const progress = iosProgress({ importDistribution: 'app_store' })

  // 1) Scan.
  const scanDeps = makeDeps()
  const scan = await runIosEffect('import-scanning', progress, scanDeps)
  assert(scan.transient.importMatches.length === 2, 'scan produced the inventory')

  // 2) Driver threads the scanned matches into the next effect's carried.
  const validateDeps = makeDeps({ carried: { importMatches: scan.transient.importMatches } })
  const validate = await runIosEffect('import-validating-all-certs', progress, validateDeps)
  assertEquals(validate.next, 'import-pick-identity', 'validation advances to the picker')
  assertEquals(
    validateDeps.__calls.filter(c => c.name === 'classifyCertAvailability').length,
    2,
    'validation classified both scanned identities carried over from the scan',
  )
})

// ─── Summary ─────────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(60)}`)
console.log(`Passed: ${testsPassed}  Failed: ${testsFailed}`)
if (testsFailed > 0)
  process.exit(1)
