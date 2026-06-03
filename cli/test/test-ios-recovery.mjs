#!/usr/bin/env node
/**
 * iOS BATCH 3 — cert-limit + duplicate-profile recovery spec.
 *
 * Drives `iosViewForStep` / `applyIosInput` / `runIosEffect` for the two
 * ephemeral-origin recovery branches with MOCKED IosEffectDeps (no fs, no
 * network, no child processes):
 *
 *   cert-limit recovery:
 *     creating-certificate → cert-limit-prompt (choice; pick a cert / exit)
 *       pick → revoking-certificate (effect; revokeCertificate) → creating-certificate (retry)
 *       exit → error
 *     revoke failure → error
 *
 *   duplicate-profile recovery (DUAL-ORIGIN):
 *     creating-profile / import-create-profile-only → duplicate-profile-prompt
 *       (choice; confirm delete / exit)
 *       confirm → deleting-duplicate-profiles (effect; deleteProfile per dup)
 *         → next = progress.duplicateProfileOrigin
 *             'creating-profile'            → creating-profile           (create-new origin)
 *             'import-create-profile-only'  → import-create-profile-only (import origin)
 *       exit → error
 *     delete failure → error
 *
 * Like test-ios-create-new.mjs, this file acts as the headless DRIVER: the two
 * choice steps are EPHEMERAL-branching, so the driver applies the user's pick
 * into deps.carried (certToRevoke / confirmDeleteDuplicates) and re-drives the
 * step through runIosEffect as a resolver — the SAME mechanism the Ink TUI uses
 * to mirror its React refs/state. The engine is IO-FREE: every Apple-API touch
 * is an injected dep, and NOTHING is persisted beyond the upstream
 * duplicateProfileOrigin marker (the picked cert + the duplicate list ride
 * transient only).
 */
import process from 'node:process'

const {
  runIosEffect,
  iosViewForStep,
  applyIosInput,
} = await import('../src/build/onboarding/ios/flow.ts')

console.log('🧪 iOS BATCH 3 — cert-limit + duplicate-profile recovery\n')

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

// Existing certs offered for revocation at cert-limit-prompt (AscDistributionCert).
const EXISTING_CERTS = [
  { id: 'OLD1', name: 'Old Cert 1', serialNumber: 'S1', expirationDate: '2026-01-01T00:00:00.000Z' },
  { id: 'OLD2', name: 'Old Cert 2', serialNumber: 'S2', expirationDate: '2026-02-01T00:00:00.000Z' },
  { id: 'OLD3', name: 'Old Cert 3', serialNumber: 'S3', expirationDate: '2026-03-01T00:00:00.000Z' },
]

// Duplicate Capgo profiles surfaced at duplicate-profile-prompt.
const DUP_PROFILES = [
  { id: 'DUP1', name: 'Capgo com.example.app AppStore', profileType: 'IOS_APP_STORE' },
  { id: 'DUP2', name: 'Capgo com.example.app AppStore', profileType: 'IOS_APP_STORE' },
]

/**
 * Build an iOS OnboardingProgress at a given point. `setupMethod` defaults to
 * 'create-new'; the duplicate-origin tests override duplicateProfileOrigin /
 * setupMethod so the post-deletion routing is asserted for BOTH origins.
 */
function iosProgress(overrides = {}) {
  const { completedSteps: completedOverrides, ...rest } = overrides
  return {
    platform: 'ios',
    appId: APP_ID,
    startedAt: '2026-06-03T00:00:00.000Z',
    setupMethod: 'create-new',
    ...rest,
    completedSteps: {
      ...completedOverrides,
    },
  }
}

/**
 * Mocked IosEffectDeps. revokeCertificate / deleteProfile record their calls so
 * the spec can assert which Apple-API helper fired and with what id. The
 * engine-local single-arg envelopes match IosEffectDeps (the driver pre-binds
 * the ASC token). `carried` is the driver-held transient — the spec threads the
 * ephemeral revoke selection / confirm decision / duplicate list through it.
 */
function makeDeps(overrides = {}) {
  const calls = []

  const deps = {
    appId: APP_ID,

    revokeCertificate: async (...a) => { calls.push({ name: 'revokeCertificate', args: a }) },
    deleteProfile: async (...a) => { calls.push({ name: 'deleteProfile', args: a }) },

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
// CERT-LIMIT RECOVERY
// ════════════════════════════════════════════════════════════════════════════════

console.log('🧪 cert-limit-prompt → revoking-certificate → creating-certificate (retry)\n')

// ─── cert-limit-prompt VIEW ──────────────────────────────────────────────────────

await test("iosViewForStep('cert-limit-prompt') is a choice listing the existing certs + an exit option", async () => {
  const view = iosViewForStep('cert-limit-prompt', iosProgress(), { existingCerts: EXISTING_CERTS })
  assertEquals(view.step, 'cert-limit-prompt', 'view echoes the step')
  assertEquals(view.kind, 'choice', 'cert-limit-prompt is a choice')
  assert(Array.isArray(view.options), 'must expose options')
  // One option per existing cert (value = Apple resource id) + the trailing exit.
  assertEquals(view.options.length, EXISTING_CERTS.length + 1, 'one option per cert + an exit option')
  const values = view.options.map(o => o.value)
  for (const c of EXISTING_CERTS)
    assert(values.includes(c.id), `offers cert ${c.id} for revocation by its Apple resource id`)
  assert(values.includes('__exit__'), 'offers an exit option')
})

await test("iosViewForStep('cert-limit-prompt') flags our own cert as Created by Capgo", async () => {
  const view = iosViewForStep('cert-limit-prompt', iosProgress(), {
    existingCerts: EXISTING_CERTS,
    certData: { certificateId: 'OLD2', expirationDate: '2026-02-01', teamId: 'T', p12Base64: 'X' },
  })
  const ours = view.options.find(o => o.value === 'OLD2')
  assert(ours && ours.label.includes('Created by Capgo'), 'the Capgo-created cert is annotated')
})

// ─── cert-limit-prompt REDUCER (ephemeral — persists nothing) ────────────────────

await test('cert-limit-prompt reducer persists NOTHING (the pick is ephemeral)', async () => {
  const before = iosProgress()
  const after = applyIosInput('cert-limit-prompt', before, { step: 'cert-limit-prompt', value: 'OLD1' })
  assertEquals(JSON.stringify(after), JSON.stringify(before), 'the picked cert id is never written to progress')
  const afterExit = applyIosInput('cert-limit-prompt', before, { step: 'cert-limit-prompt', value: '__exit__' })
  assertEquals(JSON.stringify(afterExit), JSON.stringify(before), 'exit persists nothing either')
})

// ─── cert-limit-prompt RESOLVER (pick → revoking-certificate; exit → error) ──────

await test('cert-limit-prompt resolver (cert picked → carried.certToRevoke) → revoking-certificate; threads certToRevoke', async () => {
  // Driver: user picked OLD2 → resolve it against the carried existingCerts.
  const picked = EXISTING_CERTS.find(c => c.id === 'OLD2')
  const deps = makeDeps({ carried: { certToRevoke: picked } })
  const res = await runIosEffect('cert-limit-prompt', iosProgress(), deps)
  assertEquals(res.next, 'revoking-certificate', 'a picked cert advances to the revoke effect')
  assert(res.transient && res.transient.certToRevoke, 'threads the picked cert forward in transient')
  assertEquals(res.transient.certToRevoke.id, 'OLD2', 'the carried revoke selection rides transient')
})

await test('cert-limit-prompt resolver (exit → no carried.certToRevoke) → error', async () => {
  const deps = makeDeps({ carried: {} })
  const res = await runIosEffect('cert-limit-prompt', iosProgress(), deps)
  assertEquals(res.next, 'error', 'exiting the prompt (no revoke selection) routes to error')
})

// ─── revoking-certificate EFFECT ─────────────────────────────────────────────────

await test('revoking-certificate (success) → creating-certificate (retry); calls revokeCertificate with the picked id; persists nothing', async () => {
  const picked = EXISTING_CERTS.find(c => c.id === 'OLD2')
  const deps = makeDeps({ carried: { certToRevoke: picked } })
  const res = await runIosEffect('revoking-certificate', iosProgress(), deps)
  assertEquals(res.next, 'creating-certificate', 'a revoked cert retries certificate creation')
  const call = deps.__calls.find(c => c.name === 'revokeCertificate')
  assert(call, 'must call revokeCertificate')
  assertEquals(call.args[0], 'OLD2', 'revokeCertificate receives the picked cert id')
  assert(!deps.__calls.some(c => c.name === 'saveProgress'), 'revoke persists nothing (cert id is transient only)')
})

await test('revoking-certificate (revoke fails) → error', async () => {
  const picked = EXISTING_CERTS.find(c => c.id === 'OLD2')
  const deps = makeDeps({
    carried: { certToRevoke: picked },
    revokeCertificate: async () => { throw new Error('revoke failed') },
  })
  const res = await runIosEffect('revoking-certificate', iosProgress(), deps)
  assertEquals(res.next, 'error', 'a failed revoke routes to error')
})

// ─── FULL cert-limit recovery loop (driver threads transient as carried) ─────────

await test('DRIVER: cert-limit-prompt pick → revoking-certificate → creating-certificate retry', async () => {
  // 1) cert-limit-prompt resolver: driver resolves the picked cert into carried.
  const picked = EXISTING_CERTS.find(c => c.id === 'OLD3')
  const promptDeps = makeDeps({ carried: { existingCerts: EXISTING_CERTS, certToRevoke: picked } })
  const prompt = await runIosEffect('cert-limit-prompt', iosProgress(), promptDeps)
  assertEquals(prompt.next, 'revoking-certificate', 'pick advances to revoke')

  // 2) Driver threads the transient revoke selection into the next effect.
  const revokeDeps = makeDeps({ carried: { certToRevoke: prompt.transient.certToRevoke } })
  const revoked = await runIosEffect('revoking-certificate', iosProgress(), revokeDeps)
  assertEquals(revoked.next, 'creating-certificate', 'revoke retries cert creation')
  assertEquals(revokeDeps.__calls.find(c => c.name === 'revokeCertificate').args[0], 'OLD3', 'revoked the cert the user picked')
})

// ════════════════════════════════════════════════════════════════════════════════
// DUPLICATE-PROFILE RECOVERY (DUAL-ORIGIN)
// ════════════════════════════════════════════════════════════════════════════════

console.log('\n🧪 duplicate-profile-prompt → deleting-duplicate-profiles → origin\n')

// ─── duplicate-profile-prompt VIEW ───────────────────────────────────────────────

await test("iosViewForStep('duplicate-profile-prompt') is a choice with delete + exit options", async () => {
  const view = iosViewForStep('duplicate-profile-prompt', iosProgress(), { duplicateProfiles: DUP_PROFILES })
  assertEquals(view.step, 'duplicate-profile-prompt', 'view echoes the step')
  assertEquals(view.kind, 'choice', 'duplicate-profile-prompt is a choice')
  const values = (view.options ?? []).map(o => o.value)
  assert(values.includes('delete'), "offers the 'delete' (remove duplicates + recreate) option")
  assert(values.includes('exit'), "offers the 'exit' option")
  assert(view.title.includes(String(DUP_PROFILES.length)), 'the title reflects the duplicate count')
})

// ─── duplicate-profile-prompt REDUCER (ephemeral — persists nothing) ─────────────

await test('duplicate-profile-prompt reducer persists NOTHING (only the upstream duplicateProfileOrigin is persisted)', async () => {
  const before = iosProgress({ duplicateProfileOrigin: 'creating-profile' })
  const afterDelete = applyIosInput('duplicate-profile-prompt', before, { step: 'duplicate-profile-prompt', value: 'delete' })
  assertEquals(JSON.stringify(afterDelete), JSON.stringify(before), "the 'delete' choice writes nothing new")
  const afterExit = applyIosInput('duplicate-profile-prompt', before, { step: 'duplicate-profile-prompt', value: 'exit' })
  assertEquals(JSON.stringify(afterExit), JSON.stringify(before), "the 'exit' choice writes nothing new")
})

// ─── duplicate-profile-prompt RESOLVER (confirm → delete; exit → error) ──────────

await test('duplicate-profile-prompt resolver (confirm → carried.confirmDeleteDuplicates) → deleting-duplicate-profiles', async () => {
  const deps = makeDeps({ carried: { confirmDeleteDuplicates: true, duplicateProfiles: DUP_PROFILES } })
  const res = await runIosEffect('duplicate-profile-prompt', iosProgress({ duplicateProfileOrigin: 'creating-profile' }), deps)
  assertEquals(res.next, 'deleting-duplicate-profiles', 'confirming the delete advances to the deletion effect')
})

await test('duplicate-profile-prompt resolver (exit → no confirm) → error', async () => {
  const deps = makeDeps({ carried: { confirmDeleteDuplicates: false, duplicateProfiles: DUP_PROFILES } })
  const res = await runIosEffect('duplicate-profile-prompt', iosProgress({ duplicateProfileOrigin: 'creating-profile' }), deps)
  assertEquals(res.next, 'error', 'exiting the prompt routes to error')
})

// ─── deleting-duplicate-profiles EFFECT — DUAL-ORIGIN routing ────────────────────

await test('deleting-duplicate-profiles deletes EACH duplicate then routes to creating-profile (create-new origin)', async () => {
  const deps = makeDeps({ carried: { duplicateProfiles: DUP_PROFILES } })
  const res = await runIosEffect('deleting-duplicate-profiles', iosProgress({ duplicateProfileOrigin: 'creating-profile' }), deps)
  assertEquals(res.next, 'creating-profile', 'create-new origin retries the create-new creating-profile step')
  const deletes = deps.__calls.filter(c => c.name === 'deleteProfile')
  assertEquals(deletes.length, DUP_PROFILES.length, 'every duplicate profile is deleted')
  assertEquals(deletes[0].args[0], 'DUP1', 'deleteProfile receives the first duplicate id')
  assertEquals(deletes[1].args[0], 'DUP2', 'deleteProfile receives the second duplicate id')
})

await test('deleting-duplicate-profiles routes to import-create-profile-only (IMPORT origin) — NOT the create-new step', async () => {
  const deps = makeDeps({ carried: { duplicateProfiles: DUP_PROFILES } })
  const progress = iosProgress({ setupMethod: 'import-existing', duplicateProfileOrigin: 'import-create-profile-only' })
  const res = await runIosEffect('deleting-duplicate-profiles', progress, deps)
  assertEquals(res.next, 'import-create-profile-only', 'import origin retries the import D2 step (the dual-origin contract)')
  assert(res.next !== 'creating-profile', 'an import user must NEVER be routed into the create-new creating-profile')
})

await test('deleting-duplicate-profiles defaults to creating-profile when no origin was persisted', async () => {
  const deps = makeDeps({ carried: { duplicateProfiles: DUP_PROFILES } })
  const res = await runIosEffect('deleting-duplicate-profiles', iosProgress(), deps)
  assertEquals(res.next, 'creating-profile', 'absent origin falls back to the create-new origin (the TUI default)')
})

await test('deleting-duplicate-profiles (a delete fails) → error', async () => {
  const deps = makeDeps({
    carried: { duplicateProfiles: DUP_PROFILES },
    deleteProfile: async () => { throw new Error('delete failed') },
  })
  const res = await runIosEffect('deleting-duplicate-profiles', iosProgress({ duplicateProfileOrigin: 'creating-profile' }), deps)
  assertEquals(res.next, 'error', 'a failed deletion routes to error')
})

await test('deleting-duplicate-profiles tolerates an empty duplicate list (nothing to delete) and still routes to the origin', async () => {
  const deps = makeDeps({ carried: { duplicateProfiles: [] } })
  const res = await runIosEffect('deleting-duplicate-profiles', iosProgress({ duplicateProfileOrigin: 'import-create-profile-only', setupMethod: 'import-existing' }), deps)
  assertEquals(res.next, 'import-create-profile-only', 'an empty list still routes to the persisted origin')
  assert(!deps.__calls.some(c => c.name === 'deleteProfile'), 'no deleteProfile call when there are no duplicates')
})

// ─── FULL duplicate recovery loops — BOTH origins (driver threads carried) ───────

await test('DRIVER: confirm → delete → creating-profile (full create-new duplicate recovery)', async () => {
  // 1) duplicate-profile-prompt resolver: driver records the confirm decision.
  const promptDeps = makeDeps({ carried: { confirmDeleteDuplicates: true, duplicateProfiles: DUP_PROFILES } })
  const progress = iosProgress({ duplicateProfileOrigin: 'creating-profile' })
  const prompt = await runIosEffect('duplicate-profile-prompt', progress, promptDeps)
  assertEquals(prompt.next, 'deleting-duplicate-profiles', 'confirm advances to deletion')

  // 2) Driver threads the duplicate list into the deletion effect.
  const delDeps = makeDeps({ carried: { duplicateProfiles: DUP_PROFILES } })
  const deleted = await runIosEffect('deleting-duplicate-profiles', progress, delDeps)
  assertEquals(deleted.next, 'creating-profile', 'create-new origin loops back to creating-profile')
})

await test('DRIVER: confirm → delete → import-create-profile-only (full import duplicate recovery)', async () => {
  const promptDeps = makeDeps({ carried: { confirmDeleteDuplicates: true, duplicateProfiles: DUP_PROFILES } })
  const progress = iosProgress({ setupMethod: 'import-existing', duplicateProfileOrigin: 'import-create-profile-only' })
  const prompt = await runIosEffect('duplicate-profile-prompt', progress, promptDeps)
  assertEquals(prompt.next, 'deleting-duplicate-profiles', 'confirm advances to deletion')

  const delDeps = makeDeps({ carried: { duplicateProfiles: DUP_PROFILES } })
  const deleted = await runIosEffect('deleting-duplicate-profiles', progress, delDeps)
  assertEquals(deleted.next, 'import-create-profile-only', 'import origin loops back to import-create-profile-only')
})

// ─── Summary ─────────────────────────────────────────────────────────────────────

console.log(`\n${testsPassed} passed, ${testsFailed} failed`)
if (testsFailed > 0)
  process.exit(1)
