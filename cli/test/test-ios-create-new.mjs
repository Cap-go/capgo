#!/usr/bin/env node
/**
 * iOS BATCH 2a — create-new credential effect spec.
 *
 * Drives `runIosEffect` for the create-new provisioning backbone with MOCKED
 * IosEffectDeps (no fs, no network, no child processes) and asserts, for each
 * effect:
 *   - the routing (IosEffectResult.next),
 *   - the PERSISTED markers (what saveProgress wrote — completedSteps /
 *     _credentialsExistGate / duplicateProfileOrigin),
 *   - the TRANSIENT payloads (certData / profileData / teamId / apiKey /
 *     existingCerts / duplicateProfiles / p8Content / pickerOpened),
 * across the happy path AND every branch (cert-limit, duplicate-profile, error,
 * picker-cancel, picker-idempotency).
 *
 * Like test-ios-tail-handoff.mjs, this file acts as the headless DRIVER: it
 * captures IosEffectResult.transient from each effect and threads it back into
 * the NEXT effect as `deps.carried` (the SAME mechanism the Ink TUI uses to
 * mirror its React refs/state). The engine itself is IO-FREE — every Apple-API /
 * CSR / keychain / fs touch is an injected dep, and NO secret is ever persisted
 * to progress beyond the create-new `completedSteps` markers (cert/profile/p12
 * ride transient + the persisted markers, exactly like android).
 */
import { Buffer } from 'node:buffer'
import process from 'node:process'

const {
  runIosEffect,
  iosViewForStep,
  applyIosInput,
} = await import('../src/build/onboarding/ios/flow.ts')

// The TOTAL iOS resume resolver — the engine's single source of truth for "what
// step comes next" after a reducer persists its field. The create-new choice/
// input chain (BATCH 2b) asserts its next-step routing THROUGH this, exactly as
// the driver would, so the persisted-state transitions stay byte-for-byte aligned
// with the TUI's setStep() targets.
const {
  getIosResumeStep,
} = await import('../src/build/onboarding/ios/progress.ts')

// Re-import the apple-api error classes so the spec can throw the SAME error
// instances the engine `instanceof`-checks against.
const {
  CertificateLimitError,
  DuplicateProfileError,
} = await import('../src/build/onboarding/apple-api.ts')

console.log('🧪 iOS BATCH 2a — create-new credential effects (verify/cert/profile)\n')

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

const P8_BYTES = Buffer.from('-----BEGIN PRIVATE KEY-----\nMOCK\n-----END PRIVATE KEY-----')

// What deps.createCertificate resolves to (RAW Apple cert response shape).
const RAW_CERT = {
  certificateId: 'CERT1',
  certificateContent: 'BASE64_DER_CERT_CONTENT',
  expirationDate: '2027-01-01',
  teamId: 'TEAM123',
}

// What deps.createProfile resolves to (ProfileData shape).
const PROFILE = {
  profileId: 'PROF1',
  profileName: 'Capgo com.example.app AppStore',
  profileBase64: 'PROFILE_BASE64',
}

const EXISTING_CERTS = [
  { id: 'OLD1', name: 'Old Cert 1', serialNumber: 'S1', expirationDate: '2026-01-01' },
  { id: 'OLD2', name: 'Old Cert 2', serialNumber: 'S2', expirationDate: '2026-02-01' },
  { id: 'OLD3', name: 'Old Cert 3', serialNumber: 'S3', expirationDate: '2026-03-01' },
]

const DUP_PROFILES = [
  { id: 'DUP1', name: 'Capgo com.example.app AppStore', profileType: 'IOS_APP_STORE' },
]

/**
 * Build an iOS OnboardingProgress for the create-new path at a given point.
 * `setupMethod` defaults to 'create-new' so the resume routing + cert/profile
 * branches behave as the create-new flow.
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
 * Mocked IosEffectDeps. Every helper returns canned data and records its calls
 * so the spec can assert which pure helper fired. `saveProgress` captures the
 * LAST persisted progress so the spec can assert the persisted markers.
 */
function makeDeps(overrides = {}) {
  const calls = []
  let lastSaved = null

  const deps = {
    appId: APP_ID,

    // ── apple-api / csr (create-new chain) ──
    verifyApiKey: async (...a) => { calls.push({ name: 'verifyApiKey', args: a }); return { teamId: RAW_CERT.teamId } },
    generateCsr: (...a) => { calls.push({ name: 'generateCsr', args: a }); return { csr: 'CSR_PEM', privateKeyPem: 'PRIV_PEM' } },
    createCertificate: async (...a) => { calls.push({ name: 'createCertificate', args: a }); return { ...RAW_CERT } },
    createP12: (...a) => { calls.push({ name: 'createP12', args: a }); return 'P12_BASE64' },
    createProfile: async (...a) => { calls.push({ name: 'createProfile', args: a }); return { ...PROFILE } },
    checkDuplicateProfiles: async (...a) => { calls.push({ name: 'checkDuplicateProfiles', args: a }); return [] },
    listCertificates: async (...a) => { calls.push({ name: 'listCertificates', args: a }); return EXISTING_CERTS },

    // ── verify-app (remote App Store verification, PR #2397) — exact-match by
    // default so the create-new chain passes straight through the gate. ──
    listApps: async (...a) => { calls.push({ name: 'listApps', args: a }); return [{ id: 'APPSTORE1', bundleId: APP_ID, name: 'Example App' }] },
    listBundleIds: async (...a) => { calls.push({ name: 'listBundleIds', args: a }); return [APP_ID] },
    detectBundleIds: (...a) => {
      calls.push({ name: 'detectBundleIds', args: a })
      return {
        pbxproj: { value: APP_ID, source: 'pbxproj-release', label: 'project.pbxproj (Release config)' },
        debug: null,
        plist: null,
        capacitor: { value: APP_ID, source: 'capacitor-config', label: 'capacitor.config.ts (appId)' },
        recommended: { value: APP_ID, source: 'pbxproj-release', label: 'project.pbxproj (Release config)' },
        mismatch: false,
        debugReleaseDiffer: false,
        releaseResolved: true,
        candidates: [],
      }
    },
    writeReleaseBundleId: (...a) => { calls.push({ name: 'writeReleaseBundleId', args: a }); return { changed: 1 } },
    ensureBundleId: async (...a) => { calls.push({ name: 'ensureBundleId', args: a }) },
    openExternal: async (...a) => { calls.push({ name: 'openExternal', args: a }) },

    // ── persistence ──
    saveProgress: async (appId, progress) => { calls.push({ name: 'saveProgress', args: [appId, progress] }); lastSaved = progress },
    loadProgress: async () => null,

    // ── file system ──
    readFile: async (...a) => { calls.push({ name: 'readFile', args: a }); return P8_BYTES },
    copyFile: async (...a) => { calls.push({ name: 'copyFile', args: a }) },
    openP8FilePicker: async (...a) => { calls.push({ name: 'openP8FilePicker', args: a }); return '/Users/me/AuthKey_ABC123.p8' },
    isMacOS: () => true,

    onStatus: () => {},
    onLog: () => {},

    ...overrides,
  }
  deps.__calls = calls
  deps.__lastSaved = () => lastSaved
  return deps
}

// ─── 1) backing-up ──────────────────────────────────────────────────────────────

await test('backing-up → setup-method-select (macOS); persists _credentialsExistGate="done"; backs up via copyFile', async () => {
  const deps = makeDeps()
  const res = await runIosEffect('backing-up', iosProgress({ _credentialsExistGate: 'backup' }), deps)
  assertEquals(res.next, 'setup-method-select', 'macOS backup routes to the setup-method fork')
  assert(deps.__calls.some(c => c.name === 'copyFile'), 'must back up the existing credentials via copyFile')
  assertEquals(res.progress._credentialsExistGate, 'done', 'gate must flip to done so resume falls through')
  assertEquals(deps.__lastSaved()._credentialsExistGate, 'done', 'the persisted progress must carry gate=done')
})

await test('backing-up → api-key-instructions when NOT macOS (import sub-flow unavailable)', async () => {
  const deps = makeDeps({ isMacOS: () => false })
  const res = await runIosEffect('backing-up', iosProgress({ _credentialsExistGate: 'backup' }), deps)
  assertEquals(res.next, 'api-key-instructions', 'off-macOS skips the import fork and goes straight to ASC key entry')
  assertEquals(res.progress._credentialsExistGate, 'done', 'gate still flips to done off-macOS')
})

await test('backing-up tolerates a missing source file (copyFile rejects → still advances, gate=done)', async () => {
  const deps = makeDeps({ copyFile: async () => { throw new Error('ENOENT') } })
  const res = await runIosEffect('backing-up', iosProgress({ _credentialsExistGate: 'backup' }), deps)
  assertEquals(res.next, 'setup-method-select', 'a missing backup source is non-fatal — still advance')
  assertEquals(res.progress._credentialsExistGate, 'done', 'gate flips to done even when the backup file was absent')
})

// ─── 2) p8-method-select (file-picker effect) ─────────────────────────────────────

await test('p8-method-select (file chosen) → input-key-id; persists p8Path + extracted keyId; transient p8Content + pickerOpened', async () => {
  const deps = makeDeps()
  const res = await runIosEffect('p8-method-select', iosProgress(), deps)
  assertEquals(res.next, 'input-key-id', 'a chosen .p8 advances to the Key ID step')
  assert(deps.__calls.some(c => c.name === 'openP8FilePicker'), 'must open the native picker')
  assert(deps.__calls.some(c => c.name === 'readFile'), 'must read the chosen .p8 file')
  assertEquals(res.progress.p8Path, '/Users/me/AuthKey_ABC123.p8', 'persists the chosen .p8 path')
  assertEquals(res.progress.keyId, 'ABC123', 'persists the keyId extracted from the AuthKey_<id>.p8 filename')
  assert(res.transient && res.transient.p8Content, 'returns the raw .p8 bytes in transient (NOT persisted)')
  assert(res.transient.p8Content.equals(P8_BYTES), 'transient.p8Content must be the bytes readFile returned')
  assertEquals(res.transient.pickerOpened, true, 'returns pickerOpened so the driver guards against re-opening')
})

await test('p8-method-select (cancelled) → input-p8-path (manual fallback); pickerOpened set; NO p8Path persisted', async () => {
  const deps = makeDeps({ openP8FilePicker: async () => null })
  const res = await runIosEffect('p8-method-select', iosProgress(), deps)
  assertEquals(res.next, 'input-p8-path', 'a cancelled picker falls back to manual path entry')
  assertEquals(res.transient.pickerOpened, true, 'pickerOpened still set so a re-render does not re-open')
  assert(res.progress.p8Path === undefined, 'a cancelled picker must NOT persist a p8Path')
})

await test('p8-method-select is IDEMPOTENT — carried.pickerOpened short-circuits without re-opening the dialog', async () => {
  const deps = makeDeps({ carried: { pickerOpened: true } })
  const res = await runIosEffect('p8-method-select', iosProgress(), deps)
  assertEquals(res.next, 'input-p8-path', 'an already-opened picker drive does not re-open')
  assert(!deps.__calls.some(c => c.name === 'openP8FilePicker'), 'must NOT re-open the picker when pickerOpened is carried')
})

// ─── 3) verifying-key ─────────────────────────────────────────────────────────────

await test('verifying-key (success) → verify-app; persists completedSteps.apiKeyVerified; transient apiKey + teamId', async () => {
  const deps = makeDeps({ carried: { p8Content: P8_BYTES } })
  const progress = iosProgress({ p8Path: '/Users/me/AuthKey_ABC123.p8', keyId: 'KEY1', issuerId: 'ISS1' })
  const res = await runIosEffect('verifying-key', progress, deps)
  assertEquals(res.next, 'verify-app', 'a verified key advances to the remote App Store verification gate (create-new, PR #2397)')
  assert(res.transient.pendingVerifyNext === undefined, 'create-new sets NO pendingVerifyNext — verify-app falls back to creating-certificate')
  const verifyCall = deps.__calls.find(c => c.name === 'verifyApiKey')
  assert(verifyCall, 'must call verifyApiKey')
  assertEquals(verifyCall.args[0].keyId, 'KEY1', 'verifyApiKey receives the persisted keyId')
  assertEquals(verifyCall.args[0].issuerId, 'ISS1', 'verifyApiKey receives the persisted issuerId')
  assert(verifyCall.args[0].p8Content.equals(P8_BYTES), 'verifyApiKey receives the carried .p8 bytes')
  assert(res.progress.completedSteps.apiKeyVerified, 'must persist the apiKeyVerified marker')
  assertEquals(res.progress.completedSteps.apiKeyVerified.keyId, 'KEY1', 'persisted apiKeyVerified carries keyId')
  assertEquals(res.progress.completedSteps.apiKeyVerified.issuerId, 'ISS1', 'persisted apiKeyVerified carries issuerId')
  assertEquals(res.transient.apiKey.keyId, 'KEY1', 'transient mirrors the verified apiKey')
  assertEquals(res.transient.teamId, RAW_CERT.teamId, 'the verified team id rides transient for the cert/profile effects')
})

await test('verifying-key falls back to readFile(p8Path) when the .p8 bytes were NOT carried (crash-recovery resume)', async () => {
  const deps = makeDeps() // no carried.p8Content
  const progress = iosProgress({ p8Path: '/Users/me/AuthKey_ABC123.p8', keyId: 'KEY1', issuerId: 'ISS1' })
  const res = await runIosEffect('verifying-key', progress, deps)
  assertEquals(res.next, 'verify-app', 'resume still verifies after re-reading the .p8 from disk (→ the verify-app gate)')
  assert(deps.__calls.some(c => c.name === 'readFile'), 'must re-read the .p8 file when bytes were not carried')
})

await test('verifying-key (Apple rejects the key) → error; does NOT persist apiKeyVerified', async () => {
  const deps = makeDeps({
    carried: { p8Content: P8_BYTES },
    verifyApiKey: async () => { throw new Error('API key verification failed') },
  })
  const progress = iosProgress({ p8Path: '/Users/me/AuthKey_ABC123.p8', keyId: 'KEY1', issuerId: 'ISS1' })
  const res = await runIosEffect('verifying-key', progress, deps)
  assertEquals(res.next, 'error', 'a rejected key routes to error')
  assert(!deps.__calls.some(c => c.name === 'saveProgress'), 'must NOT persist on a verify failure')
})

// ─── 4) creating-certificate ───────────────────────────────────────────────────────

await test('creating-certificate (success) → creating-profile; persists completedSteps.certificateCreated (p12 + teamId); transient certData/teamId', async () => {
  const deps = makeDeps({ carried: { p8Content: P8_BYTES, teamId: RAW_CERT.teamId } })
  const progress = iosProgress({
    p8Path: '/x.p8',
    keyId: 'KEY1',
    issuerId: 'ISS1',
    completedSteps: { apiKeyVerified: { keyId: 'KEY1', issuerId: 'ISS1' } },
  })
  const res = await runIosEffect('creating-certificate', progress, deps)
  assertEquals(res.next, 'creating-profile', 'a created cert advances to profile creation')
  assert(deps.__calls.some(c => c.name === 'generateCsr'), 'must generate a CSR')
  assert(deps.__calls.some(c => c.name === 'createCertificate'), 'must call createCertificate with the CSR')
  const p12Call = deps.__calls.find(c => c.name === 'createP12')
  assert(p12Call, 'must build the .p12 locally from the Apple cert content + private key')
  assertEquals(p12Call.args[0].certificatePem, RAW_CERT.certificateContent, 'createP12 receives the Apple base64 DER cert content')
  assertEquals(p12Call.args[0].privateKeyPem, 'PRIV_PEM', 'createP12 receives the CSR private key')
  const saved = res.progress.completedSteps.certificateCreated
  assert(saved, 'must persist the certificateCreated marker')
  assertEquals(saved.certificateId, RAW_CERT.certificateId, 'persisted cert carries the Apple cert id')
  assertEquals(saved.p12Base64, 'P12_BASE64', 'persisted cert carries the assembled p12 base64 (the credential)')
  assertEquals(saved.teamId, RAW_CERT.teamId, 'persisted cert carries the team id')
  assert(!('_privateKeyPem' in res.progress), 'the private key PEM must NEVER be persisted to progress')
  assertEquals(res.transient.certData.certificateId, RAW_CERT.certificateId, 'transient carries certData for the downstream profile effect')
  assertEquals(res.transient.teamId, RAW_CERT.teamId, 'transient carries the team id')
})

await test('creating-certificate (cert limit) → cert-limit-prompt; transient.existingCerts from the error; does NOT persist a cert', async () => {
  const deps = makeDeps({
    createCertificate: async () => { throw new CertificateLimitError(EXISTING_CERTS) },
  })
  const progress = iosProgress({ completedSteps: { apiKeyVerified: { keyId: 'KEY1', issuerId: 'ISS1' } } })
  const res = await runIosEffect('creating-certificate', progress, deps)
  assertEquals(res.next, 'cert-limit-prompt', 'a cert-limit error routes to the revoke prompt')
  assert(res.transient && Array.isArray(res.transient.existingCerts), 'must surface the existing certs in transient')
  assertEquals(res.transient.existingCerts.length, EXISTING_CERTS.length, 'all existing certs are offered for revocation')
  assert(!res.progress.completedSteps.certificateCreated, 'must NOT persist a certificateCreated marker on cert-limit')
})

await test('creating-certificate (cert limit, error has no certs) → falls back to deps.listCertificates for existingCerts', async () => {
  const deps = makeDeps({
    createCertificate: async () => { throw new CertificateLimitError([]) },
  })
  const progress = iosProgress({ completedSteps: { apiKeyVerified: { keyId: 'KEY1', issuerId: 'ISS1' } } })
  const res = await runIosEffect('creating-certificate', progress, deps)
  assertEquals(res.next, 'cert-limit-prompt', 'still routes to the revoke prompt')
  assert(deps.__calls.some(c => c.name === 'listCertificates'), 'falls back to listCertificates when the error carries none')
  assertEquals(res.transient.existingCerts.length, EXISTING_CERTS.length, 'existingCerts come from listCertificates')
})

await test('creating-certificate (generic failure) → error; no cert persisted', async () => {
  const deps = makeDeps({
    createCertificate: async () => { throw new Error('network down') },
  })
  const progress = iosProgress({ completedSteps: { apiKeyVerified: { keyId: 'KEY1', issuerId: 'ISS1' } } })
  const res = await runIosEffect('creating-certificate', progress, deps)
  assertEquals(res.next, 'error', 'a non-limit failure routes to error')
  assert(!res.progress.completedSteps.certificateCreated, 'no cert persisted on a generic failure')
})

// ─── 5) creating-profile ───────────────────────────────────────────────────────────

await test('creating-profile (success) → saving-credentials; persists completedSteps.profileCreated; transient certData/profileData/teamId', async () => {
  const deps = makeDeps({ carried: { certData: { ...RAW_CERT, p12Base64: 'P12_BASE64' }, teamId: RAW_CERT.teamId } })
  const progress = iosProgress({
    completedSteps: {
      apiKeyVerified: { keyId: 'KEY1', issuerId: 'ISS1' },
      certificateCreated: { certificateId: RAW_CERT.certificateId, expirationDate: RAW_CERT.expirationDate, teamId: RAW_CERT.teamId, p12Base64: 'P12_BASE64' },
    },
  })
  const res = await runIosEffect('creating-profile', progress, deps)
  assertEquals(res.next, 'saving-credentials', 'a created profile advances to the saving-credentials convergence point')
  const createCall = deps.__calls.find(c => c.name === 'createProfile')
  assert(createCall, 'must call createProfile')
  assertEquals(createCall.args[0].bundleId, APP_ID, 'createProfile uses the resolved bundle id (config.appId here)')
  assertEquals(createCall.args[0].certificateId, RAW_CERT.certificateId, 'createProfile links the created cert')
  const saved = res.progress.completedSteps.profileCreated
  assert(saved, 'must persist the profileCreated marker')
  assertEquals(saved.profileId, PROFILE.profileId, 'persisted profile carries the Apple profile id')
  assertEquals(saved.profileBase64, PROFILE.profileBase64, 'persisted profile carries the mobileprovision base64')
  assertEquals(res.transient.profileData.profileId, PROFILE.profileId, 'transient carries profileData for the save handoff')
  assertEquals(res.transient.certData.p12Base64, 'P12_BASE64', 'transient threads certData into saving-credentials')
  assertEquals(res.transient.teamId, RAW_CERT.teamId, 'transient threads the team id into saving-credentials')
})

await test('creating-profile resolves the bundle id from iosBundleIdOverride when the user confirmed a different bundle id', async () => {
  const deps = makeDeps()
  const progress = iosProgress({
    iosBundleIdOverride: 'app.capgo.override.Build',
    completedSteps: {
      apiKeyVerified: { keyId: 'KEY1', issuerId: 'ISS1' },
      certificateCreated: { certificateId: RAW_CERT.certificateId, expirationDate: RAW_CERT.expirationDate, teamId: RAW_CERT.teamId, p12Base64: 'P12_BASE64' },
    },
  })
  await runIosEffect('creating-profile', progress, deps)
  const createCall = deps.__calls.find(c => c.name === 'createProfile')
  assertEquals(createCall.args[0].bundleId, 'app.capgo.override.Build', 'createProfile must use the confirmed override bundle id')
})

await test('creating-profile (duplicate via createProfile DuplicateProfileError) → duplicate-profile-prompt; persists duplicateProfileOrigin=creating-profile; transient.duplicateProfiles', async () => {
  const deps = makeDeps({
    createProfile: async () => { throw new DuplicateProfileError(DUP_PROFILES) },
  })
  const progress = iosProgress({
    completedSteps: {
      apiKeyVerified: { keyId: 'KEY1', issuerId: 'ISS1' },
      certificateCreated: { certificateId: RAW_CERT.certificateId, expirationDate: RAW_CERT.expirationDate, teamId: RAW_CERT.teamId, p12Base64: 'P12_BASE64' },
    },
  })
  const res = await runIosEffect('creating-profile', progress, deps)
  assertEquals(res.next, 'duplicate-profile-prompt', 'a duplicate profile routes to the duplicate prompt')
  assertEquals(res.progress.duplicateProfileOrigin, 'creating-profile', 'origin persisted so post-deletion retries the create-new path')
  assertEquals(deps.__lastSaved().duplicateProfileOrigin, 'creating-profile', 'the persisted progress carries the duplicate origin')
  assert(Array.isArray(res.transient.duplicateProfiles), 'surfaces the duplicate profiles in transient')
  assertEquals(res.transient.duplicateProfiles.length, DUP_PROFILES.length, 'all duplicate profiles are offered for deletion')
  assert(!res.progress.completedSteps.profileCreated, 'must NOT persist a profileCreated marker on the duplicate branch')
})

await test('creating-profile (duplicate via checkDuplicateProfiles probe) → duplicate-profile-prompt; origin persisted', async () => {
  const deps = makeDeps({
    checkDuplicateProfiles: async () => DUP_PROFILES,
  })
  const progress = iosProgress({
    completedSteps: {
      apiKeyVerified: { keyId: 'KEY1', issuerId: 'ISS1' },
      certificateCreated: { certificateId: RAW_CERT.certificateId, expirationDate: RAW_CERT.expirationDate, teamId: RAW_CERT.teamId, p12Base64: 'P12_BASE64' },
    },
  })
  const res = await runIosEffect('creating-profile', progress, deps)
  assertEquals(res.next, 'duplicate-profile-prompt', 'a post-create duplicate probe also routes to the prompt')
  assertEquals(res.progress.duplicateProfileOrigin, 'creating-profile', 'origin persisted for the probe branch too')
  assert(!res.progress.completedSteps.profileCreated, 'no profile marker persisted on the probe duplicate branch')
})

await test('creating-profile (generic failure) → error; no profile persisted', async () => {
  const deps = makeDeps({
    createProfile: async () => { throw new Error('apple 500') },
  })
  const progress = iosProgress({
    completedSteps: {
      apiKeyVerified: { keyId: 'KEY1', issuerId: 'ISS1' },
      certificateCreated: { certificateId: RAW_CERT.certificateId, expirationDate: RAW_CERT.expirationDate, teamId: RAW_CERT.teamId, p12Base64: 'P12_BASE64' },
    },
  })
  const res = await runIosEffect('creating-profile', progress, deps)
  assertEquals(res.next, 'error', 'a non-duplicate failure routes to error')
  assert(!res.progress.completedSteps.profileCreated, 'no profile persisted on a generic failure')
})

// ─── 6) Full create-new happy path (driver threads transient as carried) ──────────

await test('DRIVER: verify → verify-app → cert → profile threads transient as carried and reaches saving-credentials with the credential payloads', async () => {
  // verifying-key (the driver carries the .p8 bytes from the input chain).
  const vDeps = makeDeps({ carried: { p8Content: P8_BYTES } })
  const vProgress = iosProgress({ p8Path: '/x.p8', keyId: 'KEY1', issuerId: 'ISS1' })
  const verified = await runIosEffect('verifying-key', vProgress, vDeps)
  assertEquals(verified.next, 'verify-app', 'verify advances to the remote App Store verification gate (PR #2397)')

  // verify-app — the exact-match default deps pass straight through; with no
  // carried pendingVerifyNext (create-new) the exit falls back to cert creation.
  const gDeps = makeDeps({ carried: { p8Content: P8_BYTES, teamId: verified.transient.teamId } })
  const gated = await runIosEffect('verify-app', verified.progress, gDeps)
  assertEquals(gated.next, 'creating-certificate', 'the exact-match verify-app pass advances to cert creation')
  assertEquals(gated.progress.iosBundleIdOverride, APP_ID, 'the verified Release id is persisted as the bundle-id override')

  // The driver captures the transient and threads it back as carried.
  const carriedAfterVerify = { p8Content: P8_BYTES, teamId: verified.transient.teamId }

  // creating-certificate (resume from the persisted apiKeyVerified marker).
  const cDeps = makeDeps({ carried: carriedAfterVerify })
  const certed = await runIosEffect('creating-certificate', gated.progress, cDeps)
  assertEquals(certed.next, 'creating-profile', 'cert advances to profile creation')

  // Driver threads cert/team into the next effect.
  const carriedAfterCert = {
    certData: certed.transient.certData,
    teamId: certed.transient.teamId,
  }

  // creating-profile → saving-credentials with the full credential payloads.
  const pDeps = makeDeps({ carried: carriedAfterCert })
  const profiled = await runIosEffect('creating-profile', certed.progress, pDeps)
  assertEquals(profiled.next, 'saving-credentials', 'profile advances to the save convergence point')
  assertEquals(profiled.transient.certData.p12Base64, 'P12_BASE64', 'the assembled p12 reaches saving-credentials via transient')
  assertEquals(profiled.transient.profileData.profileBase64, PROFILE.profileBase64, 'the profile reaches saving-credentials via transient')
  assertEquals(profiled.transient.teamId, RAW_CERT.teamId, 'the team id reaches saving-credentials via transient')
  // Every create-new marker is now persisted so a resume terminates at saving-credentials.
  assert(profiled.progress.completedSteps.apiKeyVerified, 'apiKeyVerified persisted')
  assert(profiled.progress.completedSteps.certificateCreated, 'certificateCreated persisted')
  assert(profiled.progress.completedSteps.profileCreated, 'profileCreated persisted')
})

// ════════════════════════════════════════════════════════════════════════════════
// BATCH 2b — create-new choice/input VIEWS + reducers + next-step routing
// ════════════════════════════════════════════════════════════════════════════════
//
// The .p8-chain + setup-method fork are pure choice/input screens. For each step
// this section asserts THREE things, the same triple android's tail-engine spec
// asserts:
//   1. the VIEW shape from iosViewForStep (kind + options/prompt/collect),
//   2. the REDUCER from applyIosInput (what field it persists),
//   3. the NEXT step from getIosResumeStep(reducedProgress) — i.e. that a resume
//      from the persisted state lands on the TUI's setStep() target.
// The navigation-only api-key-instructions choice has no persisted next, so its
// routing (picker → p8-method-select | manual → input-p8-path) is asserted via
// the documented choice values instead of resume.

console.log('\n🧪 iOS BATCH 2b — create-new choice/input views + reducers + routing\n')

// ─── setup-method-select (choice) ───────────────────────────────────────────────

await test("iosViewForStep('setup-method-select') is a choice with create | import options", async () => {
  const view = iosViewForStep('setup-method-select', iosProgress())
  assertEquals(view.step, 'setup-method-select', 'view echoes the step')
  assertEquals(view.kind, 'choice', 'setup-method-select is a choice')
  assert(Array.isArray(view.options), 'must expose options')
  const values = view.options.map(o => o.value)
  assert(values.includes('create'), "offers the 'create' (App Store Connect API) fork")
  assert(values.includes('import'), "offers the 'import' (Keychain + Xcode) fork")
})

await test("setup-method-select 'create' → persists setupMethod='create-new'; resume → api-key-instructions", async () => {
  const before = iosProgress({ setupMethod: undefined })
  const after = applyIosInput('setup-method-select', before, { step: 'setup-method-select', value: 'create' })
  assertEquals(after.setupMethod, 'create-new', "the create fork persists setupMethod='create-new'")
  assertEquals(getIosResumeStep(after), 'api-key-instructions', 'create-new with no .p8 inputs resumes at api-key-instructions')
})

await test("setup-method-select 'import' → persists setupMethod='import-existing' (fork routed by resume, not create-new)", async () => {
  const before = iosProgress({ setupMethod: undefined })
  const after = applyIosInput('setup-method-select', before, { step: 'setup-method-select', value: 'import' })
  assertEquals(after.setupMethod, 'import-existing', "the import fork persists setupMethod='import-existing'")
  // import + no importDistribution + no .p8 → import-distribution-mode (NOT the
  // create-new api-key-instructions): proves the fork is persisted, not lost.
  assertEquals(getIosResumeStep(after), 'import-distribution-mode', 'import fork resumes into the import sub-flow')
})

// ─── api-key-instructions (choice, navigation-only) ─────────────────────────────

await test("iosViewForStep('api-key-instructions') is a choice with picker | manual options", async () => {
  const view = iosViewForStep('api-key-instructions', iosProgress())
  assertEquals(view.step, 'api-key-instructions', 'view echoes the step')
  assertEquals(view.kind, 'choice', 'api-key-instructions is a choice')
  const values = (view.options ?? []).map(o => o.value)
  assert(values.includes('picker'), "offers the 'picker' (native dialog) method")
  assert(values.includes('manual'), "offers the 'manual' (type the path) method")
})

await test('api-key-instructions is navigation-only — applyIosInput leaves progress unchanged for either choice', async () => {
  const before = iosProgress()
  const afterPicker = applyIosInput('api-key-instructions', before, { step: 'api-key-instructions', value: 'picker' })
  const afterManual = applyIosInput('api-key-instructions', before, { step: 'api-key-instructions', value: 'manual' })
  assertEquals(JSON.stringify(afterPicker), JSON.stringify(before), "the 'picker' choice persists nothing")
  assertEquals(JSON.stringify(afterManual), JSON.stringify(before), "the 'manual' choice persists nothing")
  // Routing is the driver's job (picker → p8-method-select effect, manual →
  // input-p8-path); resume of an un-advanced create-new progress stays put.
  assertEquals(getIosResumeStep(before), 'api-key-instructions', 'a not-yet-advanced create-new progress remains at api-key-instructions')
})

// ─── input-p8-path (input) ──────────────────────────────────────────────────────

await test("iosViewForStep('input-p8-path') is an input collecting p8Path", async () => {
  const view = iosViewForStep('input-p8-path', iosProgress())
  assertEquals(view.step, 'input-p8-path', 'view echoes the step')
  assertEquals(view.kind, 'input', 'input-p8-path is an input')
  assert(Array.isArray(view.collect) && view.collect.includes('p8Path'), 'collects p8Path')
  assert(typeof view.prompt === 'string' && view.prompt.length > 0, 'carries a prompt')
})

await test('input-p8-path → persists p8Path ONLY (no keyId here); resume → input-key-id', async () => {
  const before = iosProgress({ p8Path: undefined })
  const after = applyIosInput('input-p8-path', before, { step: 'input-p8-path', value: '/Users/me/AuthKey_ABC123.p8' })
  assertEquals(after.p8Path, '/Users/me/AuthKey_ABC123.p8', 'persists the raw .p8 path')
  assert(after.keyId === undefined, 'does NOT persist keyId — extraction is the effect boundary, not the reducer')
  assertEquals(getIosResumeStep(after), 'input-key-id', 'p8Path set + no keyId resumes at input-key-id (matches the TUI setStep)')
})

await test('input-p8-path ignores an empty submission (stays on the step)', async () => {
  const before = iosProgress({ p8Path: undefined })
  const after = applyIosInput('input-p8-path', before, { step: 'input-p8-path', value: '   ' })
  assert(after.p8Path === undefined, 'an empty path is a no-op')
})

// ─── input-key-id (input) ───────────────────────────────────────────────────────

await test("iosViewForStep('input-key-id') surfaces the filename-detected default when a p8Path is present", async () => {
  const view = iosViewForStep('input-key-id', iosProgress({ p8Path: '/Users/me/AuthKey_ABC123.p8' }))
  assertEquals(view.kind, 'input', 'input-key-id is an input')
  assert(Array.isArray(view.collect) && view.collect.includes('keyId'), 'collects keyId')
  assert(view.prompt.includes('ABC123'), 'the prompt offers the key id detected from the AuthKey_<id>.p8 filename')
})

await test("iosViewForStep('input-key-id') falls back to a fresh prompt when no key id is detectable", async () => {
  const view = iosViewForStep('input-key-id', iosProgress({ p8Path: '/Users/me/renamed.p8' }))
  assert(!view.prompt.includes('detected'), 'no detected default → a fresh Key ID prompt')
})

await test('input-key-id (typed value) → persists the typed keyId; resume → input-issuer-id', async () => {
  const before = iosProgress({ p8Path: '/Users/me/AuthKey_ABC123.p8' })
  const after = applyIosInput('input-key-id', before, { step: 'input-key-id', value: 'TYPED99' })
  assertEquals(after.keyId, 'TYPED99', 'a typed Key ID overrides the detected default')
  assertEquals(getIosResumeStep(after), 'input-issuer-id', 'p8Path + keyId + no issuerId resumes at input-issuer-id')
})

await test('input-key-id (empty submit) → reuses the filename-detected default; resume → input-issuer-id', async () => {
  const before = iosProgress({ p8Path: '/Users/me/AuthKey_ABC123.p8' })
  const after = applyIosInput('input-key-id', before, { step: 'input-key-id', value: '' })
  assertEquals(after.keyId, 'ABC123', 'an empty submission reuses the key id detected from the filename')
  assertEquals(getIosResumeStep(after), 'input-issuer-id', 'the reused default still advances to input-issuer-id')
})

await test('input-key-id (empty submit, no detectable default) is a no-op', async () => {
  const before = iosProgress({ p8Path: '/Users/me/renamed.p8' })
  const after = applyIosInput('input-key-id', before, { step: 'input-key-id', value: '' })
  assert(after.keyId === undefined, 'no typed value + no detected default → stays on the step')
})

// ─── input-issuer-id (input) ────────────────────────────────────────────────────

await test("iosViewForStep('input-issuer-id') is an input collecting issuerId", async () => {
  const view = iosViewForStep('input-issuer-id', iosProgress())
  assertEquals(view.kind, 'input', 'input-issuer-id is an input')
  assert(Array.isArray(view.collect) && view.collect.includes('issuerId'), 'collects issuerId')
})

await test('input-issuer-id → persists issuerId; resume → verifying-key', async () => {
  const before = iosProgress({ p8Path: '/Users/me/AuthKey_ABC123.p8', keyId: 'ABC123' })
  const after = applyIosInput('input-issuer-id', before, { step: 'input-issuer-id', value: 'ISSUER-UUID' })
  assertEquals(after.issuerId, 'ISSUER-UUID', 'persists the issuer id')
  assertEquals(getIosResumeStep(after), 'verifying-key', 'all three .p8 inputs present → resumes at verifying-key')
})

await test('input-issuer-id ignores an empty submission (stays on the step)', async () => {
  const before = iosProgress({ p8Path: '/Users/me/AuthKey_ABC123.p8', keyId: 'ABC123' })
  const after = applyIosInput('input-issuer-id', before, { step: 'input-issuer-id', value: '  ' })
  assert(after.issuerId === undefined, 'an empty issuer id is a no-op')
})

// ─── Full create-new choice/input chain (resume lands at each point) ─────────────

await test('CHAIN: setup-method-select → api-key-instructions → input-p8-path → input-key-id → input-issuer-id → verifying-key', async () => {
  // welcome is the entry; the fork is reached from backing-up/platform-select and
  // is the first persisted-state choice. Walk the create-new chain reducer-by-
  // reducer and confirm EACH resume point lands on the next step exactly.

  // 1) setup-method-select (create) → api-key-instructions
  let p = iosProgress({ setupMethod: undefined })
  p = applyIosInput('setup-method-select', p, { step: 'setup-method-select', value: 'create' })
  assertEquals(p.setupMethod, 'create-new', 'fork persisted')
  assertEquals(getIosResumeStep(p), 'api-key-instructions', 'resume #1 → api-key-instructions')

  // 2) api-key-instructions (manual) → input-p8-path (navigation-only; driver routes)
  const beforeApi = JSON.stringify(p)
  p = applyIosInput('api-key-instructions', p, { step: 'api-key-instructions', value: 'manual' })
  assertEquals(JSON.stringify(p), beforeApi, 'api-key-instructions persists nothing (navigation-only)')

  // 3) input-p8-path → input-key-id
  p = applyIosInput('input-p8-path', p, { step: 'input-p8-path', value: '/Users/me/AuthKey_ABC123.p8' })
  assertEquals(p.p8Path, '/Users/me/AuthKey_ABC123.p8', 'p8Path persisted')
  assertEquals(getIosResumeStep(p), 'input-key-id', 'resume #2 → input-key-id')

  // 4) input-key-id (Enter reuses detected ABC123) → input-issuer-id
  p = applyIosInput('input-key-id', p, { step: 'input-key-id', value: '' })
  assertEquals(p.keyId, 'ABC123', 'detected keyId reused')
  assertEquals(getIosResumeStep(p), 'input-issuer-id', 'resume #3 → input-issuer-id')

  // 5) input-issuer-id → verifying-key
  p = applyIosInput('input-issuer-id', p, { step: 'input-issuer-id', value: 'ISSUER-UUID' })
  assertEquals(p.issuerId, 'ISSUER-UUID', 'issuerId persisted')
  assertEquals(getIosResumeStep(p), 'verifying-key', 'resume #4 → verifying-key (the .p8 chain is complete)')

  // The chain persisted ONLY the create-new fields — no secret rode into progress.
  assert(!p.completedSteps.apiKeyVerified, 'verifying-key has not run yet — no apiKeyVerified marker')
})

// ─── HOSTILE-REVIEW P1: Apple bundle id ≠ Capgo appId (create-new effects) ─────
//
// progress.appId is the CAPGO app key — when plugins.CapacitorUpdater.appId is
// configured it is NOT the Apple bundle id. With no verified iosBundleIdOverride
// the engine must resolve the bundle id from the DETECTED Release id
// (deps.detectBundleIds, the same source verify-app gates on), falling back to
// progress.appId only when nothing was detected.

const DETECTED_RELEASE_ID = 'com.real.releaseid'
function mismatchedDetect() {
  return {
    pbxproj: { value: DETECTED_RELEASE_ID, source: 'pbxproj-release', label: 'project.pbxproj (Release config)' },
    debug: null,
    plist: null,
    capacitor: { value: APP_ID, source: 'capacitor-config', label: 'capacitor.config.ts (appId)' },
    recommended: { value: DETECTED_RELEASE_ID, source: 'pbxproj-release', label: 'project.pbxproj (Release config)' },
    mismatch: true,
    debugReleaseDiffer: false,
    releaseResolved: true,
    candidates: [],
  }
}

await test('creating-profile uses the DETECTED Release bundle id (not the Capgo appId) for createProfile + the duplicate probe when no override exists', async () => {
  const deps = makeDeps({ detectBundleIds: mismatchedDetect })
  const progress = iosProgress({ completedSteps: { certificateCreated: { ...RAW_CERT, p12Base64: 'P12_BASE64' } } })
  const res = await runIosEffect('creating-profile', progress, deps)
  assertEquals(res.next, 'saving-credentials', 'happy path still advances to the saving-credentials convergence point')
  const create = deps.__calls.find(c => c.name === 'createProfile')
  assert(create, 'createProfile must fire')
  assertEquals(create.args[0].bundleId, DETECTED_RELEASE_ID, 'createProfile must receive the detected Release bundle id, not the Capgo app key')
  const dup = deps.__calls.find(c => c.name === 'checkDuplicateProfiles')
  assert(dup, 'duplicate probe fires on the happy path')
  assertEquals(dup.args[0], DETECTED_RELEASE_ID, 'the duplicate probe must use the SAME resolved bundle id')
})

await test('creating-profile: a verified iosBundleIdOverride still beats the detected Release id', async () => {
  const deps = makeDeps({ detectBundleIds: mismatchedDetect })
  const progress = iosProgress({
    iosBundleIdOverride: 'com.verified.override',
    completedSteps: { certificateCreated: { ...RAW_CERT, p12Base64: 'P12_BASE64' } },
  })
  await runIosEffect('creating-profile', progress, deps)
  const create = deps.__calls.find(c => c.name === 'createProfile')
  assertEquals(create.args[0].bundleId, 'com.verified.override', 'the persisted override has top priority')
})

// ─── HOSTILE-REVIEW P2: stale p8Path must re-prompt, not leak raw fs errors ────

await test('verifying-key with a STALE p8Path (readFile throws ENOENT) throws the NeedP8-style .p8 error, not the raw fs error', async () => {
  // No carried.p8Content (crash-recovery resume) + an unreadable persisted path.
  const deps = makeDeps({
    readFile: async () => { throw Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' }) },
  })
  const progress = iosProgress({ p8Path: '/Users/me/AuthKey_GONE.p8', keyId: 'KEY1', issuerId: 'ISS1' })
  let thrown = null
  try {
    await runIosEffect('verifying-key', progress, deps)
  }
  catch (e) {
    thrown = e
  }
  assert(thrown, 'verifying-key must fail fast when the .p8 cannot be re-read')
  assert(/\.p8/.test(thrown.message), `the error must carry the '.p8' marker so the driver's re-prompt matcher fires (got: ${thrown.message})`)
  assert(!/ENOENT/.test(thrown.message), `the raw fs error must NOT bypass the re-prompt routing (got: ${thrown.message})`)
  assert(!deps.__calls.some(c => c.name === 'verifyApiKey'), 'must not attempt the Apple verify without the .p8 bytes')
})
// ─── Summary ─────────────────────────────────────────────────────────────────────

console.log(`\n${testsPassed} passed, ${testsFailed} failed`)
if (testsFailed > 0)
  process.exit(1)
