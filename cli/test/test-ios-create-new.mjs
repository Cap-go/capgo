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
} = await import('../src/build/onboarding/ios/flow.ts')

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

await test('verifying-key (success) → creating-certificate; persists completedSteps.apiKeyVerified; transient apiKey + teamId', async () => {
  const deps = makeDeps({ carried: { p8Content: P8_BYTES } })
  const progress = iosProgress({ p8Path: '/Users/me/AuthKey_ABC123.p8', keyId: 'KEY1', issuerId: 'ISS1' })
  const res = await runIosEffect('verifying-key', progress, deps)
  assertEquals(res.next, 'creating-certificate', 'a verified key advances to certificate creation (create-new)')
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
  assertEquals(res.next, 'creating-certificate', 'resume still verifies after re-reading the .p8 from disk')
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

await test('DRIVER: verify → cert → profile threads transient as carried and reaches saving-credentials with the credential payloads', async () => {
  // verifying-key (the driver carries the .p8 bytes from the input chain).
  const vDeps = makeDeps({ carried: { p8Content: P8_BYTES } })
  const vProgress = iosProgress({ p8Path: '/x.p8', keyId: 'KEY1', issuerId: 'ISS1' })
  const verified = await runIosEffect('verifying-key', vProgress, vDeps)
  assertEquals(verified.next, 'creating-certificate', 'verify advances to cert creation')

  // The driver captures the transient and threads it back as carried.
  const carriedAfterVerify = { p8Content: P8_BYTES, teamId: verified.transient.teamId }

  // creating-certificate (resume from the persisted apiKeyVerified marker).
  const cDeps = makeDeps({ carried: carriedAfterVerify })
  const certed = await runIosEffect('creating-certificate', verified.progress, cDeps)
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

// ─── Summary ─────────────────────────────────────────────────────────────────────

console.log(`\n${testsPassed} passed, ${testsFailed} failed`)
if (testsFailed > 0)
  process.exit(1)
