#!/usr/bin/env node
/**
 * iOS BATCH 1 — shared-tail handoff spec.
 *
 * Mirrors test-android-tail-engine.mjs but for the iOS engine. It proves that
 * `runIosEffect` delegates the post-save tail (saving-credentials → ask-build →
 * CI-secrets → env/workflow → build-complete) to the SAME platform-neutral shared
 * module (`tail/flow.ts`) the android engine uses, via the `toTailDeps(iosDeps)`
 * adapter (platform:'ios', buildIosSavedCredentials, rebuildIosTailCredentials,
 * resumeStep:getIosResumeStep, mapTailViewToIosStepView).
 *
 * This file acts as the headless DRIVER: it captures `IosEffectResult.transient`
 * from each effect and threads it back into the NEXT effect as `deps.carried`,
 * exactly as the Ink TUI mirrors its React state. The contract under test:
 *
 *   1. saving-credentials resolves the CI-secret entries + saved credentials
 *      ONCE (→ next 'ask-build'; transient carries ciSecretEntries +
 *      savedCredentials) — the convergence point of the create-new + import paths.
 *   2. The iOS credential SHAPE written at saving-credentials matches the TUI's
 *      doSaveCredentials map (BUILD_CERTIFICATE_BASE64 / P12_PASSWORD /
 *      CAPGO_IOS_PROVISIONING_MAP / APP_STORE_CONNECT_TEAM_ID /
 *      CAPGO_IOS_DISTRIBUTION).
 *   3. The tail routing reaches build-complete (requesting-build →
 *      detecting-ci-secrets → … → build-complete) reusing carried entries.
 *   4. getIosResumeStep routes a saved progress THROUGH the tail (ask-build /
 *      detecting / checking / env-export / workflow-builder / build-complete)
 *      using the persisted tail markers, guarding double-side-effects.
 */
import process from 'node:process'

const {
  runIosEffect,
  iosViewForStep,
  applyIosInput,
} = await import('../src/build/onboarding/ios/flow.ts')

const { getIosResumeStep } = await import('../src/build/onboarding/ios/progress.ts')

console.log('🧪 iOS post-save TAIL handoff — drives runIosEffect through the shared tail\n')

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

// ─── Test fixtures ───────────────────────────────────────────────────────────

const GITHUB_TARGET = { provider: 'github', label: 'GitHub Actions repository secrets', cli: 'gh' }

// The resolved CI entries the driver pre-binds (with the folded-in CAPGO_TOKEN),
// proving a single resolution at saving-credentials rather than a progress-rebuild.
const RESOLVED_ENTRIES = [
  { key: 'BUILD_CERTIFICATE_BASE64', value: 'cccc', masked: true },
  { key: 'CAPGO_IOS_PROVISIONING_MAP', value: '{}', masked: false },
  { key: 'CAPGO_TOKEN', value: 'resolved-capgo-key', masked: true },
]
const EXISTING_KEYS = ['CAPGO_TOKEN']

// Persisted create-new cert/profile markers (the lossy-rebuild + handoff source
// for the create-new path). The import path threads these via carried instead.
const CERT_DATA = { certificateId: 'CERT1', expirationDate: '2027-01-01', teamId: 'TEAM123', p12Base64: 'cccc' }
const PROFILE_DATA = { profileId: 'PROF1', profileName: 'Capgo com.example.app', profileBase64: 'pppp' }

/**
 * Build an iOS OnboardingProgress whose persisted tail state matches the point in
 * the flow at which the tail step under test runs. `TailProgress` already carries
 * setupMode / ciSecretTarget / selectedPackageManager / buildScriptChoice /
 * envExportTargetPath, so the headless engine reads its inputs from progress the
 * same way the TUI reads them from useState.
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
      apiKeyVerified: { keyId: 'KEY1', issuerId: 'ISS1' },
      certificateCreated: CERT_DATA,
      profileCreated: PROFILE_DATA,
      ...completedOverrides,
    },
  }
}

/**
 * Mocked IosEffectDeps. Every helper returns canned data — NO fs, NO network, NO
 * child processes. Records which helpers fired so the spec can assert the engine
 * used the SAME pure helper the TUI branch calls. The tail-specific dep fields are
 * the platform-neutral TailEffectDeps shapes (mapped 1:1 by toTailDeps).
 */
function makeDeps(overrides = {}) {
  const calls = []

  const deps = {
    // ── persistence ──
    updateSavedCredentials: async (...a) => { calls.push({ name: 'updateSavedCredentials', args: a }) },
    loadProgress: async () => null,
    saveProgress: async (...a) => { calls.push({ name: 'saveProgress', args: a }) },
    deleteProgress: async (...a) => { calls.push({ name: 'deleteProgress', args: a }) },

    // ── tail helpers (mapped 1:1 onto TailEffectDeps by toTailDeps) ──
    createCiSecretEntries: (...a) => { calls.push({ name: 'createCiSecretEntries', args: a }); return RESOLVED_ENTRIES },
    detectCiSecretTargets: (...a) => {
      calls.push({ name: 'detectCiSecretTargets', args: a })
      return { targets: [GITHUB_TARGET], setup: [], notes: [] }
    },
    getCiSecretRepoLabelAsync: async (...a) => { calls.push({ name: 'getCiSecretRepoLabelAsync', args: a }); return 'octo/repo' },
    listExistingCiSecretKeysAsync: async (...a) => { calls.push({ name: 'listExistingCiSecretKeysAsync', args: a }); return [] },
    uploadCiSecretsAsync: async (...a) => { calls.push({ name: 'uploadCiSecretsAsync', args: a }) },
    exportCredentialsToEnv: (...a) => {
      calls.push({ name: 'exportCredentialsToEnv', args: a })
      return { kind: 'written', path: `/tmp/.env.capgo.${APP_ID}.ios`, fieldCount: 5 }
    },
    defaultExportPath: (...a) => { calls.push({ name: 'defaultExportPath', args: a }); return `/tmp/.env.capgo.${APP_ID}.ios` },
    generateWorkflow: (...a) => { calls.push({ name: 'generateWorkflow', args: a }); return { content: 'name: capgo-build\n' } },
    writeWorkflowFile: (...a) => {
      calls.push({ name: 'writeWorkflowFile', args: a })
      return { kind: 'written', absolutePath: '/repo/.github/workflows/capgo-build.yml' }
    },
    requestBuildInternal: async (...a) => { calls.push({ name: 'requestBuildInternal', args: a }); return { success: true } },

    onStatus: () => {},
    onLog: () => {},

    ...overrides,
  }
  deps.__calls = calls
  return deps
}

// ─── 1) saving-credentials → ask-build (transient: entries + credentials) ──────

await test("saving-credentials → next 'ask-build' (uses createCiSecretEntries; transient carries entries + savedCredentials)", async () => {
  const deps = makeDeps()
  const res = await runIosEffect('saving-credentials', iosProgress(), deps)
  assertEquals(res.next, 'ask-build', 'saving-credentials must route to ask-build')
  assert(deps.__calls.some(c => c.name === 'createCiSecretEntries'), 'must call createCiSecretEntries to stash CI entries')
  assert(deps.__calls.some(c => c.name === 'updateSavedCredentials'), 'must persist the saved credential map')
  assert(deps.__calls.some(c => c.name === 'deleteProgress'), 'must delete the in-flight progress after save')
  assert(res.transient && res.transient.ciSecretEntries, 'saving-credentials must return ciSecretEntries in transient')
  assert(res.transient.savedCredentials, 'saving-credentials must return savedCredentials in transient')
})

await test('saving-credentials writes the iOS credential SHAPE (create-new path) via buildIosSavedCredentials', async () => {
  const deps = makeDeps()
  await runIosEffect('saving-credentials', iosProgress(), deps)
  const updateCall = deps.__calls.find(c => c.name === 'updateSavedCredentials')
  assert(updateCall, 'must call updateSavedCredentials')
  // args: (appId, platform, credentials)
  assertEquals(updateCall.args[0], APP_ID, 'updateSavedCredentials appId arg')
  assertEquals(updateCall.args[1], 'ios', 'updateSavedCredentials must tag the platform as ios')
  const creds = updateCall.args[2]
  assertEquals(creds.BUILD_CERTIFICATE_BASE64, CERT_DATA.p12Base64, 'cert p12 must come from the persisted certificateCreated marker')
  assertEquals(creds.P12_PASSWORD, 'capgo', 'create-new path must use the well-known DEFAULT_P12_PASSWORD')
  assertEquals(creds.APP_STORE_CONNECT_TEAM_ID, CERT_DATA.teamId, 'team id must come from the cert')
  assertEquals(creds.CAPGO_IOS_DISTRIBUTION, 'app_store', 'create-new defaults to app_store distribution')
  const map = JSON.parse(creds.CAPGO_IOS_PROVISIONING_MAP)
  assertEquals(map[APP_ID].profile, PROFILE_DATA.profileBase64, 'provisioning map carries the profile base64 keyed by bundle id')
  assertEquals(map[APP_ID].name, PROFILE_DATA.profileName, 'provisioning map carries the profile name')
})

await test('saving-credentials (IMPORT path) prefers the carried cert/profile/team + importedP12Password over progress markers', async () => {
  const IMPORT_CERT = { certificateId: 'ICERT', expirationDate: '2027-02-02', teamId: 'ITEAM', p12Base64: 'import-p12' }
  const IMPORT_PROFILE = { profileId: 'IPROF', profileName: 'Imported Profile', profileBase64: 'import-prof' }
  const deps = makeDeps({
    carried: {
      certData: IMPORT_CERT,
      profileData: IMPORT_PROFILE,
      teamId: 'ITEAM',
      importedP12Password: 'random-keychain-pass',
    },
  })
  // An import progress with NO persisted cert/profile markers — the export
  // payloads are transient-only on the import path.
  const progress = iosProgress({
    setupMethod: 'import-existing',
    importDistribution: 'ad_hoc',
    completedSteps: { certificateCreated: undefined, profileCreated: undefined },
  })
  await runIosEffect('saving-credentials', progress, deps)
  const creds = deps.__calls.find(c => c.name === 'updateSavedCredentials').args[2]
  assertEquals(creds.BUILD_CERTIFICATE_BASE64, IMPORT_CERT.p12Base64, 'import path must use the carried cert p12 (transient, not persisted)')
  assertEquals(creds.P12_PASSWORD, 'random-keychain-pass', 'import path must use the carried keychain-export passphrase')
  assertEquals(creds.APP_STORE_CONNECT_TEAM_ID, 'ITEAM', 'import path must use the carried team id')
  assertEquals(creds.CAPGO_IOS_DISTRIBUTION, 'ad_hoc', 'import ad_hoc distribution must be carried through')
  // ad_hoc import needs NO ASC key (needsAscKey = !import || app_store) — even
  // if a .p8 were carried, the per-fork guard must omit the APPLE_KEY_* fields.
  assert(!('APPLE_KEY_ID' in creds), 'import ad_hoc must NOT emit APPLE_KEY_ID')
  assert(!('APPLE_ISSUER_ID' in creds), 'import ad_hoc must NOT emit APPLE_ISSUER_ID')
  assert(!('APPLE_KEY_CONTENT' in creds), 'import ad_hoc must NOT emit APPLE_KEY_CONTENT')
})

await test('REGRESSION (live loop): import save proceeds even though persisted progress resumes at import-scanning', async () => {
  // tail/flow.ts used to consult resumeStep(loadProgress()) BEFORE building
  // the credential map. The import payload is ephemeral (carried-only), so the
  // persisted progress ALWAYS resumed at import-scanning → an infinite
  // export → self-heal → re-import loop in the live TUI. Build-first fixes it.
  const IMPORT_CERT = { certificateId: 'ICERT', expirationDate: '2027-02-02', teamId: 'ITEAM', p12Base64: 'import-p12' }
  const IMPORT_PROFILE = { profileId: 'IPROF', profileName: 'Imported Profile', profileBase64: 'import-prof' }
  const logs = []
  const progress = iosProgress({
    setupMethod: 'import-existing',
    importDistribution: 'app_store',
    completedSteps: { apiKeyVerified: { keyId: 'K66', issuerId: 'ISS' } },
  })
  const deps = makeDeps({
    onLog: (msg, color) => logs.push({ msg, color }),
    loadProgress: async () => progress, // the LIVE shape: a persisted import progress exists
    carried: {
      certData: IMPORT_CERT,
      profileData: IMPORT_PROFILE,
      teamId: 'ITEAM',
      importedP12Password: 'random-keychain-pass',
    },
  })
  const res = await runIosEffect('saving-credentials', progress, deps)
  assertEquals(res.next, 'ask-build', 'the import save must proceed (no self-heal divert)')
  assert(deps.__calls.some(c => c.name === 'updateSavedCredentials'), 'credentials must be saved')
  assert(!logs.some(l => /Some required input was missing/.test(l.msg)), 'no missing-input divert log')
})

// ─── 1b) ASC API key fields (APPLE_KEY_*) carried through saving-credentials ────

await test('saving-credentials (create-new app_store) emits APPLE_KEY_ID/ISSUER_ID/CONTENT from progress + carried.p8Content', async () => {
  const P8_BYTES = Buffer.from('-----BEGIN PRIVATE KEY-----\nMOCKP8\n-----END PRIVATE KEY-----\n')
  const deps = makeDeps({ carried: { p8Content: P8_BYTES } })
  // Persisted progress.keyId/issuerId are the non-secret Apple identifiers; the
  // secret .p8 bytes ride carried.p8Content (never persisted to progress.json).
  const progress = iosProgress({ keyId: 'KEYTOP', issuerId: 'ISSTOP' })
  await runIosEffect('saving-credentials', progress, deps)
  const creds = deps.__calls.find(c => c.name === 'updateSavedCredentials').args[2]
  // The 5 base fields stay intact alongside the ASC key fields.
  assertEquals(creds.BUILD_CERTIFICATE_BASE64, CERT_DATA.p12Base64, 'base cert field must remain')
  assertEquals(creds.P12_PASSWORD, 'capgo', 'create-new keeps the default P12 password')
  assertEquals(creds.CAPGO_IOS_DISTRIBUTION, 'app_store', 'create-new defaults to app_store')
  // The ASC key fields the bespoke doSaveCredentials writes (app.tsx:1216–1219).
  assertEquals(creds.APPLE_KEY_ID, 'KEYTOP', 'APPLE_KEY_ID must come from progress.keyId')
  assertEquals(creds.APPLE_ISSUER_ID, 'ISSTOP', 'APPLE_ISSUER_ID must come from progress.issuerId')
  assertEquals(creds.APPLE_KEY_CONTENT, P8_BYTES.toString('base64'), 'APPLE_KEY_CONTENT must be the base64 of the carried .p8 bytes')
})

await test('saving-credentials (create-new app_store) falls back to apiKeyVerified for APPLE_KEY_ID/ISSUER_ID when top-level keyId/issuerId absent', async () => {
  const P8_BYTES = Buffer.from('MOCKP8')
  const deps = makeDeps({ carried: { p8Content: P8_BYTES } })
  // No top-level keyId/issuerId — only the resume-hydrated apiKeyVerified mirror
  // ({ keyId: 'KEY1', issuerId: 'ISS1' }) the default iosProgress() fixture sets.
  await runIosEffect('saving-credentials', iosProgress(), deps)
  const creds = deps.__calls.find(c => c.name === 'updateSavedCredentials').args[2]
  assertEquals(creds.APPLE_KEY_ID, 'KEY1', 'APPLE_KEY_ID falls back to apiKeyVerified.keyId')
  assertEquals(creds.APPLE_ISSUER_ID, 'ISS1', 'APPLE_ISSUER_ID falls back to apiKeyVerified.issuerId')
  assertEquals(creds.APPLE_KEY_CONTENT, P8_BYTES.toString('base64'), 'APPLE_KEY_CONTENT must be the base64 of the carried .p8 bytes')
})

await test('saving-credentials (IMPORT app_store) uses importedP12Password AND emits the APPLE_KEY_* fields', async () => {
  const IMPORT_CERT = { certificateId: 'ICERT', expirationDate: '2027-02-02', teamId: 'ITEAM', p12Base64: 'import-p12' }
  const IMPORT_PROFILE = { profileId: 'IPROF', profileName: 'Imported Profile', profileBase64: 'import-prof' }
  const P8_BYTES = Buffer.from('IMPORT-MOCKP8')
  const deps = makeDeps({
    carried: {
      certData: IMPORT_CERT,
      profileData: IMPORT_PROFILE,
      teamId: 'ITEAM',
      importedP12Password: 'random-keychain-pass',
      p8Content: P8_BYTES,
    },
  })
  // An app_store import still needs the ASC key (needsAscKey = !import || app_store).
  const progress = iosProgress({
    setupMethod: 'import-existing',
    importDistribution: 'app_store',
    keyId: 'IKEY',
    issuerId: 'IISS',
    completedSteps: { certificateCreated: undefined, profileCreated: undefined, apiKeyVerified: undefined },
  })
  await runIosEffect('saving-credentials', progress, deps)
  const creds = deps.__calls.find(c => c.name === 'updateSavedCredentials').args[2]
  assertEquals(creds.P12_PASSWORD, 'random-keychain-pass', 'import path must use the carried keychain-export passphrase')
  assertEquals(creds.CAPGO_IOS_DISTRIBUTION, 'app_store', 'import app_store distribution must be carried through')
  assertEquals(creds.APPLE_KEY_ID, 'IKEY', 'import app_store must emit APPLE_KEY_ID from progress.keyId')
  assertEquals(creds.APPLE_ISSUER_ID, 'IISS', 'import app_store must emit APPLE_ISSUER_ID from progress.issuerId')
  assertEquals(creds.APPLE_KEY_CONTENT, P8_BYTES.toString('base64'), 'import app_store must emit APPLE_KEY_CONTENT from carried.p8Content')
})

await test('saving-credentials (create-new) WITHOUT carried.p8Content omits the APPLE_KEY_* fields (IO-free: no raw fs read)', async () => {
  // The engine never re-reads the .p8 from disk; when the driver did not thread
  // the secret bytes, the ASC key fields are simply absent (the 5 base fields stay).
  const deps = makeDeps()
  await runIosEffect('saving-credentials', iosProgress(), deps)
  const creds = deps.__calls.find(c => c.name === 'updateSavedCredentials').args[2]
  assert(!('APPLE_KEY_CONTENT' in creds), 'no carried .p8 → no APPLE_KEY_CONTENT (engine does no fs read)')
  assert(!('APPLE_KEY_ID' in creds), 'no carried .p8 → no APPLE_KEY_ID')
  assertEquals(creds.BUILD_CERTIFICATE_BASE64, CERT_DATA.p12Base64, 'the 5 base fields are still emitted')
})

// ─── 2) DRIVER threading: resolve ONCE, reuse downstream, reach build-complete ──

await test('DRIVER: saving-credentials → requesting-build → detecting-ci-secrets, reusing carried entries (no rebuild)', async () => {
  // 1) saving-credentials resolves entries + credentials ONCE.
  const saveDeps = makeDeps()
  const saved = await runIosEffect('saving-credentials', iosProgress(), saveDeps)
  assertEquals(saved.next, 'ask-build', 'saving-credentials routes to ask-build')
  assert(
    saved.transient.ciSecretEntries.some(e => e.key === 'CAPGO_TOKEN'),
    'resolved entries must include the CAPGO_TOKEN folded in at saving-credentials',
  )

  // The driver captures the transient and threads it back as carried.
  const carried = {
    savedCredentials: saved.transient.savedCredentials,
    ciSecretEntries: saved.transient.ciSecretEntries,
  }

  // 2) requesting-build (after the user confirms ask-build) reuses carried
  //    entries → routes to detecting-ci-secrets WITHOUT re-resolving entries.
  const buildDeps = makeDeps({ carried })
  const built = await runIosEffect('requesting-build', iosProgress(), buildDeps)
  assertEquals(built.next, 'detecting-ci-secrets', 'a successful build with pending entries routes to detecting-ci-secrets')
  assert(buildDeps.__calls.some(c => c.name === 'requestBuildInternal'), 'must call requestBuildInternal')
  assert(!buildDeps.__calls.some(c => c.name === 'createCiSecretEntries'), 'requesting-build must REUSE carried entries, not rebuild them')
})

await test('DRIVER: the tail reaches build-complete — detecting-ci-secrets with no targets → build-complete', async () => {
  const deps = makeDeps({
    detectCiSecretTargets: () => ({ targets: [], setup: [], notes: ['no git remote'] }),
  })
  const res = await runIosEffect('detecting-ci-secrets', iosProgress(), deps)
  assertEquals(res.next, 'build-complete', 'no CI target + no setup advice finishes the wizard at build-complete')
})

await test('DRIVER: uploading-ci-secrets (secrets-only) → build-complete, reusing carried entries + existing-keys', async () => {
  const carried = { ciSecretEntries: RESOLVED_ENTRIES, ciSecretExistingKeys: EXISTING_KEYS }
  const deps = makeDeps({ carried })
  const progress = iosProgress({ ciSecretTarget: GITHUB_TARGET, setupMode: 'secrets-only' })
  const res = await runIosEffect('uploading-ci-secrets', progress, deps)
  assertEquals(res.next, 'build-complete', 'secrets-only finishes after upload')
  const upload = deps.__calls.find(c => c.name === 'uploadCiSecretsAsync')
  assert(upload, 'must call uploadCiSecretsAsync')
  assertEquals(upload.args[1], RESOLVED_ENTRIES, 'upload must reuse the carried entries')
  assertEquals(upload.args[2], EXISTING_KEYS, 'upload must receive the carried existing-keys list')
})

await test('DRIVER: env-export writes the FULL carried savedCredentials (not a lossy rebuild) → build-complete', async () => {
  const FULL_CREDS = {
    BUILD_CERTIFICATE_BASE64: 'cccc',
    P12_PASSWORD: 'capgo',
    CAPGO_IOS_PROVISIONING_MAP: '{}',
    APP_STORE_CONNECT_TEAM_ID: 'TEAM123',
    CAPGO_IOS_DISTRIBUTION: 'app_store',
  }
  const deps = makeDeps({ carried: { savedCredentials: FULL_CREDS } })
  const progress = iosProgress({ setupMode: 'declined' })
  const res = await runIosEffect('exporting-env', progress, deps)
  assertEquals(res.next, 'build-complete', 'a successful export finishes the wizard')
  const exportCall = deps.__calls.find(c => c.name === 'exportCredentialsToEnv')
  assert(exportCall, 'must call exportCredentialsToEnv')
  assertEquals(exportCall.args[0].credentials, FULL_CREDS, 'exportCredentialsToEnv must receive the full carried savedCredentials')
  assertEquals(exportCall.args[0].platform, 'ios', 'env-export must be tagged ios')
})

await test('DRIVER: writing-workflow-file (with-workflow) → build-complete, secretKeys come from carried entries', async () => {
  const deps = makeDeps({ carried: { ciSecretEntries: RESOLVED_ENTRIES } })
  const progress = iosProgress({
    ciSecretTarget: GITHUB_TARGET,
    setupMode: 'with-workflow',
    selectedPackageManager: 'bun',
    buildScriptChoice: { type: 'npm-script', name: 'build' },
  })
  const res = await runIosEffect('writing-workflow-file', progress, deps)
  assertEquals(res.next, 'build-complete', 'after the workflow file is written the wizard finishes')
  const writeCall = deps.__calls.find(c => c.name === 'writeWorkflowFile')
  assert(writeCall, 'must call writeWorkflowFile')
  assert(writeCall.args[0].secretKeys.includes('CAPGO_TOKEN'), 'workflow secretKeys come from the carried entries (incl. CAPGO_TOKEN)')
  assertEquals(writeCall.args[0].defaultPlatform, 'ios', 'workflow must default to the ios platform')
})

// ─── 3) Tail VIEW + INPUT delegation ───────────────────────────────────────────

const CHOICE_INPUT_TAIL_STEPS = [
  'ask-github-actions-setup',
  'confirm-secrets-push',
  'ask-export-env',
  'ask-build',
  'pick-package-manager',
  'pick-build-script',
  'preview-workflow-file',
]

for (const step of CHOICE_INPUT_TAIL_STEPS) {
  await test(`iosViewForStep('${step}') delegates to the shared tail view (choice/input)`, async () => {
    const view = iosViewForStep(step, iosProgress(), { appId: APP_ID })
    assert(view, `view for ${step} must exist`)
    assertEquals(view.step, step, 'view.step must echo the requested step')
    assert(
      view.kind === 'choice' || view.kind === 'input',
      `${step} must be a choice/input step (got kind=${view.kind})`,
    )
  })
}

await test("iosViewForStep('build-complete') is a done view (delegated to the tail)", async () => {
  const view = iosViewForStep('build-complete', iosProgress(), { appId: APP_ID })
  assertEquals(view.kind, 'done', 'build-complete must be a done view')
  assert(typeof view.message === 'string' && view.message.length > 0, 'build-complete must carry a message')
})

await test('applyIosInput delegates a tail input (ask-github-actions-setup) to applyTailInput (records setupMode)', async () => {
  const next = applyIosInput('ask-github-actions-setup', iosProgress(), { step: 'ask-github-actions-setup', value: 'with-workflow' })
  assertEquals(next.setupMode, 'with-workflow', 'the tail input reducer must record setupMode on iOS progress')
})

await test('applyIosInput leaves a still-stubbed NON-tail step unchanged', async () => {
  // setup-method-select + import-distribution-mode are now implemented (BATCH 2b /
  // BATCH 5 record setupMethod / importDistribution), so use a still-stubbed
  // import-flow choice as the "unchanged stub" example instead. import-pick-identity
  // is an EPHEMERAL-branching pick whose reducer lands in a later (import) batch —
  // until then it stays in the default branch and returns progress unchanged.
  const progress = iosProgress()
  const next = applyIosInput('import-pick-identity', progress, { step: 'import-pick-identity', value: 'some-sha1' })
  assertEquals(next, progress, 'a not-yet-implemented non-tail step stays a stub — progress unchanged')
})

await test('runIosEffect throws for a NON-tail, not-yet-implemented effect step (still a stub)', async () => {
  // BATCH 2a implemented the create-new effects (backing-up / p8-method-select /
  // verifying-key / creating-certificate / creating-profile); BATCH 5 implemented
  // the import-discovery effects (import-scanning / import-validating-all-certs);
  // BATCH 6 implemented the import pickers + apple-cert check (import-pick-identity /
  // import-checking-apple-cert / import-pick-profile); BATCH 7a/7b implemented the
  // import recovery + export tail (import-no-match-recovery … import-create-profile-
  // only / import-export-warning / import-exporting). So
  // use a pre-flow lifecycle effect the iOS engine never owns — `adding-platform`
  // is driven by the master flow, not runIosEffect, so it stays in the default
  // branch and must still throw "not implemented".
  let threw = false
  try {
    await runIosEffect('adding-platform', iosProgress(), makeDeps())
  }
  catch (err) {
    threw = /not implemented/.test(err instanceof Error ? err.message : String(err))
  }
  assert(threw, 'a non-tail, not-yet-implemented effect step must still throw "not implemented"')
})

// ─── 4) Resume routing THROUGH the tail (getIosResumeStep) ─────────────────────
//
// A saved progress mid-tail must resume at the correct tail step using the
// persisted tail markers (credentialsSaved / buildRequested / ciSecretsUploaded),
// WITHOUT re-firing a side-effect that already ran. A fully-provisioned create-new
// progress WITHOUT any tail marker still resumes at saving-credentials (legacy
// parity — existing files unaffected).

const CREDS_SAVED = { savedAt: '2026-06-03T01:00:00.000Z' }
const BUILD_REQUESTED = { buildUrl: `https://capgo.app/app/${APP_ID}/builds` }
const CI_UPLOADED_GH = { provider: 'github', count: 3 }

/** A fully-provisioned create-new progress: cert + profile persisted, so without
 *  any tail marker getIosResumeStep terminates at saving-credentials. */
function provisionedProgress(overrides = {}) {
  return iosProgress(overrides)
}

/** A post-save tail progress: provisioned + credentials already written. */
function savedTailProgress(overrides = {}) {
  const { completedSteps: completedOverrides, ...rest } = overrides
  return provisionedProgress({
    ...rest,
    completedSteps: {
      credentialsSaved: CREDS_SAVED,
      ...completedOverrides,
    },
  })
}

await test('no tail marker → resume stays saving-credentials (legacy parity)', async () => {
  assertEquals(getIosResumeStep(provisionedProgress()), 'saving-credentials')
})

await test('credentials saved, pre-build → ask-build (not requesting-build; double-build guard)', async () => {
  assertEquals(getIosResumeStep(savedTailProgress()), 'ask-build')
})

await test('after build, pre-CI-detection → detecting-ci-secrets', async () => {
  const p = savedTailProgress({ completedSteps: { buildRequested: BUILD_REQUESTED } })
  assertEquals(getIosResumeStep(p), 'detecting-ci-secrets')
})

await test('after build, target chosen, pre-upload → checking-ci-secrets (never the upload step)', async () => {
  const p = savedTailProgress({
    ciSecretTarget: GITHUB_TARGET,
    setupMode: 'with-workflow',
    completedSteps: { buildRequested: BUILD_REQUESTED },
  })
  const next = getIosResumeStep(p)
  assertEquals(next, 'checking-ci-secrets')
  assert(next !== 'uploading-ci-secrets', 'must never resume directly onto the upload step')
})

await test('after build, declined GH Actions, no export path → ask-export-env', async () => {
  const p = savedTailProgress({ setupMode: 'declined', completedSteps: { buildRequested: BUILD_REQUESTED } })
  assertEquals(getIosResumeStep(p), 'ask-export-env')
})

await test('after build, declined GH Actions, export path set → exporting-env', async () => {
  const p = savedTailProgress({
    setupMode: 'declined',
    envExportTargetPath: `/tmp/.env.capgo.${APP_ID}.ios`,
    completedSteps: { buildRequested: BUILD_REQUESTED },
  })
  assertEquals(getIosResumeStep(p), 'exporting-env')
})

await test('after upload, with-workflow, no PM → pick-package-manager', async () => {
  const p = savedTailProgress({
    ciSecretTarget: GITHUB_TARGET,
    setupMode: 'with-workflow',
    completedSteps: { buildRequested: BUILD_REQUESTED, ciSecretsUploaded: CI_UPLOADED_GH },
  })
  assertEquals(getIosResumeStep(p), 'pick-package-manager')
})

await test('after upload, with-workflow, PM + script set → writing-workflow-file', async () => {
  const p = savedTailProgress({
    ciSecretTarget: GITHUB_TARGET,
    setupMode: 'with-workflow',
    selectedPackageManager: 'bun',
    buildScriptChoice: { type: 'npm-script', name: 'build' },
    completedSteps: { buildRequested: BUILD_REQUESTED, ciSecretsUploaded: CI_UPLOADED_GH },
  })
  assertEquals(getIosResumeStep(p), 'writing-workflow-file')
})

await test('after upload, secrets-only → build-complete', async () => {
  const p = savedTailProgress({
    ciSecretTarget: GITHUB_TARGET,
    setupMode: 'secrets-only',
    completedSteps: { buildRequested: BUILD_REQUESTED, ciSecretsUploaded: CI_UPLOADED_GH },
  })
  assertEquals(getIosResumeStep(p), 'build-complete')
})

await test('the tail front gates take priority: _credentialsExistGate "pending" beats a tail marker', async () => {
  // The data-safety gate fires before the tail router — protecting existing creds.
  const p = savedTailProgress({ _credentialsExistGate: 'pending' })
  assertEquals(getIosResumeStep(p), 'credentials-exist')
})

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${testsPassed} passed, ${testsFailed} failed`)
if (testsFailed > 0)
  process.exit(1)
