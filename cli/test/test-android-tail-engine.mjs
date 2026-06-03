#!/usr/bin/env node
/**
 * Plan — RED spec for the Android post-save "tail" engine.
 *
 * Phase 1 migrates the post-save tail (CI-secrets → env-export → workflow-file →
 * build-request) out of `android/ui/app.tsx`'s tail `useEffect` and into the
 * shared headless engine (`runAndroidEffect` + `androidViewForStep`). The TUI
 * keeps its own `useState` tail for now; this test is the EXECUTABLE SPEC the
 * engine cases must satisfy so a later phase can swap the TUI onto the engine.
 *
 * This file is RED on purpose: `runAndroidEffect`'s `default` branch currently
 * throws `Unhandled effect step: …` for every AUTO tail step below. Once Phase
 * 1 (A3/A4) lands the tail cases, every assertion here turns GREEN with no edit
 * to this file.
 *
 * The EXPECTED routing encoded below was derived step-by-step from the TUI tail
 * `useEffect` in `src/build/onboarding/android/ui/app.tsx` (the post-save block).
 * Each AUTO step's `{next}` mirrors exactly what `setStep(…)` the matching TUI
 * branch fires, and which pure helper it calls:
 *
 *   saving-credentials      uses createCiSecretEntries  → next 'ask-build'
 *                           (app.tsx: doSaveCredentials → createCiSecretEntries → setStep('ask-build'))
 *   requesting-build        uses requestBuildInternal   → next 'detecting-ci-secrets'
 *                           (app.tsx: success && ciSecretEntries.length > 0 → setStep('detecting-ci-secrets'))
 *   detecting-ci-secrets    uses detectCiSecretTargets  → next 'ask-github-actions-setup'
 *                           (app.tsx: single GitHub target → setStep('ask-github-actions-setup'))
 *   checking-ci-secrets     uses getCiSecretRepoLabelAsync + listExistingCiSecretKeysAsync
 *                           → next 'confirm-secrets-push'
 *                           (app.tsx: provider === 'github' → setStep('confirm-secrets-push'))
 *   uploading-ci-secrets    uses uploadCiSecretsAsync    → next 'pick-package-manager'
 *                           (app.tsx: setupMode === 'with-workflow' → setStep('pick-package-manager'))
 *   exporting-env           uses exportCredentialsToEnv + defaultExportPath
 *                           → next 'build-complete'
 *                           (app.tsx: result.kind === 'written' → setStep('build-complete'))
 *   writing-workflow-file   uses writeWorkflowFile (+ generateWorkflow at preview)
 *                           → next 'build-complete'
 *                           (app.tsx: result.kind === 'written' → setStep('build-complete'))
 *
 * The ai-analysis-* steps are intentionally OUT OF SCOPE — they stay TUI-only
 * (no AI-calling-AI in the headless engine), so they are not driven here.
 *
 * CHOICE/INPUT tail steps are not driven through the effect; they are asserted
 * to expose a non-auto view (kind + a way to advance) via `androidViewForStep`.
 */
import process from 'node:process'

const {
  runAndroidEffect,
  androidViewForStep,
  applyAndroidInput,
} = await import('../src/build/onboarding/android/flow.ts')

const { getAndroidResumeStep } = await import('../src/build/onboarding/android/progress.ts')

console.log('🧪 Android post-save TAIL engine — RED spec (drives runAndroidEffect through the tail)\n')

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

const CI_ENTRIES = [
  { key: 'ANDROID_KEYSTORE_FILE', value: 'a2V5', masked: true },
  { key: 'KEYSTORE_KEY_ALIAS', value: 'release', masked: false },
  { key: 'CAPGO_TOKEN', value: 'tok', masked: true },
]

const SAVED_CREDENTIALS = {
  ANDROID_KEYSTORE_FILE: 'a2V5',
  KEYSTORE_KEY_ALIAS: 'release',
  KEYSTORE_STORE_PASSWORD: 'pw',
  KEYSTORE_KEY_PASSWORD: 'pw',
  PLAY_CONFIG_JSON: 'eyJ9',
}

/**
 * Build a progress object whose persisted tail state matches the point in the
 * TUI flow at which the AUTO step under test runs. `TailProgress` already
 * carries setupMode / ciSecretTarget / selectedPackageManager / buildScriptChoice
 * / envExportTargetPath, so the headless engine reads its inputs from progress
 * the same way the TUI reads them from useState.
 */
function tailProgress(overrides = {}) {
  return {
    platform: 'android',
    appId: APP_ID,
    startedAt: '2026-06-03T00:00:00.000Z',
    completedSteps: {
      keystoreReady: { keystorePath: 'android/app/release.p12', alias: 'release', isGenerated: true },
      androidPackageChosen: { packageName: APP_ID, source: 'gradle' },
    },
    _keystoreBase64: 'a2V5',
    _serviceAccountKeyBase64: 'eyJ9',
    keystoreStorePassword: 'pw',
    keystoreKeyPassword: 'pw',
    keystoreAlias: 'release',
    ...overrides,
  }
}

/**
 * Mocked AndroidEffectDeps. Every helper returns canned data — NO fs, NO
 * network, NO child processes. Records which helpers fired so the spec can
 * assert the engine used the SAME pure helper the TUI branch calls.
 *
 * The tail-specific dep fields (detectCiSecretTargets, getCiSecretRepoLabelAsync,
 * listExistingCiSecretKeysAsync, uploadCiSecretsAsync, createCiSecretEntries,
 * exportCredentialsToEnv, defaultExportPath, generateWorkflow, writeWorkflowFile,
 * requestBuildInternal) are ADDITIVE/OPTIONAL on AndroidEffectDeps and are added
 * in A3/A4 — referencing them here is what makes this the spec for those tasks.
 */
function makeDeps(overrides = {}) {
  const calls = []

  const deps = {
    // ── existing (provisioning) deps — unused by the tail, present as no-ops ──
    generateKeystore: () => { throw new Error('not used in tail') },
    listKeystoreAliases: () => { throw new Error('not used in tail') },
    tryUnlockPrivateKey: () => { throw new Error('not used in tail') },
    validateServiceAccountJson: async () => { throw new Error('not used in tail') },
    updateSavedCredentials: async (...a) => { calls.push({ name: 'updateSavedCredentials', args: a }) },
    loadSavedCredentials: async () => SAVED_CREDENTIALS,
    saveAndroidProgress: async (...a) => { calls.push({ name: 'saveAndroidProgress', args: a }) },
    loadAndroidProgress: async () => null,
    deleteAndroidProgress: async (...a) => { calls.push({ name: 'deleteAndroidProgress', args: a }) },
    readFile: async () => Buffer.from('key'),
    copyFile: async () => {},
    runOAuthFlow: async () => { throw new Error('not used in tail') },
    fetchUserInfo: async () => { throw new Error('not used in tail') },
    getAccessToken: async () => 'tok',
    revokeToken: async () => {},
    listProjects: async () => [],
    createProject: async () => { throw new Error('not used in tail') },
    enableService: async () => {},
    ensureServiceAccount: async () => { throw new Error('not used in tail') },
    createServiceAccountKey: async () => { throw new Error('not used in tail') },
    inviteServiceAccount: async () => {},
    findAndroidApplicationIds: async () => [APP_ID],

    // ── tail deps (additive — added in A3/A4) ──
    createCiSecretEntries: (...a) => { calls.push({ name: 'createCiSecretEntries', args: a }); return CI_ENTRIES },
    detectCiSecretTargets: (...a) => {
      calls.push({ name: 'detectCiSecretTargets', args: a })
      return { targets: [GITHUB_TARGET], setup: [], notes: [] }
    },
    getCiSecretRepoLabelAsync: async (...a) => { calls.push({ name: 'getCiSecretRepoLabelAsync', args: a }); return 'octo/repo' },
    listExistingCiSecretKeysAsync: async (...a) => { calls.push({ name: 'listExistingCiSecretKeysAsync', args: a }); return [] },
    uploadCiSecretsAsync: async (...a) => { calls.push({ name: 'uploadCiSecretsAsync', args: a }) },
    exportCredentialsToEnv: (...a) => {
      calls.push({ name: 'exportCredentialsToEnv', args: a })
      return { kind: 'written', path: `/tmp/.env.capgo.${APP_ID}.android`, fieldCount: 5 }
    },
    defaultExportPath: (...a) => { calls.push({ name: 'defaultExportPath', args: a }); return `/tmp/.env.capgo.${APP_ID}.android` },
    generateWorkflow: (...a) => { calls.push({ name: 'generateWorkflow', args: a }); return { content: 'name: capgo-build\n' } },
    writeWorkflowFile: (...a) => {
      calls.push({ name: 'writeWorkflowFile', args: a })
      return { kind: 'written', absolutePath: '/repo/.github/workflows/capgo-build.yml' }
    },
    requestBuildInternal: async (...a) => { calls.push({ name: 'requestBuildInternal', args: a }); return { success: true } },

    onStatus: () => {},
    onLog: () => {},
    onAuthUrl: () => {},

    ...overrides,
  }
  deps.__calls = calls
  return deps
}

// ─── AUTO tail steps: drive through runAndroidEffect, assert {next} + helper ──
//
// Each of these CURRENTLY throws 'Unhandled effect step' (default branch) — RED.

await test("saving-credentials → next 'ask-build' (uses createCiSecretEntries)", async () => {
  const deps = makeDeps()
  const res = await runAndroidEffect('saving-credentials', tailProgress(), deps)
  assertEquals(res.next, 'ask-build', 'saving-credentials must route to ask-build')
  assert(deps.__calls.some(c => c.name === 'createCiSecretEntries'), 'must call createCiSecretEntries to stash CI entries')
})

await test("requesting-build (success, entries present) → next 'detecting-ci-secrets' (uses requestBuildInternal)", async () => {
  const deps = makeDeps()
  const res = await runAndroidEffect('requesting-build', tailProgress(), deps)
  assertEquals(res.next, 'detecting-ci-secrets', 'a successful build with pending entries must route to detecting-ci-secrets')
  assert(deps.__calls.some(c => c.name === 'requestBuildInternal'), 'must call requestBuildInternal')
})

await test("detecting-ci-secrets (single GitHub target) → next 'ask-github-actions-setup' (uses detectCiSecretTargets)", async () => {
  const deps = makeDeps()
  const res = await runAndroidEffect('detecting-ci-secrets', tailProgress(), deps)
  assertEquals(res.next, 'ask-github-actions-setup', 'a single GitHub target routes to the GitHub Actions setup prompt')
  assert(deps.__calls.some(c => c.name === 'detectCiSecretTargets'), 'must call detectCiSecretTargets')
})

await test("checking-ci-secrets (GitHub) → next 'confirm-secrets-push' (uses getCiSecretRepoLabelAsync + listExistingCiSecretKeysAsync)", async () => {
  const deps = makeDeps()
  const progress = tailProgress({ ciSecretTarget: GITHUB_TARGET, setupMode: 'with-workflow' })
  const res = await runAndroidEffect('checking-ci-secrets', progress, deps)
  assertEquals(res.next, 'confirm-secrets-push', 'GitHub target routes to the confirm-secrets-push gate')
  assert(deps.__calls.some(c => c.name === 'getCiSecretRepoLabelAsync'), 'must resolve the repo label')
  assert(deps.__calls.some(c => c.name === 'listExistingCiSecretKeysAsync'), 'must list existing secret keys')
})

await test("uploading-ci-secrets (setupMode=with-workflow) → next 'pick-package-manager' (uses uploadCiSecretsAsync)", async () => {
  const deps = makeDeps()
  const progress = tailProgress({ ciSecretTarget: GITHUB_TARGET, setupMode: 'with-workflow' })
  const res = await runAndroidEffect('uploading-ci-secrets', progress, deps)
  assertEquals(res.next, 'pick-package-manager', 'with-workflow continues into the workflow-builder sub-flow')
  assert(deps.__calls.some(c => c.name === 'uploadCiSecretsAsync'), 'must call uploadCiSecretsAsync')
})

await test("uploading-ci-secrets (setupMode=secrets-only) → next 'build-complete'", async () => {
  const deps = makeDeps()
  const progress = tailProgress({ ciSecretTarget: GITHUB_TARGET, setupMode: 'secrets-only' })
  const res = await runAndroidEffect('uploading-ci-secrets', progress, deps)
  assertEquals(res.next, 'build-complete', 'secrets-only finishes after upload')
})

await test("exporting-env (written) → next 'build-complete' (uses exportCredentialsToEnv + defaultExportPath)", async () => {
  const deps = makeDeps()
  const res = await runAndroidEffect('exporting-env', tailProgress(), deps)
  assertEquals(res.next, 'build-complete', 'a successful export finishes the wizard')
  assert(deps.__calls.some(c => c.name === 'exportCredentialsToEnv'), 'must call exportCredentialsToEnv')
})

await test("writing-workflow-file (written) → next 'build-complete' (uses writeWorkflowFile)", async () => {
  const deps = makeDeps()
  const progress = tailProgress({
    ciSecretTarget: GITHUB_TARGET,
    setupMode: 'with-workflow',
    selectedPackageManager: 'bun',
    buildScriptChoice: { type: 'npm-script', name: 'build' },
  })
  const res = await runAndroidEffect('writing-workflow-file', progress, deps)
  assertEquals(res.next, 'build-complete', 'after the workflow file is written the wizard finishes')
  assert(deps.__calls.some(c => c.name === 'writeWorkflowFile'), 'must call writeWorkflowFile')
})

// ─── CHOICE / INPUT tail steps: assert each exposes a usable (non-auto) view ──
//
// These do not run through runAndroidEffect; the driver renders them and waits
// for input. The spec only requires androidViewForStep to return a view whose
// kind is a choice/input (so a driver can advance it).

const CHOICE_INPUT_STEPS = [
  'ask-github-actions-setup',
  'confirm-secrets-push',
  'ask-export-env',
  'ask-build',
  'pick-package-manager',
  'pick-build-script',
  'preview-workflow-file',
]

for (const step of CHOICE_INPUT_STEPS) {
  await test(`androidViewForStep('${step}') exposes a choice/input view`, async () => {
    const view = androidViewForStep(step, tailProgress(), { appId: APP_ID })
    assert(view, `view for ${step} must exist`)
    assertEquals(view.step, step, 'view.step must echo the requested step')
    assert(
      view.kind === 'choice' || view.kind === 'input',
      `${step} must be a choice/input step (got kind=${view.kind})`,
    )
  })
}

// ─── Terminal tail step views ────────────────────────────────────────────────

await test("androidViewForStep('build-complete') is a done view", async () => {
  const view = androidViewForStep('build-complete', tailProgress(), { appId: APP_ID })
  assertEquals(view.kind, 'done', 'build-complete must be a done view')
  assert(typeof view.message === 'string' && view.message.length > 0, 'build-complete must carry a message')
})

// ─── Resume routing THROUGH the tail (getAndroidResumeStep) ──────────────────
//
// A saved progress mid-tail must resume at the correct tail step using the
// persisted TailProgress fields + the post-save completedSteps markers
// (credentialsSaved / buildRequested / ciSecretsUploaded), WITHOUT re-firing a
// side-effect that already ran (no re-upload of secrets, no re-request of the
// build). `tailProgress()` already satisfies the keystore-validity gate, so
// adding the tail markers exercises only the new Phase-6 routing.

const CREDS_SAVED = { savedAt: '2026-06-03T01:00:00.000Z' }
const BUILD_REQUESTED = { buildUrl: `https://capgo.app/app/${APP_ID}/builds` }
const CI_UPLOADED_GH = { provider: 'github', count: 3 }

/**
 * A FULLY-provisioned OAuth progress — keystore valid + every provisioning
 * marker present + the ephemeral SA key — so `getAndroidResumeStep` reaches the
 * terminal `saving-credentials` when NO tail marker is set. The engine-effect
 * `tailProgress()` fixture above only carries the keystore + package markers
 * (enough to DRIVE a single tail step), so it would otherwise resume on the
 * OAuth path; this helper closes that gap for the resume-routing assertions.
 */
function provisionedProgress(overrides = {}) {
  const base = tailProgress()
  const { completedSteps: completedOverrides, ...rest } = overrides
  return {
    ...base,
    _oauthRefreshToken: 'refresh-token',
    ...rest,
    completedSteps: {
      ...base.completedSteps,
      googleSignInComplete: { email: 'user@example.com', googleSubject: 'sub', scope: 'all' },
      playAccountChosen: { developerId: '123456789' },
      gcpProjectChosen: { projectId: 'capgo-test', displayName: 'Capgo', createdByOnboarding: false },
      serviceAccountProvisioned: { email: 'sa@capgo-test.iam.gserviceaccount.com', projectId: 'capgo-test' },
      playInviteProvisioned: { developerId: '123456789', serviceAccountEmail: 'sa@capgo-test.iam.gserviceaccount.com' },
      ...completedOverrides,
    },
  }
}

/** A post-save tail progress: fully provisioned + credentials already written. */
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

// Without ANY tail marker, resume is unchanged: a fully-provisioned progress
// still lands on saving-credentials (legacy / in-flight files untouched).
await test('no tail marker → resume stays saving-credentials (legacy parity)', async () => {
  assertEquals(getAndroidResumeStep(provisionedProgress()), 'saving-credentials')
})

// credentialsSaved but no build requested → the ask-build USER GATE, never the
// auto requesting-build step (this is the double-build guard).
await test('credentials saved, pre-build → ask-build (not requesting-build)', async () => {
  assertEquals(getAndroidResumeStep(savedTailProgress()), 'ask-build')
})

// Build queued, no CI work yet → detecting-ci-secrets (read-only, idempotent).
await test('after build, pre-CI-detection → detecting-ci-secrets', async () => {
  const p = savedTailProgress({ completedSteps: { buildRequested: BUILD_REQUESTED } })
  assertEquals(getAndroidResumeStep(p), 'detecting-ci-secrets')
})

// Build queued + a CI target already chosen, not uploaded → checking-ci-secrets
// (the read-only remote check before the confirm gate), NOT uploading.
await test('after build, target chosen, pre-upload → checking-ci-secrets (no re-upload)', async () => {
  const p = savedTailProgress({
    ciSecretTarget: GITHUB_TARGET,
    setupMode: 'with-workflow',
    completedSteps: { buildRequested: BUILD_REQUESTED },
  })
  const next = getAndroidResumeStep(p)
  assertEquals(next, 'checking-ci-secrets')
  assert(next !== 'uploading-ci-secrets', 'must never resume directly onto the upload step')
})

// Declined GitHub Actions, no export path yet → the env-export prompt.
await test('after build, declined GH Actions, no export path → ask-export-env', async () => {
  const p = savedTailProgress({
    setupMode: 'declined',
    completedSteps: { buildRequested: BUILD_REQUESTED },
  })
  assertEquals(getAndroidResumeStep(p), 'ask-export-env')
})

// Declined GitHub Actions WITH an export path recorded → the (overwrite-safe)
// export write effect.
await test('after build, declined GH Actions, export path set → exporting-env', async () => {
  const p = savedTailProgress({
    setupMode: 'declined',
    envExportTargetPath: `/tmp/.env.capgo.${APP_ID}.android`,
    completedSteps: { buildRequested: BUILD_REQUESTED },
  })
  assertEquals(getAndroidResumeStep(p), 'exporting-env')
})

// Secrets uploaded + with-workflow, no package manager yet → pick-package-manager.
await test('after upload, with-workflow, no PM → pick-package-manager', async () => {
  const p = savedTailProgress({
    ciSecretTarget: GITHUB_TARGET,
    setupMode: 'with-workflow',
    completedSteps: { buildRequested: BUILD_REQUESTED, ciSecretsUploaded: CI_UPLOADED_GH },
  })
  assertEquals(getAndroidResumeStep(p), 'pick-package-manager')
})

// Secrets uploaded + PM chosen, no build script yet → pick-build-script.
await test('after upload, with-workflow, PM set, no build script → pick-build-script', async () => {
  const p = savedTailProgress({
    ciSecretTarget: GITHUB_TARGET,
    setupMode: 'with-workflow',
    selectedPackageManager: 'bun',
    completedSteps: { buildRequested: BUILD_REQUESTED, ciSecretsUploaded: CI_UPLOADED_GH },
  })
  assertEquals(getAndroidResumeStep(p), 'pick-build-script')
})

// Secrets uploaded + PM + build script chosen → writing-workflow-file (the
// overwrite=true write step; safe to re-run). This is the task's
// "after CI upload, pre-workflow → writing-workflow-file" case.
await test('after upload, with-workflow, PM + script set → writing-workflow-file', async () => {
  const p = savedTailProgress({
    ciSecretTarget: GITHUB_TARGET,
    setupMode: 'with-workflow',
    selectedPackageManager: 'bun',
    buildScriptChoice: { type: 'npm-script', name: 'build' },
    completedSteps: { buildRequested: BUILD_REQUESTED, ciSecretsUploaded: CI_UPLOADED_GH },
  })
  assertEquals(getAndroidResumeStep(p), 'writing-workflow-file')
})

// Secrets uploaded + secrets-only (no workflow) → terminal build-complete.
await test('after upload, secrets-only → build-complete', async () => {
  const p = savedTailProgress({
    ciSecretTarget: GITHUB_TARGET,
    setupMode: 'secrets-only',
    completedSteps: { buildRequested: BUILD_REQUESTED, ciSecretsUploaded: CI_UPLOADED_GH },
  })
  assertEquals(getAndroidResumeStep(p), 'build-complete')
})

// The same tail routing must hold for the IMPORTED-SA path (serviceAccountMethod
// 'existing'): credentialsSaved short-circuits BEFORE the service-account fork,
// so an existing-SA tail progress resumes through the tail, not back to import.
await test('imported-SA tail progress resumes through the tail, not the import fork', async () => {
  const p = savedTailProgress({
    serviceAccountMethod: 'existing',
    completedSteps: { buildRequested: BUILD_REQUESTED },
  })
  assertEquals(getAndroidResumeStep(p), 'detecting-ci-secrets')
})

// `applyAndroidInput` is imported as part of the engine contract this spec
// drives; reference it so a regression that drops the export fails here too.
assert(typeof applyAndroidInput === 'function', 'applyAndroidInput must be exported from the engine')

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${testsPassed} passed, ${testsFailed} failed`)
if (testsFailed > 0)
  process.exit(1)
