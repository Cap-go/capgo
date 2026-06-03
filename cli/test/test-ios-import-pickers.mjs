#!/usr/bin/env node
/**
 * iOS BATCH 6 — import picker spec (identity / profile) + apple-cert check.
 *
 * Drives `iosViewForStep` / `applyIosInput` / `runIosEffect` for the three
 * ephemeral-branching import-picker steps with MOCKED IosEffectDeps (no fs, no
 * network, no child processes):
 *
 *   import-pick-identity (choice + resolver, EPHEMERAL chosenIdentity):
 *     '__cancel__' (no carried.chosenIdentity)        → api-key-instructions
 *     usable on-disk profiles                          → import-pick-profile
 *     no on-disk + apiKeyAvailable                     → import-checking-apple-cert
 *     no on-disk + !apiKey (noMatchReason set)         → import-no-match-recovery
 *
 *   import-checking-apple-cert (effect, EPHEMERAL chosenIdentity):
 *     findCertIdBySha1 null                            → recovery 'apple-no-cert-match'
 *     listProfilesForCert empty                        → recovery 'apple-no-profiles-linked'
 *     profiles for OTHER bundle id                     → recovery 'apple-bundle-mismatch'
 *     right bundle, wrong distribution                 → recovery 'apple-distribution-mismatch'
 *     profiles but none usable (other)                 → recovery 'apple-other'
 *     usable profiles (cert found)                     → import-pick-profile (+inject)
 *     Apple API throws                                 → error
 *
 *   import-pick-profile (choice + resolver, EPHEMERAL chosenProfile):
 *     '__back__' (no carried.chosenProfile)            → import-pick-identity
 *     valid profile                                    → import-export-warning
 *     invalid profile                                  → error
 *
 * Like test-ios-recovery.mjs, this file is the headless DRIVER: the two picker
 * choice steps are EPHEMERAL-branching, so the driver applies the user's pick
 * into deps.carried (chosenIdentity / chosenProfile) and re-drives the step
 * through runIosEffect as a resolver — the SAME mechanism the Ink TUI uses to
 * mirror its React state (setChosenIdentity / setChosenProfile). The engine is
 * IO-FREE: every Apple-API touch is an injected dep, and NOTHING ephemeral
 * (chosenIdentity / chosenProfile / _appleCertIdForChosen / noMatchReason / the
 * synthesized profiles) is ever persisted to progress.json.
 */
import process from 'node:process'

const {
  runIosEffect,
  iosViewForStep,
  applyIosInput,
} = await import('../src/build/onboarding/ios/flow.ts')

console.log('🧪 iOS BATCH 6 — import pickers (identity/profile) + apple-cert check\n')

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

// Two distribution signing identities (macos-signing SigningIdentity shape).
const IDENTITY_A = { sha1: 'a'.repeat(40), name: 'Apple Distribution: Acme (TEAMAAA)', type: 'distribution', teamName: 'Acme', teamId: 'TEAMAAA' }
const IDENTITY_B = { sha1: 'b'.repeat(40), name: 'Apple Distribution: Beta (TEAMBBB)', type: 'distribution', teamName: 'Beta', teamId: 'TEAMBBB' }

/** Build a DiscoveredProfile fixture (extends MobileprovisionDetail + path). */
function profile(overrides = {}) {
  return {
    path: `/Users/me/Library/MobileDevice/Provisioning Profiles/${overrides.uuid ?? 'P'}.mobileprovision`,
    uuid: 'PROFILE-UUID',
    name: 'Capgo App Store',
    applicationIdentifier: `TEAMAAA.${APP_ID}`,
    bundleId: APP_ID,
    teamId: 'TEAMAAA',
    expirationDate: '2027-01-01T00:00:00.000Z',
    profileType: 'app_store',
    certificateSha1s: [IDENTITY_A.sha1],
    ...overrides,
  }
}

// An on-disk profile that matches IDENTITY_A + this app + app_store.
const ONDISK_MATCH = profile({ uuid: 'ONDISK-MATCH', name: 'On-disk App Store', certificateSha1s: [IDENTITY_A.sha1] })

// import-scanning inventory: A has a matching on-disk profile, B has none.
const MATCHES_A_HAS_PROFILE = [
  { identity: IDENTITY_A, profiles: [ONDISK_MATCH] },
  { identity: IDENTITY_B, profiles: [] },
]

// import-scanning inventory: neither identity has an on-disk profile.
const MATCHES_NO_PROFILES = [
  { identity: IDENTITY_A, profiles: [] },
  { identity: IDENTITY_B, profiles: [] },
]

// Apple-side profiles `listProfilesForCert` returns — the RAW AscProfileSummary
// shape (apple-api.ts:326) the real helper produces: id / name / profileType
// (Apple's IOS_APP_STORE / IOS_APP_ADHOC enum) / profileContent (base64
// .mobileprovision) / expirationDate / bundleIdentifier. The ENGINE synthesizes
// each into a DiscoveredProfile (NOT the driver) — so the mock must NOT pre-bake
// a DiscoveredProfile; it returns the Apple shape and we assert the synthesis.
function ascSummary(overrides = {}) {
  return {
    id: 'APPLE-PROFILE-ID',
    name: 'Apple App Store',
    profileType: 'IOS_APP_STORE',
    profileContent: 'QVBQTEUtUFJPRklMRS1CQVNFNjQ=', // base64 marker, rides → profileBase64
    expirationDate: '2027-01-01T00:00:00.000Z',
    bundleIdentifier: APP_ID,
    ...overrides,
  }
}

// Usable: bundle + IOS_APP_STORE match for IDENTITY_A. id → synthesized uuid.
const APPLE_SUMMARY_USABLE = ascSummary({ id: 'APPLE-USABLE', name: 'Apple App Store' })
// Apple-side profile for a DIFFERENT bundle id (bundle mismatch).
const APPLE_SUMMARY_WRONG_BUNDLE = ascSummary({ id: 'APPLE-WRONGB', name: 'Apple Other App', bundleIdentifier: 'com.other.app' })
// Apple-side profile for THIS bundle but IOS_APP_ADHOC (distribution mismatch when app_store).
const APPLE_SUMMARY_WRONG_DIST = ascSummary({ id: 'APPLE-WRONGD', name: 'Apple Ad-hoc', profileType: 'IOS_APP_ADHOC' })

// Already-synthesized DiscoveredProfile fixtures (path='' like Apple-fetched ones)
// used where a profile is consumed DIRECTLY — set as carried.chosenProfile or
// already present in importMatches — i.e. NOT passed through listProfilesForCert
// (so NOT re-synthesized by the engine). The picker-filter + resolver tests below
// need the DiscoveredProfile shape, not the raw Apple summary.
const APPLE_PROFILE_WRONG_BUNDLE = profile({ uuid: 'APPLE-WRONGB', name: 'Apple Other App', path: '', bundleId: 'com.other.app', certificateSha1s: [IDENTITY_A.sha1] })
const APPLE_PROFILE_WRONG_DIST = profile({ uuid: 'APPLE-WRONGD', name: 'Apple Ad-hoc', path: '', profileType: 'ad_hoc', certificateSha1s: [IDENTITY_A.sha1] })

/**
 * Build an iOS OnboardingProgress for the import-existing path. `importDistribution`
 * defaults to 'app_store'; tests override it (or the completedSteps / appId) per case.
 */
function iosProgress(overrides = {}) {
  const { completedSteps: completedOverrides, ...rest } = overrides
  return {
    platform: 'ios',
    appId: APP_ID,
    startedAt: '2026-06-03T00:00:00.000Z',
    setupMethod: 'import-existing',
    importDistribution: 'app_store',
    ...rest,
    completedSteps: {
      ...completedOverrides,
    },
  }
}

/**
 * Mocked IosEffectDeps. findCertIdBySha1 / listProfilesForCert record their calls
 * so the spec can assert which Apple-API helper fired. `carried` is the
 * driver-held transient — the spec threads the ephemeral chosenIdentity /
 * chosenProfile / importMatches / p8Content through it.
 */
function makeDeps(overrides = {}) {
  const calls = []

  const deps = {
    appId: APP_ID,

    findCertIdBySha1: async (...a) => { calls.push({ name: 'findCertIdBySha1', args: a }); return 'APPLECERT1' },
    listProfilesForCert: async (...a) => { calls.push({ name: 'listProfilesForCert', args: a }); return [APPLE_SUMMARY_USABLE] },

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
// import-pick-identity — VIEW
// ════════════════════════════════════════════════════════════════════════════════

console.log('🧪 import-pick-identity (choice view + resolver)\n')

await test("iosViewForStep('import-pick-identity') lists identities + a '__cancel__' escape", async () => {
  const view = iosViewForStep('import-pick-identity', iosProgress(), { importMatches: MATCHES_A_HAS_PROFILE })
  assertEquals(view.step, 'import-pick-identity', 'view echoes the step')
  assertEquals(view.kind, 'choice', 'import-pick-identity is a choice')
  assert(Array.isArray(view.options), 'must expose options')
  const values = view.options.map(o => o.value)
  // No identityAvailability classification → every identity is offered (TUI's
  // !haveClassification flat-list fallback) + the trailing cancel.
  assert(values.includes(IDENTITY_A.sha1), 'offers identity A by SHA-1')
  assert(values.includes(IDENTITY_B.sha1), 'offers identity B by SHA-1')
  assert(values.includes('__cancel__'), 'offers a cancel-to-create-new escape')
  assertEquals(view.options.length, 3, 'two identities + the cancel option')
})

await test("iosViewForStep('import-pick-identity') labels matching-profile count per identity", async () => {
  const view = iosViewForStep('import-pick-identity', iosProgress(), { importMatches: MATCHES_A_HAS_PROFILE })
  const optA = view.options.find(o => o.value === IDENTITY_A.sha1)
  const optB = view.options.find(o => o.value === IDENTITY_B.sha1)
  assert(optA.label.includes('1 matching profile'), 'A shows its 1 on-disk matching profile')
  assert(optB.label.includes('no matching profiles'), 'B shows it has no matching profiles (recovery available)')
})

await test("iosViewForStep('import-pick-identity') with classification offers ONLY available identities", async () => {
  // identityAvailability classifies A available, B unavailable → only A is pickable.
  const identityAvailability = {
    [IDENTITY_A.sha1]: { available: true, appleCertId: 'APPLECERT1' },
    [IDENTITY_B.sha1]: { available: false, reason: 'expired', reasonText: 'Certificate expired' },
  }
  const view = iosViewForStep('import-pick-identity', iosProgress(), { importMatches: MATCHES_A_HAS_PROFILE, identityAvailability })
  const values = view.options.map(o => o.value)
  assert(values.includes(IDENTITY_A.sha1), 'available identity A is pickable')
  assert(!values.includes(IDENTITY_B.sha1), 'unavailable identity B is NOT offered')
  assert(values.includes('__cancel__'), 'cancel option still present')
})

// ─── import-pick-identity REDUCER (ephemeral — persists nothing) ─────────────────

await test('import-pick-identity reducer persists NOTHING (the pick is ephemeral)', async () => {
  const before = iosProgress()
  const afterPick = applyIosInput('import-pick-identity', before, { step: 'import-pick-identity', value: IDENTITY_A.sha1 })
  assertEquals(JSON.stringify(afterPick), JSON.stringify(before), 'the picked identity is never written to progress')
  const afterCancel = applyIosInput('import-pick-identity', before, { step: 'import-pick-identity', value: '__cancel__' })
  assertEquals(JSON.stringify(afterCancel), JSON.stringify(before), 'cancel persists nothing either')
})

// ─── import-pick-identity RESOLVER (four-way branch) ─────────────────────────────

await test("import-pick-identity resolver: '__cancel__' (no carried.chosenIdentity) → api-key-instructions", async () => {
  const deps = makeDeps({ carried: {} })
  const res = await runIosEffect('import-pick-identity', iosProgress(), deps)
  assertEquals(res.next, 'api-key-instructions', 'cancel switches to the create-new .p8 chain')
  assert(!deps.__calls.some(c => c.name === 'saveProgress'), 'cancel routing persists nothing in the resolver')
})

await test('import-pick-identity resolver: usable on-disk profiles → import-pick-profile', async () => {
  const deps = makeDeps({ carried: { chosenIdentity: IDENTITY_A, importMatches: MATCHES_A_HAS_PROFILE } })
  const res = await runIosEffect('import-pick-identity', iosProgress(), deps)
  assertEquals(res.next, 'import-pick-profile', 'an identity with a usable on-disk profile goes straight to the profile picker')
})

await test('import-pick-identity resolver: no on-disk + carried .p8 bytes → import-checking-apple-cert', async () => {
  const deps = makeDeps({ carried: { chosenIdentity: IDENTITY_B, importMatches: MATCHES_NO_PROFILES, p8Content: Buffer.from('P8') } })
  const res = await runIosEffect('import-pick-identity', iosProgress(), deps)
  assertEquals(res.next, 'import-checking-apple-cert', 'no on-disk match + an ASC key (carried .p8) → auto-fetch from Apple')
})

await test('import-pick-identity resolver: no on-disk + persisted apiKeyVerified → import-checking-apple-cert', async () => {
  const deps = makeDeps({ carried: { chosenIdentity: IDENTITY_B, importMatches: MATCHES_NO_PROFILES } })
  const progress = iosProgress({ completedSteps: { apiKeyVerified: { keyId: 'K', issuerId: 'I' } } })
  const res = await runIosEffect('import-pick-identity', progress, deps)
  assertEquals(res.next, 'import-checking-apple-cert', 'no on-disk match + a persisted apiKeyVerified marker → auto-fetch from Apple')
})

await test("import-pick-identity resolver: no on-disk + no ASC key → import-no-match-recovery (noMatchReason='no-profile-on-disk')", async () => {
  const deps = makeDeps({ carried: { chosenIdentity: IDENTITY_B, importMatches: MATCHES_NO_PROFILES } })
  const res = await runIosEffect('import-pick-identity', iosProgress(), deps)
  assertEquals(res.next, 'import-no-match-recovery', 'no on-disk match + no ASC key → the recovery menu')
  assertEquals(res.transient?.noMatchReason, 'no-profile-on-disk', 'the recovery reason is set transiently')
  assert(!deps.__calls.some(c => c.name === 'saveProgress'), 'no-match routing persists nothing')
})

// ════════════════════════════════════════════════════════════════════════════════
// import-checking-apple-cert — EFFECT
// ════════════════════════════════════════════════════════════════════════════════

console.log('\n🧪 import-checking-apple-cert (effect)\n')

await test('import-checking-apple-cert: cert found + usable profiles → import-pick-profile (injects synthesized + _appleCertIdForChosen)', async () => {
  // Default listProfilesForCert (the recording dep) already returns [APPLE_PROFILE_USABLE].
  const deps = makeDeps({
    carried: { chosenIdentity: IDENTITY_A, importMatches: MATCHES_NO_PROFILES },
  })
  const res = await runIosEffect('import-checking-apple-cert', iosProgress(), deps)
  assertEquals(res.next, 'import-pick-profile', 'a recognized cert with usable Apple profiles opens the profile picker')
  assertEquals(res.transient?._appleCertIdForChosen, 'APPLECERT1', 'the resolved Apple cert id rides transient')
  // The ENGINE synthesized the RAW AscProfileSummary into a DiscoveredProfile and
  // injected it into the chosen identity's match so the picker lists it like an
  // on-disk one. Assert the synthesis populated the TUI-critical fields the old
  // (divergent) code dropped: uuid ← summary.id, profileBase64 ← profileContent,
  // certificateSha1s ← [chosenIdentity.sha1] (+ the mapped bundleId/profileType/teamId).
  const injectedMatch = res.transient?.importMatches?.find(m => m.identity.sha1 === IDENTITY_A.sha1)
  assert(injectedMatch, 'the chosen identity match is present in the injected importMatches')
  const syn = injectedMatch.profiles.find(p => p.uuid === 'APPLE-USABLE')
  assert(syn, 'the synthesized Apple profile (uuid ← summary.id) is injected into the match')
  assertEquals(syn.profileBase64, APPLE_SUMMARY_USABLE.profileContent, 'profileBase64 is synthesized from the summary profileContent (NOT dropped)')
  assertEquals(JSON.stringify(syn.certificateSha1s), JSON.stringify([IDENTITY_A.sha1]), 'certificateSha1s is [chosenIdentity.sha1] so the cert-trust validation accepts it')
  assertEquals(syn.bundleId, APP_ID, 'bundleId ← summary.bundleIdentifier')
  assertEquals(syn.profileType, 'app_store', "profileType IOS_APP_STORE → 'app_store'")
  assertEquals(syn.teamId, IDENTITY_A.teamId, 'teamId ← chosenIdentity.teamId')
  assertEquals(syn.path, '', "synthesized Apple profiles have path='' (no on-disk file)")
  assert(deps.__calls.some(c => c.name === 'findCertIdBySha1'), 'resolves the Apple cert id from the identity SHA-1')
  assert(deps.__calls.some(c => c.name === 'listProfilesForCert'), 'lists the Apple profiles for the cert')
  assert(!deps.__calls.some(c => c.name === 'saveProgress'), 'the apple-cert check persists nothing (all transient)')
})

await test("import-checking-apple-cert: findCertIdBySha1 null → import-no-match-recovery 'apple-no-cert-match'", async () => {
  const deps = makeDeps({
    carried: { chosenIdentity: IDENTITY_A, importMatches: MATCHES_NO_PROFILES },
    findCertIdBySha1: async () => null,
  })
  const res = await runIosEffect('import-checking-apple-cert', iosProgress(), deps)
  assertEquals(res.next, 'import-no-match-recovery', 'no Apple cert match → recovery')
  assertEquals(res.transient?.noMatchReason, 'apple-no-cert-match', 'the no-cert-match reason is set')
  assert(!deps.__calls.some(c => c.name === 'listProfilesForCert'), 'a null cert id short-circuits before listing profiles')
})

await test("import-checking-apple-cert: listProfilesForCert empty → import-no-match-recovery 'apple-no-profiles-linked'", async () => {
  const deps = makeDeps({
    carried: { chosenIdentity: IDENTITY_A, importMatches: MATCHES_NO_PROFILES },
    listProfilesForCert: async () => [],
  })
  const res = await runIosEffect('import-checking-apple-cert', iosProgress(), deps)
  assertEquals(res.next, 'import-no-match-recovery', 'a cert with no linked profiles → recovery')
  assertEquals(res.transient?.noMatchReason, 'apple-no-profiles-linked', 'the no-profiles-linked reason is set')
  assertEquals(res.transient?._appleCertIdForChosen, 'APPLECERT1', 'the resolved cert id still rides transient')
})

await test("import-checking-apple-cert: profiles for ANOTHER bundle id → import-no-match-recovery 'apple-bundle-mismatch'", async () => {
  const deps = makeDeps({
    carried: { chosenIdentity: IDENTITY_A, importMatches: MATCHES_NO_PROFILES },
    listProfilesForCert: async () => [APPLE_SUMMARY_WRONG_BUNDLE],
  })
  const res = await runIosEffect('import-checking-apple-cert', iosProgress(), deps)
  assertEquals(res.next, 'import-no-match-recovery', 'profiles for a different bundle id → recovery')
  assertEquals(res.transient?.noMatchReason, 'apple-bundle-mismatch', 'the bundle-mismatch reason is set')
})

await test("import-checking-apple-cert: right bundle, wrong distribution → import-no-match-recovery 'apple-distribution-mismatch'", async () => {
  const deps = makeDeps({
    carried: { chosenIdentity: IDENTITY_A, importMatches: MATCHES_NO_PROFILES },
    listProfilesForCert: async () => [APPLE_SUMMARY_WRONG_DIST],
  })
  // progress.importDistribution is 'app_store'; the Apple profile is ad_hoc for THIS bundle.
  const res = await runIosEffect('import-checking-apple-cert', iosProgress(), deps)
  assertEquals(res.next, 'import-no-match-recovery', 'right bundle but wrong distribution → recovery')
  assertEquals(res.transient?.noMatchReason, 'apple-distribution-mismatch', 'the distribution-mismatch reason is set')
})

await test("import-checking-apple-cert: profiles exist but none classifiable → import-no-match-recovery 'apple-other'", async () => {
  // A raw Apple summary with an empty bundleIdentifier: after synthesis its
  // bundleId is '' → not 'other bundle' (filtered out by `p.bundleId &&`) and not
  // same-bundle → falls through to the generic 'apple-other' reason.
  const emptyBundleSummary = ascSummary({ id: 'APPLE-EMPTY', name: 'Apple Empty', bundleIdentifier: '' })
  const deps = makeDeps({
    carried: { chosenIdentity: IDENTITY_A, importMatches: MATCHES_NO_PROFILES },
    listProfilesForCert: async () => [emptyBundleSummary],
  })
  const res = await runIosEffect('import-checking-apple-cert', iosProgress(), deps)
  assertEquals(res.next, 'import-no-match-recovery', 'unclassifiable profiles → recovery')
  assertEquals(res.transient?.noMatchReason, 'apple-other', "the generic 'apple-other' reason is set")
})

await test('import-checking-apple-cert: no carried.chosenIdentity → error', async () => {
  const deps = makeDeps({ carried: {} })
  const res = await runIosEffect('import-checking-apple-cert', iosProgress(), deps)
  assertEquals(res.next, 'error', 'an apple-cert check without a chosen identity routes to error')
})

await test('import-checking-apple-cert: Apple API throws → error', async () => {
  const deps = makeDeps({
    carried: { chosenIdentity: IDENTITY_A, importMatches: MATCHES_NO_PROFILES },
    findCertIdBySha1: async () => { throw new Error('Apple 503') },
  })
  const res = await runIosEffect('import-checking-apple-cert', iosProgress(), deps)
  assertEquals(res.next, 'error', 'a thrown Apple-API error routes to error')
})

// ════════════════════════════════════════════════════════════════════════════════
// import-pick-profile — VIEW + RESOLVER
// ════════════════════════════════════════════════════════════════════════════════

console.log('\n🧪 import-pick-profile (choice view + resolver)\n')

await test("iosViewForStep('import-pick-profile') lists the chosen identity's usable profiles + a '__back__' escape", async () => {
  const view = iosViewForStep('import-pick-profile', iosProgress(), {
    chosenIdentity: IDENTITY_A,
    importMatches: MATCHES_A_HAS_PROFILE,
  })
  assertEquals(view.kind, 'choice', 'import-pick-profile is a choice')
  const values = view.options.map(o => o.value)
  assert(values.includes(ONDISK_MATCH.uuid), 'offers the usable on-disk profile by UUID')
  assert(values.includes('__back__'), 'offers a back-to-identity escape')
  assertEquals(view.options.length, 2, 'one usable profile + the back option')
})

await test("iosViewForStep('import-pick-profile') filters out profiles that don't match this app/distribution", async () => {
  // IDENTITY_A's match also carries an ad_hoc + a wrong-bundle profile; only the
  // app_store one for THIS bundle should be listed.
  const matches = [
    { identity: IDENTITY_A, profiles: [ONDISK_MATCH, APPLE_PROFILE_WRONG_DIST, APPLE_PROFILE_WRONG_BUNDLE] },
  ]
  const view = iosViewForStep('import-pick-profile', iosProgress(), { chosenIdentity: IDENTITY_A, importMatches: matches })
  const values = view.options.map(o => o.value)
  assert(values.includes(ONDISK_MATCH.uuid), 'the matching profile is listed')
  assert(!values.includes(APPLE_PROFILE_WRONG_DIST.uuid), 'the wrong-distribution profile is filtered out')
  assert(!values.includes(APPLE_PROFILE_WRONG_BUNDLE.uuid), 'the wrong-bundle profile is filtered out')
})

// ─── import-pick-profile REDUCER (ephemeral — persists nothing) ──────────────────

await test('import-pick-profile reducer persists NOTHING (the pick is ephemeral)', async () => {
  const before = iosProgress()
  const afterPick = applyIosInput('import-pick-profile', before, { step: 'import-pick-profile', value: ONDISK_MATCH.uuid })
  assertEquals(JSON.stringify(afterPick), JSON.stringify(before), 'the picked profile is never written to progress')
  const afterBack = applyIosInput('import-pick-profile', before, { step: 'import-pick-profile', value: '__back__' })
  assertEquals(JSON.stringify(afterBack), JSON.stringify(before), 'back persists nothing either')
})

// ─── import-pick-profile RESOLVER (valid → export-warning; back; invalid → error) ──

await test('import-pick-profile resolver: valid profile (carried.chosenProfile) → import-export-warning', async () => {
  const deps = makeDeps({ carried: { chosenIdentity: IDENTITY_A, chosenProfile: ONDISK_MATCH } })
  const res = await runIosEffect('import-pick-profile', iosProgress(), deps)
  assertEquals(res.next, 'import-export-warning', 'a valid profile advances to the export warning')
  assert(!deps.__calls.some(c => c.name === 'saveProgress'), 'a valid pick persists nothing (chosenProfile is transient)')
})

await test("import-pick-profile resolver: '__back__' (no carried.chosenProfile) → import-pick-identity", async () => {
  const deps = makeDeps({ carried: { chosenIdentity: IDENTITY_A } })
  const res = await runIosEffect('import-pick-profile', iosProgress(), deps)
  assertEquals(res.next, 'import-pick-identity', 'back returns to the identity picker')
})

await test('import-pick-profile resolver: profile with wrong bundle id → error (detailed message)', async () => {
  const logs = []
  const deps = makeDeps({
    carried: { chosenIdentity: IDENTITY_A, chosenProfile: APPLE_PROFILE_WRONG_BUNDLE },
    onLog: msg => logs.push(msg),
  })
  const res = await runIosEffect('import-pick-profile', iosProgress(), deps)
  assertEquals(res.next, 'error', 'a bundle-id mismatch hard-fails (defense in depth)')
  // TUI parity (app.tsx:3487–3492): the message names the actual bundle + the
  // expected one, NOT a generic "doesn't match this app." line.
  const msg = logs.find(l => l.includes("doesn't match this app:"))
  assert(msg, 'logs the detailed bundle/type mismatch message')
  assert(msg.includes('bundle com.other.app'), 'names the profile\'s actual bundle id')
  assert(msg.includes(`expected ${APP_ID}`), 'names the expected bundle id')
  assert(msg.includes('type app_store'), 'names the profile\'s profileType')
})

await test('import-pick-profile resolver: profile with wrong distribution → error (detailed message)', async () => {
  const logs = []
  const deps = makeDeps({
    carried: { chosenIdentity: IDENTITY_A, chosenProfile: APPLE_PROFILE_WRONG_DIST },
    onLog: msg => logs.push(msg),
  })
  const res = await runIosEffect('import-pick-profile', iosProgress(), deps)
  assertEquals(res.next, 'error', 'a distribution-type mismatch hard-fails')
  const msg = logs.find(l => l.includes("doesn't match this app:"))
  assert(msg, 'logs the detailed bundle/type mismatch message')
  assert(msg.includes('type ad_hoc'), 'names the profile\'s actual distribution type')
  assert(msg.includes('expected app_store'), 'names the expected distribution type')
})

await test("import-pick-profile resolver: profile that doesn't trust the chosen cert → error (detailed cert message)", async () => {
  const otherSha1 = 'c'.repeat(40)
  const wrongCertProfile = profile({ uuid: 'WRONGCERT', name: 'Wrong Cert', certificateSha1s: [otherSha1] })
  const logs = []
  const deps = makeDeps({
    carried: { chosenIdentity: IDENTITY_A, chosenProfile: wrongCertProfile },
    onLog: msg => logs.push(msg),
  })
  const res = await runIosEffect('import-pick-profile', iosProgress(), deps)
  assertEquals(res.next, 'error', "a profile that doesn't include the chosen cert's SHA-1 hard-fails")
  // TUI parity (app.tsx:3510–3514): the cert-trust failure is a DISTINCT message
  // naming the chosen cert, the entry count, the truncated SHA-1s, and the cert's prefix.
  const msg = logs.find(l => l.includes("doesn't trust your chosen certificate"))
  assert(msg, 'logs the distinct cert-trust message (NOT the generic bundle line)')
  assert(msg.includes(IDENTITY_A.name), 'names the chosen certificate')
  assert(msg.includes('contains 1 entry'), 'reports the allowed-certs entry count')
  assert(msg.includes(`${otherSha1.slice(0, 8)}…`), 'shows the profile\'s allowed-cert SHA-1 (truncated)')
  assert(msg.includes(`${IDENTITY_A.sha1.slice(0, 8)}…`), 'shows the chosen cert\'s SHA-1 prefix')
})

// ════════════════════════════════════════════════════════════════════════════════
// DRIVER threading + ephemeral-state isolation
// ════════════════════════════════════════════════════════════════════════════════

console.log('\n🧪 DRIVER threading (carried) + NO ephemeral state persisted\n')

await test('DRIVER: pick-identity (no on-disk) → checking-apple-cert → pick-profile, threading transient as carried', async () => {
  // 1) import-pick-identity: driver recorded chosenIdentity=B (no on-disk profile)
  //    and an ASC key is available (carried .p8) → routes to the apple-cert check.
  const idDeps = makeDeps({ carried: { chosenIdentity: IDENTITY_B, importMatches: MATCHES_NO_PROFILES, p8Content: Buffer.from('P8') } })
  const idRes = await runIosEffect('import-pick-identity', iosProgress(), idDeps)
  assertEquals(idRes.next, 'import-checking-apple-cert', 'pick advances to the apple-cert check')

  // 2) import-checking-apple-cert: Apple returns the RAW summary for B → the engine
  //    synthesizes it into a DiscoveredProfile, injects it, and opens the picker.
  //    Driver threads chosenIdentity + the injected importMatches forward.
  const appleSummaryForB = ascSummary({ id: 'APPLE-B', name: 'Apple B Store', bundleIdentifier: APP_ID })
  const checkDeps = makeDeps({
    carried: { chosenIdentity: IDENTITY_B, importMatches: MATCHES_NO_PROFILES },
    listProfilesForCert: async () => [appleSummaryForB],
  })
  const checkRes = await runIosEffect('import-checking-apple-cert', iosProgress(), checkDeps)
  assertEquals(checkRes.next, 'import-pick-profile', 'a usable Apple profile opens the picker')
  const injected = checkRes.transient.importMatches
  const synthesizedB = injected.find(m => m.identity.sha1 === IDENTITY_B.sha1).profiles.find(p => p.uuid === 'APPLE-B')
  assert(synthesizedB, 'the engine-synthesized Apple profile is injected into B\'s match')
  // The synthesis must trust B's cert (certificateSha1s=[IDENTITY_B.sha1]) and carry
  // the base64 — otherwise the pick-profile cert-trust validation in step 3 rejects it.
  assertEquals(JSON.stringify(synthesizedB.certificateSha1s), JSON.stringify([IDENTITY_B.sha1]), 'synthesized profile trusts B\'s cert')
  assertEquals(synthesizedB.profileBase64, appleSummaryForB.profileContent, 'synthesized profile carries profileBase64 from profileContent')

  // 3) import-pick-profile: driver threads the INJECTED importMatches back as carried
  //    and records the SYNTHESIZED profile (the one the picker actually offered, NOT
  //    the raw Apple summary) → export-warning.
  const profDeps = makeDeps({ carried: { chosenIdentity: IDENTITY_B, importMatches: injected, chosenProfile: synthesizedB } })
  const profRes = await runIosEffect('import-pick-profile', iosProgress(), profDeps)
  assertEquals(profRes.next, 'import-export-warning', 'the injected Apple profile is a valid pick')
})

await test('NO ephemeral state is ever persisted across the picker chain (saveProgress untouched + progress identical)', async () => {
  const baseline = iosProgress()
  const snapshot = JSON.stringify(baseline)

  const steps = [
    { step: 'import-pick-identity', carried: { chosenIdentity: IDENTITY_A, importMatches: MATCHES_A_HAS_PROFILE } },
    { step: 'import-checking-apple-cert', carried: { chosenIdentity: IDENTITY_A, importMatches: MATCHES_NO_PROFILES } },
    { step: 'import-pick-profile', carried: { chosenIdentity: IDENTITY_A, chosenProfile: ONDISK_MATCH } },
  ]
  for (const { step, carried } of steps) {
    const deps = makeDeps({ carried })
    const res = await runIosEffect(step, iosProgress(), deps)
    assert(!deps.__calls.some(c => c.name === 'saveProgress'), `${step} must not persist (ephemeral picker)`)
    assertEquals(JSON.stringify(res.progress), snapshot, `${step} returns progress UNCHANGED`)
    // The ephemeral fields must NEVER appear in returned progress.
    assert(!('chosenIdentity' in res.progress), `${step} must not leak chosenIdentity into progress`)
    assert(!('chosenProfile' in res.progress), `${step} must not leak chosenProfile into progress`)
    assert(!('noMatchReason' in res.progress), `${step} must not leak noMatchReason into progress`)
    assert(!('_appleCertIdForChosen' in res.progress), `${step} must not leak _appleCertIdForChosen into progress`)
    assert(!('importMatches' in res.progress), `${step} must not leak importMatches into progress`)
  }

  // The reducers persist nothing either.
  assertEquals(JSON.stringify(applyIosInput('import-pick-identity', baseline, { step: 'import-pick-identity', value: IDENTITY_A.sha1 })), snapshot, 'pick-identity reducer is a no-op')
  assertEquals(JSON.stringify(applyIosInput('import-pick-profile', baseline, { step: 'import-pick-profile', value: ONDISK_MATCH.uuid })), snapshot, 'pick-profile reducer is a no-op')
})

// ─── Summary ─────────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(60)}`)
console.log(`Passed: ${testsPassed}  ·  Failed: ${testsFailed}`)
if (testsFailed > 0)
  process.exit(1)
