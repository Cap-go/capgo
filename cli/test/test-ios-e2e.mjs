#!/usr/bin/env node
/**
 * iOS BATCH 8 — end-to-end engine spec.
 *
 * This file is the headless DRIVER for the WHOLE iOS onboarding engine. It runs
 * the same loop the TUI / MCP driver runs — resumeStep → viewForStep → (applyIosInput
 * for choice/input) | (runIosEffect for auto/error) — threading IosEffectResult.transient
 * back into the NEXT effect as deps.carried (exactly as the Ink TUI mirrors its
 * React state). It proves the COMPLETE happy paths reach build-complete:
 *
 *   (a) CREATE-NEW  — setup-method-select(create) → api-key-instructions →
 *       input-p8-path → input-key-id → input-issuer-id → verifying-key →
 *       creating-certificate → creating-profile → saving-credentials → [tail] →
 *       build-complete.
 *   (b) IMPORT (ad_hoc, on-disk profile) — setup-method-select(import) →
 *       import-distribution-mode(ad_hoc) → import-scanning →
 *       import-validating-all-certs → import-pick-identity → import-pick-profile →
 *       import-export-warning → import-exporting →
 *       saving-credentials → [tail] → build-complete.
 *   (c) IMPORT (app_store, create-profile via ASC key) — import-no-match-recovery
 *       (create, no ASC key) → api-key-instructions → … → verifying-key (which
 *       resumes pendingRecoveryAction) → import-create-profile-only →
 *       import-export-warning → import-exporting → saving-credentials → [tail] →
 *       build-complete.
 *
 * It also asserts:
 *   - NO secret / ephemeral state ever lands in progress.json (only the documented
 *     persisted markers). chosenIdentity / chosenProfile / certData / profileData /
 *     the p12 / passphrase / error / retryStep are NEVER persisted.
 *   - an ERROR path: a failing effect routes to the error step, whose VIEW renders
 *     the failing step's message, and whose RESOLVER routes retry → the failing
 *     step (and 'restart' → welcome, 'exit' → the terminal sink).
 *
 * The engine is IO-FREE: every Apple-API / CSR / keychain / fs / tail touch is an
 * injected dep.
 *
 * DRIVER MODEL — the engine's effect steps return an explicit `next`; the driver
 * uses it verbatim, with two TUI-faithful exceptions encoded via `effectRoutes`:
 *   - after import-scanning the TUI runs the eager batch availability pass
 *     (import-validating-all-certs) BEFORE rendering the identity picker; and
 *   - validation's next is the identity picker.
 * Choice/input steps either re-derive via getIosResumeStep (persisted-driven) or,
 * for EPHEMERAL-branching picks, record the selection into carried and re-drive the
 * step as a resolver effect (`resolveEffect`). welcome → platform-select are
 * MASTER-FLOW auto steps (not owned by runIosEffect); the engine owns from
 * setup-method-select, so the create/import drives start there.
 */
import { Buffer } from 'node:buffer'
import process from 'node:process'

const {
  runIosEffect,
  iosViewForStep,
  applyIosInput,
} = await import('../src/build/onboarding/ios/flow.ts')

const { getIosResumeStep } = await import('../src/build/onboarding/ios/progress.ts')

console.log('🧪 iOS BATCH 8 — end-to-end engine (create-new + both import forks → build-complete) + error step\n')

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

const RAW_CERT = { certificateId: 'CERT1', certificateContent: 'BASE64_DER', expirationDate: '2027-01-01', teamId: 'TEAM123' }
const CREATED_PROFILE = { profileId: 'PROF1', profileName: 'Capgo com.example.app AppStore', profileBase64: 'UFJPRklMRQ==', expirationDate: '2027-01-01T00:00:00.000Z' }

const IDENTITY_A = { sha1: 'a'.repeat(40), name: 'Apple Distribution: Acme (TEAMAAA)', type: 'distribution', teamName: 'Acme', teamId: 'TEAMAAA' }
const IDENTITY_B = { sha1: 'b'.repeat(40), name: 'Apple Distribution: Beta (TEAMAAA)', type: 'distribution', teamName: 'Beta', teamId: 'TEAMAAA' }

// On-disk ad_hoc profile that matches IDENTITY_A + this app.
const PROFILE_ON_DISK = {
  path: '/Users/me/Library/MobileDevice/Provisioning Profiles/A.mobileprovision',
  uuid: 'ONDISK-UUID',
  name: 'Acme Ad Hoc',
  applicationIdentifier: `TEAMAAA.${APP_ID}`,
  bundleId: APP_ID,
  teamId: 'TEAMAAA',
  expirationDate: '2027-01-01T00:00:00.000Z',
  profileType: 'ad_hoc',
  certificateSha1s: [IDENTITY_A.sha1],
}

const EXPORTED_P12 = { base64: 'UDEyLUJBU0U2NA==', passphrase: 'keychain-pass-xyz' }
const RESOLVED_ENTRIES = [
  { key: 'BUILD_CERTIFICATE_BASE64', value: 'cccc', masked: true },
  { key: 'CAPGO_TOKEN', value: 'resolved-capgo-key', masked: true },
]

// ─── progress factory ───────────────────────────────────────────────────────────

function iosProgress(overrides = {}) {
  const { completedSteps: completedOverrides, ...rest } = overrides
  return {
    platform: 'ios',
    appId: APP_ID,
    startedAt: '2026-06-03T00:00:00.000Z',
    ...rest,
    completedSteps: { ...completedOverrides },
  }
}

// ─── Mocked deps ──────────────────────────────────────────────────────────────────

function makeDeps(overrides = {}) {
  const calls = []
  let lastSaved = null

  const deps = {
    appId: APP_ID,

    // create-new chain
    verifyApiKey: async (...a) => { calls.push({ name: 'verifyApiKey', args: a }); return { teamId: RAW_CERT.teamId } },
    generateCsr: () => { calls.push({ name: 'generateCsr', args: [] }); return { csr: 'CSR', privateKeyPem: 'PRIV' } },
    createCertificate: async (...a) => { calls.push({ name: 'createCertificate', args: a }); return { ...RAW_CERT } },
    createP12: () => { calls.push({ name: 'createP12', args: [] }); return 'P12_BASE64' },
    createProfile: async (...a) => { calls.push({ name: 'createProfile', args: a }); return { ...CREATED_PROFILE } },
    checkDuplicateProfiles: async () => { calls.push({ name: 'checkDuplicateProfiles', args: [] }); return [] },
    listCertificates: async () => { calls.push({ name: 'listCertificates', args: [] }); return [] },

    // import chain
    // verify-app (remote App Store verification, PR #2397) — exact-match by
    // default so the create-new + import app_store drives pass straight through.
    listApps: async () => { calls.push({ name: 'listApps', args: [] }); return [{ id: 'ASC1', bundleId: APP_ID, name: 'Example App' }] },
    listBundleIds: async () => { calls.push({ name: 'listBundleIds', args: [] }); return [APP_ID] },
    detectBundleIds: () => {
      calls.push({ name: 'detectBundleIds', args: [] })
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
    writeReleaseBundleId: () => { calls.push({ name: 'writeReleaseBundleId', args: [] }); return { changed: 1 } },
    openExternal: async (url) => { calls.push({ name: 'openExternal', args: [url] }) },

    listSigningIdentities: async () => { calls.push({ name: 'listSigningIdentities', args: [] }); return [IDENTITY_A, IDENTITY_B] },
    scanProvisioningProfiles: async () => { calls.push({ name: 'scanProvisioningProfiles', args: [] }); return [PROFILE_ON_DISK] },
    classifyCertAvailability: async (identity) => {
      calls.push({ name: 'classifyCertAvailability', args: [identity.sha1] })
      return { available: true, appleCertId: `APPLE_${identity.sha1.slice(0, 4)}` }
    },
    listProfilesForCert: async () => { calls.push({ name: 'listProfilesForCert', args: [] }); return [] },
    findCertIdBySha1: async (sha1) => { calls.push({ name: 'findCertIdBySha1', args: [sha1] }); return 'APPLE-CERT-ID' },
    ensureBundleId: async (b) => { calls.push({ name: 'ensureBundleId', args: [b] }) },
    exportP12FromKeychain: async (sha1) => { calls.push({ name: 'exportP12FromKeychain', args: [sha1] }); return { ...EXPORTED_P12 } },

    // fs
    readFile: async (...a) => { calls.push({ name: 'readFile', args: a }); return P8_BYTES },
    openP8FilePicker: async () => { calls.push({ name: 'openP8FilePicker', args: [] }); return '/Users/me/AuthKey_ABC123.p8' },
    isMacOS: () => true,

    // persistence
    saveProgress: async (appId, progress) => { calls.push({ name: 'saveProgress', args: [appId, progress] }); lastSaved = progress },
    loadProgress: async () => null,

    // tail (TailEffectDeps, mapped 1:1 by toTailDeps)
    updateSavedCredentials: async (...a) => { calls.push({ name: 'updateSavedCredentials', args: a }) },
    deleteProgress: async (...a) => { calls.push({ name: 'deleteProgress', args: a }) },
    createCiSecretEntries: () => { calls.push({ name: 'createCiSecretEntries', args: [] }); return RESOLVED_ENTRIES },
    detectCiSecretTargets: () => { calls.push({ name: 'detectCiSecretTargets', args: [] }); return { targets: [], setup: [], notes: ['no git remote'] } },
    getCiSecretRepoLabelAsync: async () => 'octo/repo',
    listExistingCiSecretKeysAsync: async () => [],
    uploadCiSecretsAsync: async () => {},
    exportCredentialsToEnv: () => ({ kind: 'written', path: '/tmp/.env', fieldCount: 5 }),
    defaultExportPath: () => '/tmp/.env',
    generateWorkflow: () => ({ content: 'name: capgo\n' }),
    writeWorkflowFile: () => ({ kind: 'written', absolutePath: '/repo/.github/workflows/capgo.yml' }),
    requestBuildInternal: async () => ({ success: true }),

    onStatus: () => {},
    onLog: () => {},

    ...overrides,
  }
  deps.__calls = calls
  deps.__lastSaved = () => lastSaved
  return deps
}

// ─── Persisted-state allowlist guard ──────────────────────────────────────────────
//
// The ONLY keys the engine is allowed to persist. Anything else in a persisted
// snapshot is a secret/ephemeral leak (the class of bug the audit's ephemeral
// inventory + BATCH 8's error transient guard against).
const ALLOWED_PROGRESS_KEYS = new Set([
  'platform', 'appId', 'startedAt',
  'setupMethod', 'importDistribution',
  'p8Path', 'keyId', 'issuerId',
  'iosBundleId', 'iosBundleIdOverride', 'iosBundleIdContextAppId', 'appIdConfirmed', 'pendingAppIdNext',
  '_credentialsExistGate', 'duplicateProfileOrigin', 'pendingRecoveryAction',
  'completedSteps',
  // tail-written persisted fields
  'setupMode', 'ciSecretTarget', 'selectedPackageManager', 'buildScriptChoice', 'envExportTargetPath',
])
const ALLOWED_COMPLETED_KEYS = new Set([
  'apiKeyVerified', 'certificateCreated', 'profileCreated',
  'credentialsSaved', 'buildRequested', 'ciSecretsUploaded',
])
const FORBIDDEN_SUBSTRINGS = [
  EXPORTED_P12.base64, EXPORTED_P12.passphrase,
  'chosenIdentity', 'chosenProfile', 'importMatches', 'noMatchReason',
  'certData', 'profileData', 'retryStep',
  'pendingVerifyNext', 'verifyAction', 'verifyApps',
]

function assertProgressClean(progress, label) {
  for (const key of Object.keys(progress))
    assert(ALLOWED_PROGRESS_KEYS.has(key), `${label}: progress leaked a non-allowlisted key "${key}"`)
  for (const key of Object.keys(progress.completedSteps ?? {}))
    assert(ALLOWED_COMPLETED_KEYS.has(key), `${label}: completedSteps leaked a non-allowlisted marker "${key}"`)
  const json = JSON.stringify(progress)
  for (const forbidden of FORBIDDEN_SUBSTRINGS)
    assert(!json.includes(forbidden), `${label}: persisted progress leaked forbidden state "${forbidden}"`)
}

// ─── The headless DRIVER ──────────────────────────────────────────────────────────
//
// `script[step]` is the driver action when the engine surfaces a choice/input VIEW:
//   { input }        → applyIosInput; next is re-derived via getIosResumeStep …
//   { next }         → … unless the script forces an explicit driver route (the
//                      navigation-only api-key-instructions, or a getImportEntryStep
//                      route the engine doesn't express through resume).
//   { carried, resolveEffect } → an EPHEMERAL-branching pick: record the selection
//                      into carried, then re-drive the step as a resolver effect.
// `effectRoutes[step]` lets the driver override an EFFECT's `next` to model the TUI's
// eager sequencing (import-scanning → import-validating-all-certs before the picker).
const MAX_STEPS = 80

async function drive({ startProgress, startStep, script = {}, effectRoutes = {}, depsOverrides = {}, carriedSeed = {}, onPersist }) {
  let progress = startProgress
  let carried = { ...carriedSeed }
  let step = startStep ?? getIosResumeStep(progress)
  const visited = []

  for (let i = 0; i < MAX_STEPS; i++) {
    visited.push(step)
    const view = iosViewForStep(step, progress, { appId: APP_ID, ...carried })

    if (view.kind === 'done')
      return { step, progress, carried, visited, view }

    // choice / input / error → a SCRIPT-DRIVEN step. The error VIEW (kind 'error')
    // is driven exactly like an ephemeral-branching choice: the script records the
    // user's pick (errorAction) into carried, then re-drives the error resolver
    // effect to get the retry/restart/exit route — NEVER via getIosResumeStep
    // (which can never return 'error'), so the driver can't spin on the error sink.
    if (view.kind === 'choice' || view.kind === 'input' || view.kind === 'error') {
      const action = script[step]
      assert(action, `script missing an action for ${view.kind} step "${step}" (visited: ${visited.join(' → ')})`)
      if (action.input) {
        progress = applyIosInput(step, progress, action.input)
        assertProgressClean(progress, `applyIosInput(${step})`)
      }
      if (action.carried)
        carried = { ...carried, ...action.carried }
      if (action.resolveEffect) {
        const deps = makeDeps({ carried, ...depsOverrides })
        const res = await runIosEffect(step, progress, deps)
        progress = res.progress
        assertProgressClean(progress, `runIosEffect(${step}) [resolver]`)
        if (res.transient)
          carried = { ...carried, ...res.transient }
        if (deps.__lastSaved())
          onPersist?.(deps.__lastSaved())
        step = effectRoutes[step] ?? res.next
      }
      else if (action.next) {
        step = action.next
      }
      else {
        step = getIosResumeStep(progress)
      }
      continue
    }

    // auto | error → run the effect.
    const deps = makeDeps({ carried, ...depsOverrides })
    const res = await runIosEffect(step, progress, deps)
    progress = res.progress
    assertProgressClean(progress, `runIosEffect(${step})`)
    if (res.transient)
      carried = { ...carried, ...res.transient }
    if (deps.__lastSaved())
      onPersist?.(deps.__lastSaved())
    assert(res.next, `effect step "${step}" must return an explicit next`)
    step = effectRoutes[step] ?? res.next
  }
  throw new Error(`driver exceeded ${MAX_STEPS} steps (visited: ${visited.join(' → ')})`)
}

// ════════════════════════════════════════════════════════════════════════════════
// (0) Entry shape
// ════════════════════════════════════════════════════════════════════════════════

await test('entry: welcome / platform-select are auto (master-flow); setup-method-select is the engine fork', async () => {
  assertEquals(iosViewForStep('welcome', iosProgress(), { appId: APP_ID }).kind, 'auto', 'welcome is master-flow auto')
  assertEquals(iosViewForStep('platform-select', iosProgress(), { appId: APP_ID }).kind, 'auto', 'platform-select is master-flow auto')
  assertEquals(iosViewForStep('setup-method-select', iosProgress(), { appId: APP_ID }).kind, 'choice', 'setup-method-select is the engine fork')
})

// ════════════════════════════════════════════════════════════════════════════════
// (a) CREATE-NEW happy path → build-complete
// ════════════════════════════════════════════════════════════════════════════════

await test('(a) CREATE-NEW: setup-method(create) → .p8 chain → cert → profile → tail → build-complete', async () => {
  const persisted = []
  const result = await drive({
    startProgress: iosProgress({ setupMethod: undefined }),
    startStep: 'setup-method-select',
    onPersist: p => persisted.push(p),
    script: {
      'setup-method-select': { input: { step: 'setup-method-select', value: 'create' } },
      'api-key-instructions': { input: { step: 'api-key-instructions', value: 'manual' }, next: 'input-p8-path' },
      'input-p8-path': { input: { step: 'input-p8-path', value: '/Users/me/AuthKey_ABC123.p8' } },
      'input-key-id': { input: { step: 'input-key-id', value: '' } },
      'input-issuer-id': { input: { step: 'input-issuer-id', value: 'ISSUER-UUID' } },
      // ask-build is a tail CHOICE (yes/no) with no persisted reducer — picking
      // 'no' (Not now) finishes the wizard. It's an ephemeral driver route, so
      // model it with an explicit `next` (NOT applyIosInput/getIosResumeStep,
      // which would re-derive saving-credentials and loop forever).
      'ask-build': { next: 'build-complete' },
    },
  })
  assertEquals(result.step, 'build-complete', `create-new must reach build-complete (visited: ${result.visited.join(' → ')})`)
  for (const s of ['verifying-key', 'verify-app', 'creating-certificate', 'creating-profile', 'saving-credentials'])
    assert(result.visited.includes(s), `passed through ${s}`)
  assert(result.visited.indexOf('verify-app') > result.visited.indexOf('verifying-key')
    && result.visited.indexOf('verify-app') < result.visited.indexOf('creating-certificate'), 'verify-app runs BETWEEN verifying-key and creating-certificate (PR #2397)')
  assert(persisted.some(p => p.iosBundleIdOverride === APP_ID), 'the exact-match pass persisted the verified bundle-id override')
  assert(result.carried.certData && result.carried.profileData, 'cert/profile export payloads rode transient into the tail')
  assert(persisted.length > 0, 'progress was persisted along the way')
})

await test('(a) CREATE-NEW: a saved (credentialsSaved) progress resumes onto ask-build (double-build guard)', async () => {
  const saved = iosProgress({
    setupMethod: 'create-new', p8Path: '/x.p8', keyId: 'K', issuerId: 'I',
    completedSteps: {
      apiKeyVerified: { keyId: 'K', issuerId: 'I' },
      certificateCreated: { certificateId: 'C', expirationDate: '2027', teamId: 'T', p12Base64: 'p12' },
      profileCreated: { profileId: 'P', profileName: 'N', profileBase64: 'b' },
      credentialsSaved: { savedAt: '2026-06-03T01:00:00.000Z' },
    },
  })
  assertEquals(getIosResumeStep(saved), 'ask-build', 'resume guards the double-build by landing on ask-build')
})

// ════════════════════════════════════════════════════════════════════════════════
// (b) IMPORT (ad_hoc, on-disk profile) happy path → build-complete
// ════════════════════════════════════════════════════════════════════════════════

await test('(b) IMPORT ad_hoc: distribution(ad_hoc) → scan → validate → pick identity → pick profile → export → tail → build-complete', async () => {
  const persisted = []
  const result = await drive({
    startProgress: iosProgress({ setupMethod: undefined }),
    startStep: 'setup-method-select',
    onPersist: p => persisted.push(p),
    // After the silent scan, the TUI runs the eager batch availability pass before
    // rendering the picker; model that with an effect route. validation → picker.
    effectRoutes: {
      'import-scanning': 'import-validating-all-certs',
    },
    script: {
      'setup-method-select': { input: { step: 'setup-method-select', value: 'import' } },
      // import-distribution-mode persists setupMethod/importDistribution; the master
      // flow then runs the silent discovery (import-scanning) before the picker.
      'import-distribution-mode': { input: { step: 'import-distribution-mode', value: 'ad_hoc' }, next: 'import-scanning' },
      // import-pick-identity: pick A (which has an on-disk ad_hoc profile) → import-pick-profile.
      'import-pick-identity': { carried: { chosenIdentity: IDENTITY_A }, resolveEffect: true },
      // import-pick-profile: pick the on-disk profile → import-export-warning.
      'import-pick-profile': { carried: { chosenProfile: PROFILE_ON_DISK }, resolveEffect: true },
      // import-export-warning: 'go' → import-exporting (PR #2458 removed the
      // swiftc compile detour; the precompiled signed helper is resolved inside
      // the export step).
      'import-export-warning': { carried: { exportWarningAction: 'go' }, resolveEffect: true },
      // ask-build is a tail CHOICE (yes/no) with no persisted reducer — picking
      // 'no' (Not now) finishes the wizard. It's an ephemeral driver route, so
      // model it with an explicit `next` (NOT applyIosInput/getIosResumeStep,
      // which would re-derive saving-credentials and loop forever).
      'ask-build': { next: 'build-complete' },
    },
  })
  assertEquals(result.step, 'build-complete', `import ad_hoc must reach build-complete (visited: ${result.visited.join(' → ')})`)
  for (const s of ['import-scanning', 'import-validating-all-certs', 'import-pick-identity', 'import-pick-profile', 'import-export-warning', 'import-exporting', 'saving-credentials'])
    assert(result.visited.includes(s), `passed through ${s} (visited: ${result.visited.join(' → ')})`)
  // The imported export payload rode transient only; nothing of it was persisted.
  assert(result.carried.certData && result.carried.profileData && result.carried.importedP12Password, 'the export payload rode transient into saving-credentials')
  for (const p of persisted)
    assertProgressClean(p, 'import ad_hoc persisted snapshot')
})

// ════════════════════════════════════════════════════════════════════════════════
// (c) IMPORT (app_store, create-profile via ASC key) — the .p8 recovery detour
// ════════════════════════════════════════════════════════════════════════════════

await test('(c) IMPORT app_store recovery: no-match-recovery(create, no ASC key) → .p8 chain → verifying-key resumes D2 → export → build-complete', async () => {
  const persisted = []
  const result = await drive({
    startProgress: iosProgress({ setupMethod: 'import-existing', importDistribution: 'app_store' }),
    // Begin the drive at the recovery hub (an ephemeral step reached after the
    // identity picker found no on-disk profile + no ASC key). Seed the chosen
    // identity + the sticky no-match reason the upstream step set.
    startStep: 'import-no-match-recovery',
    carriedSeed: { chosenIdentity: IDENTITY_A, noMatchReason: 'no-profile-on-disk' },
    onPersist: p => persisted.push(p),
    depsOverrides: {
      scanProvisioningProfiles: async () => [], // no on-disk profile → recovery is the path
    },
    script: {
      // 'create' + NO ASC key → api-key-instructions, persisting pendingRecoveryAction.
      'import-no-match-recovery': { carried: { recoveryAction: 'create' }, resolveEffect: true },
      'api-key-instructions': { input: { step: 'api-key-instructions', value: 'manual' }, next: 'input-p8-path' },
      'input-p8-path': { input: { step: 'input-p8-path', value: '/Users/me/AuthKey_ABC123.p8' } },
      'input-key-id': { input: { step: 'input-key-id', value: '' } },
      'input-issuer-id': { input: { step: 'input-issuer-id', value: 'ISSUER-UUID' } },
      // verifying-key (effect) sees pendingRecoveryAction → import-create-profile-only.
      // import-create-profile-only (effect) → import-export-warning.
      'import-export-warning': { carried: { exportWarningAction: 'go' }, resolveEffect: true },
      // ask-build is a tail CHOICE (yes/no) with no persisted reducer — picking
      // 'no' (Not now) finishes the wizard. It's an ephemeral driver route, so
      // model it with an explicit `next` (NOT applyIosInput/getIosResumeStep,
      // which would re-derive saving-credentials and loop forever).
      'ask-build': { next: 'build-complete' },
    },
  })
  assertEquals(result.step, 'build-complete', `import app_store recovery must reach build-complete (visited: ${result.visited.join(' → ')})`)
  assert(result.visited.includes('import-create-profile-only'), 'recovery routed through import-create-profile-only (D2)')
  assert(result.visited.includes('verifying-key'), 'the .p8 chain ran verifying-key')
  assert(result.visited.indexOf('verifying-key') < result.visited.indexOf('import-create-profile-only'), 'verifying-key ran BEFORE the resumed D2 step')
  assert(!result.visited.includes('verify-app'), 'the pendingRecoveryAction resume NEVER detours via verify-app (PR #2397 leaves it unchanged)')
  assert(persisted.some(p => p.pendingRecoveryAction === 'import-create-profile-only'), 'pendingRecoveryAction was persisted while detouring through the .p8 chain')
  for (const p of persisted)
    assertProgressClean(p, 'app_store recovery persisted snapshot')
})

// ════════════════════════════════════════════════════════════════════════════════
// (d) ERROR step — view renders the message; resolver routes retry/restart/exit.
// ════════════════════════════════════════════════════════════════════════════════

await test('(d) ERROR: a failing verifying-key effect → next=error; transient carries the message + retryStep', async () => {
  const deps = makeDeps({
    carried: { p8Content: P8_BYTES },
    verifyApiKey: async () => { throw new Error('API key verification failed: 401 Unauthorized') },
  })
  const progress = iosProgress({ setupMethod: 'create-new', p8Path: '/x.p8', keyId: 'K', issuerId: 'I' })
  const res = await runIosEffect('verifying-key', progress, deps)
  assertEquals(res.next, 'error', 'a rejected key routes to the error step')
  assert(res.transient && res.transient.error, 'the effect surfaces the message in transient (so the view has content)')
  assert(res.transient.error.includes('verification failed'), "the message is the failing step's message")
  assertEquals(res.transient.retryStep, 'verifying-key', 'the retryStep is the failing step (recoverable)')
  assert(!deps.__calls.some(c => c.name === 'saveProgress'), 'a verify failure persists nothing')
  assertProgressClean(res.progress, 'error result progress')
})

await test('(d) ERROR: a 403 unsigned-agreement at verifying-key surfaces the agreement guidance (not a key re-check)', async () => {
  // Mirrors the real verifyApiKey behavior for Apple 403
  // FORBIDDEN.REQUIRED_AGREEMENTS_MISSING_OR_EXPIRED: a VALID key blocked by an
  // unsigned/expired agreement. The user must NOT be told to re-check the key.
  const agreementMsg = 'Apple is blocking App Store Connect API access because your developer account has a required agreement that is unsigned or has expired.\n'
    + '  - Open "Business" (Agreements, Tax, and Banking) and accept the pending or updated agreement'
  const deps = makeDeps({
    carried: { p8Content: P8_BYTES },
    verifyApiKey: async () => { throw new Error(agreementMsg) },
  })
  const progress = iosProgress({ setupMethod: 'create-new', p8Path: '/x.p8', keyId: 'K', issuerId: 'I' })
  const res = await runIosEffect('verifying-key', progress, deps)
  assertEquals(res.next, 'error', 'an unsigned-agreement 403 routes to the error step')
  assert(res.transient && res.transient.error.includes('required agreement'), 'the error surfaces the agreement guidance')
  assert(!res.transient.error.includes('Key ID matches'), 'it does NOT tell the user to re-check the key (the key is valid)')
  assertEquals(res.transient.retryStep, 'verifying-key', 'recoverable: retry routes back to verifying-key once the agreement is signed')
  const view = iosViewForStep('error', iosProgress(), { appId: APP_ID, error: res.transient.error, retryStep: 'verifying-key' })
  assert(view.message.includes('Agreements, Tax, and Banking'), 'the error VIEW renders the actionable agreement message')
})

await test('(d) ERROR VIEW: iosViewForStep(error) renders the carried message + Try again / Restart / Exit', async () => {
  const view = iosViewForStep('error', iosProgress(), { appId: APP_ID, error: 'API key verification failed: 401 Unauthorized', retryStep: 'verifying-key' })
  assertEquals(view.kind, 'error', 'the error step is kind=error')
  assertEquals(view.message, 'API key verification failed: 401 Unauthorized', 'the view renders the carried message')
  const values = (view.options ?? []).map(o => o.value)
  assert(values.includes('retry') && values.includes('restart') && values.includes('exit'), 'offers Try again / Restart / Exit')
})

await test('(d) ERROR VIEW: with NO retryStep the retry option is hidden (unrecoverable / exit sink)', async () => {
  const view = iosViewForStep('error', iosProgress(), { appId: APP_ID, error: 'Onboarding cancelled.' })
  const values = (view.options ?? []).map(o => o.value)
  assert(!values.includes('retry'), 'no retryStep → no Try again')
  assert(values.includes('restart') && values.includes('exit'), 'Restart + Exit still offered')
})

await test('(d) ERROR RESOLVER: retry → the failing step; restart → welcome; exit/absent → terminal sink', async () => {
  const retry = await runIosEffect('error', iosProgress(), makeDeps({ carried: { error: 'boom', retryStep: 'verifying-key', errorAction: 'retry' } }))
  assertEquals(retry.next, 'verifying-key', 'retry routes back to the failing step')
  const restart = await runIosEffect('error', iosProgress(), makeDeps({ carried: { errorAction: 'restart' } }))
  assertEquals(restart.next, 'welcome', 'restart resets to welcome')
  const exit = await runIosEffect('error', iosProgress(), makeDeps({ carried: { errorAction: 'exit' } }))
  assertEquals(exit.next, 'error', 'exit stays on the terminal error sink (driver leaves onboarding)')
  const noPick = await runIosEffect('error', iosProgress(), makeDeps({ carried: {} }))
  assertEquals(noPick.next, 'error', 'no pick also stays on the terminal sink')
})

await test('(d) ERROR is EPHEMERAL: applyIosInput(error) is a no-op; getIosResumeStep never returns error', async () => {
  const before = iosProgress({ setupMethod: 'create-new', p8Path: '/x.p8', keyId: 'K', issuerId: 'I' })
  const after = applyIosInput('error', before, { step: 'error', value: 'retry' })
  assertEquals(JSON.stringify(after), JSON.stringify(before), 'the error reducer persists nothing (error/retryStep are transient)')
  assert(getIosResumeStep(before) !== 'error', 'resume never returns error')
  assert(getIosResumeStep(iosProgress({ _credentialsExistGate: 'pending' })) !== 'error', 'even a gated progress never resumes to error')
})

// DRIVER: drive a failure THROUGH the loop and out the error view, then retry.
await test('(d) DRIVER: a failing effect lands on the error VIEW (message rendered), then retry re-drives the failing step', async () => {
  let firstVerify = true
  const result = await drive({
    startProgress: iosProgress({ setupMethod: 'create-new', p8Path: '/x.p8', keyId: 'K', issuerId: 'I', completedSteps: {} }),
    startStep: 'verifying-key',
    carriedSeed: { p8Content: P8_BYTES },
    depsOverrides: {
      // Fail the FIRST verify; the driver lands on the error view; on retry the
      // SECOND verify succeeds and the flow continues to creating-certificate.
      verifyApiKey: async () => {
        if (firstVerify) { firstVerify = false; throw new Error('transient 503 from Apple') }
        return { teamId: RAW_CERT.teamId }
      },
    },
    // Stop the drive once we leave the error sink by retrying; assert via a custom
    // script: the error VIEW is a choice — pick 'retry' (carried.errorAction) and
    // re-drive the error resolver, which routes back to verifying-key.
    effectRoutes: {
      // After the retried verify succeeds it routes to creating-certificate; we only
      // care that the loop got PAST the error — short-circuit creating-certificate to
      // a done-like terminal by routing it to build-complete via the script guard.
    },
    script: {
      'error': { carried: { errorAction: 'retry' }, resolveEffect: true },
      // Once past the error, end the drive deterministically at the next choice/effect
      // we can stop on. creating-certificate is an effect → continues; stop at ask-build.
      // ask-build is a tail CHOICE (yes/no) with no persisted reducer — picking
      // 'no' (Not now) finishes the wizard. It's an ephemeral driver route, so
      // model it with an explicit `next` (NOT applyIosInput/getIosResumeStep,
      // which would re-derive saving-credentials and loop forever).
      'ask-build': { next: 'build-complete' },
    },
  })
  assert(result.visited.includes('error'), 'the failing effect routed the driver onto the error step')
  // The error VIEW rendered the failing message (the driver builds it from carried).
  const errorIdx = result.visited.indexOf('error')
  assert(result.visited.indexOf('verifying-key', errorIdx + 1) > errorIdx, 'retry re-drove the failing step (verifying-key) AFTER the error')
  assertEquals(result.step, 'build-complete', 'after a successful retry the flow completes')
})

// ════════════════════════════════════════════════════════════════════════════════
// (e) Cross-cutting: EVERY effect that can fail surfaces a transient.error message.
// ════════════════════════════════════════════════════════════════════════════════

await test('(e) every failing effect that routes to error provides a non-empty transient.error message', async () => {
  const cases = [
    { step: 'verifying-key', deps: { carried: { p8Content: P8_BYTES }, verifyApiKey: async () => { throw new Error('verify boom') } }, progress: iosProgress({ p8Path: '/x.p8', keyId: 'K', issuerId: 'I' }) },
    { step: 'creating-certificate', deps: { createCertificate: async () => { throw new Error('cert boom') } }, progress: iosProgress({ completedSteps: { apiKeyVerified: { keyId: 'K', issuerId: 'I' } } }) },
    { step: 'creating-profile', deps: { createProfile: async () => { throw new Error('profile boom') } }, progress: iosProgress({ completedSteps: { apiKeyVerified: { keyId: 'K', issuerId: 'I' }, certificateCreated: { certificateId: 'C', expirationDate: '2027', teamId: 'T', p12Base64: 'p' } } }) },
    { step: 'revoking-certificate', deps: { carried: { certToRevoke: { id: 'X' } }, revokeCertificate: async () => { throw new Error('revoke boom') } }, progress: iosProgress({}) },
    { step: 'deleting-duplicate-profiles', deps: { carried: { duplicateProfiles: [{ id: 'D', name: 'n', profileType: 'IOS_APP_STORE' }] }, deleteProfile: async () => { throw new Error('delete boom') } }, progress: iosProgress({ duplicateProfileOrigin: 'creating-profile' }) },
    { step: 'import-scanning', deps: { listSigningIdentities: async () => [] }, progress: iosProgress({ setupMethod: 'import-existing', importDistribution: 'ad_hoc' }) },
    { step: 'import-validating-all-certs', deps: { carried: { importMatches: [{ identity: IDENTITY_A, profiles: [] }] }, classifyCertAvailability: async () => { throw new Error('classify boom') } }, progress: iosProgress({ setupMethod: 'import-existing', importDistribution: 'app_store' }) },
    { step: 'import-checking-apple-cert', deps: { carried: { chosenIdentity: IDENTITY_A, importMatches: [] }, findCertIdBySha1: async () => { throw new Error('apple boom') } }, progress: iosProgress({ setupMethod: 'import-existing', importDistribution: 'app_store' }) },
    { step: 'import-exporting', deps: { carried: {} }, progress: iosProgress({ setupMethod: 'import-existing', importDistribution: 'app_store' }) }, // missing selection guard
    { step: 'import-create-profile-only', deps: { carried: { chosenIdentity: IDENTITY_A }, createProfile: async () => { throw new Error('create boom') } }, progress: iosProgress({ setupMethod: 'import-existing', importDistribution: 'app_store' }) },
    { step: 'cert-limit-prompt', deps: { carried: {} }, progress: iosProgress({}) }, // exit sink (no certToRevoke)
    { step: 'duplicate-profile-prompt', deps: { carried: {} }, progress: iosProgress({}) }, // exit sink (no confirm)
    { step: 'import-export-warning', deps: { carried: { exportWarningAction: 'exit' } }, progress: iosProgress({ setupMethod: 'import-existing', importDistribution: 'app_store' }) }, // exit sink
  ]
  for (const c of cases) {
    const res = await runIosEffect(c.step, c.progress, makeDeps(c.deps))
    assertEquals(res.next, 'error', `${c.step} routes to error`)
    assert(res.transient && typeof res.transient.error === 'string' && res.transient.error.length > 0, `${c.step} must surface a non-empty transient.error message`)
    assertProgressClean(res.progress, `runIosEffect(${c.step}) error progress`)
  }
})

// ─── Summary ─────────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(60)}`)
console.log(`Passed: ${testsPassed}  ·  Failed: ${testsFailed}`)
if (testsFailed > 0)
  process.exit(1)
