#!/usr/bin/env node
/**
 * Plan — spec for the PLATFORM-NEUTRAL shared tail engine
 * (`src/build/onboarding/tail/flow.ts`).
 *
 * The post-save "tail" (CI-secrets → env-export → workflow-file → build-request)
 * was extracted out of `android/flow.ts` into a single platform-neutral module
 * so the iOS and Android tracks cannot drift. This test drives that shared
 * module DIRECTLY (not via the android adapter) acting as the headless driver:
 * it captures each `TailEffectResult.transient` and threads it back as
 * `deps.carried` on the next effect, exactly as the Ink TUI mirrors its React
 * state.
 *
 * It asserts the SAME routing the android tail engine test checks
 * (`test-android-tail-engine.mjs`), proving the extraction is behaviour-
 * preserving — but reached through the neutral surface with an injected
 * `platform`/`buildSavedCredentials`/`rebuildTailCredentials`/`resumeStep`. It
 * also exercises platform:'ios' through the neutral steps that do not need any
 * iOS-specific credential SHAPE (detect / upload / build-request / views).
 */
import process from 'node:process'

const {
  runTailEffect,
  tailViewForStep,
  applyTailInput,
} = await import('../src/build/onboarding/tail/flow.ts')

console.log('🧪 Shared platform-neutral TAIL engine — drives runTailEffect/tailViewForStep/applyTailInput\n')

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

// The ANDROID saved-credential SHAPE the driver supplies to the neutral engine.
const ANDROID_CREDENTIALS = {
  ANDROID_KEYSTORE_FILE: 'a2V5',
  KEYSTORE_KEY_ALIAS: 'release',
  KEYSTORE_STORE_PASSWORD: 'pw',
  KEYSTORE_KEY_PASSWORD: 'pw',
  PLAY_CONFIG_JSON: 'eyJ9',
}

/** Progress mid-tail. Carries the same TailProgress fields the android fixture does. */
function tailProgress(overrides = {}) {
  return {
    platform: 'android',
    appId: APP_ID,
    startedAt: '2026-06-03T00:00:00.000Z',
    _keystoreBase64: 'a2V5',
    _serviceAccountKeyBase64: 'eyJ9',
    keystoreStorePassword: 'pw',
    keystoreKeyPassword: 'pw',
    keystoreAlias: 'release',
    ...overrides,
  }
}

/**
 * Android-shaped credential builder + lossy rebuild the driver injects. The
 * shared engine is platform-neutral — these mirror what `android/flow.ts`'s
 * `buildAndroidSavedCredentials` / `rebuildTailCredentials` supply.
 */
function buildAndroidSavedCredentials(progress) {
  if (!progress._keystoreBase64) throw new Error('keystore not ready')
  if (!progress._serviceAccountKeyBase64) throw new Error('service-account key not provisioned')
  if (!progress.keystoreStorePassword || !progress.keystoreAlias) throw new Error('keystore inputs missing')
  return {
    ANDROID_KEYSTORE_FILE: progress._keystoreBase64,
    KEYSTORE_KEY_ALIAS: progress.keystoreAlias,
    KEYSTORE_STORE_PASSWORD: progress.keystoreStorePassword,
    KEYSTORE_KEY_PASSWORD: progress.keystoreKeyPassword || progress.keystoreStorePassword,
    PLAY_CONFIG_JSON: progress._serviceAccountKeyBase64,
  }
}

function rebuildAndroidTailCredentials(progress) {
  if (!progress._keystoreBase64 || !progress._serviceAccountKeyBase64 || !progress.keystoreStorePassword || !progress.keystoreAlias)
    return {}
  return {
    ANDROID_KEYSTORE_FILE: progress._keystoreBase64,
    KEYSTORE_KEY_ALIAS: progress.keystoreAlias,
    KEYSTORE_STORE_PASSWORD: progress.keystoreStorePassword,
    KEYSTORE_KEY_PASSWORD: progress.keystoreKeyPassword || progress.keystoreStorePassword,
    PLAY_CONFIG_JSON: progress._serviceAccountKeyBase64,
  }
}

/**
 * Mocked TailEffectDeps. Every helper returns canned data — NO fs, NO network.
 * Records which helpers fired so the spec can assert the engine used the same
 * pure helper the android tail did.
 */
function makeDeps(overrides = {}) {
  const calls = []

  const deps = {
    platform: 'android',
    buildSavedCredentials: buildAndroidSavedCredentials,
    rebuildTailCredentials: rebuildAndroidTailCredentials,
    resumeStep: () => 'saving-credentials',

    updateSavedCredentials: async (...a) => { calls.push({ name: 'updateSavedCredentials', args: a }) },
    loadProgress: async () => null,
    saveProgress: async (...a) => { calls.push({ name: 'saveProgress', args: a }) },
    deleteProgress: async (...a) => { calls.push({ name: 'deleteProgress', args: a }) },

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

    ...overrides,
  }
  deps.__calls = calls
  return deps
}

// ─── AUTO tail steps: drive through runTailEffect (android platform) ──────────

await test("saving-credentials → next 'ask-build' (uses createCiSecretEntries + buildSavedCredentials)", async () => {
  const deps = makeDeps()
  const res = await runTailEffect('saving-credentials', tailProgress(), deps)
  assertEquals(res.next, 'ask-build', 'saving-credentials must route to ask-build')
  assert(deps.__calls.some(c => c.name === 'createCiSecretEntries'), 'must call createCiSecretEntries to stash CI entries')
  assert(deps.__calls.some(c => c.name === 'updateSavedCredentials'), 'must persist credentials')
  assert(deps.__calls.some(c => c.name === 'deleteProgress'), 'must delete progress on save')
  // The android credential SHAPE was supplied via buildSavedCredentials.
  const upd = deps.__calls.find(c => c.name === 'updateSavedCredentials')
  assertEquals(upd.args[1], 'android', 'updateSavedCredentials platform arg comes from deps.platform')
  assert(upd.args[2].ANDROID_KEYSTORE_FILE === 'a2V5', 'credential map is the android SHAPE')
})

await test("saving-credentials self-heal: resumeStep diverts when progress moved on", async () => {
  const deps = makeDeps({
    loadProgress: async () => tailProgress(),
    resumeStep: () => 'ask-build', // a fresh load that no longer wants saving-credentials
  })
  const res = await runTailEffect('saving-credentials', tailProgress(), deps)
  assertEquals(res.next, 'ask-build', 'self-heal diverts to the resolved resume step')
  assert(!deps.__calls.some(c => c.name === 'updateSavedCredentials'), 'must NOT save when diverted')
})

await test("requesting-build (success, entries present) → next 'detecting-ci-secrets' (uses requestBuildInternal)", async () => {
  const deps = makeDeps()
  const res = await runTailEffect('requesting-build', tailProgress(), deps)
  assertEquals(res.next, 'detecting-ci-secrets', 'a successful build with pending entries must route to detecting-ci-secrets')
  assert(deps.__calls.some(c => c.name === 'requestBuildInternal'), 'must call requestBuildInternal')
  const req = deps.__calls.find(c => c.name === 'requestBuildInternal')
  assertEquals(req.args[1].platform, 'android', 'requestBuildInternal platform comes from deps.platform')
})

// ─── CONCERN 1: requesting-build threads logger + driver-resolved apikey ───────

await test('requesting-build threads the injected logger AND a driver-RESOLVED apikey into requestBuildInternal', async () => {
  const logger = { info() {}, error() {}, warn() {}, success() {}, buildLog() {}, uploadProgress() {}, customMsg() {} }
  const deps = makeDeps({
    logger,
    resolveApikey: () => 'resolved-cli-key',
  })
  const res = await runTailEffect('requesting-build', tailProgress(), deps)
  assertEquals(res.next, 'detecting-ci-secrets', 'a successful build with pending entries routes to detecting-ci-secrets')
  const req = deps.__calls.find(c => c.name === 'requestBuildInternal')
  assert(req, 'must call requestBuildInternal')
  assertEquals(req.args[1].apikey, 'resolved-cli-key', 'requestBuildInternal must receive the driver-resolved apikey (NOT hardcoded empty string)')
  assertEquals(req.args[1].aiAnalysisMode, 'caller-handled', 'caller-handled mode so the TUI owns the AI sub-flow')
  assertEquals(req.args[3], logger, 'requestBuildInternal must receive the injected BuildLogger as the 4th arg')
})

await test('requesting-build with no resolved apikey routes straight to build-complete (no build attempt)', async () => {
  const deps = makeDeps({
    resolveApikey: () => undefined,
  })
  const res = await runTailEffect('requesting-build', tailProgress(), deps)
  assertEquals(res.next, 'build-complete', 'no API key → skip the build attempt and finish')
  assert(!deps.__calls.some(c => c.name === 'requestBuildInternal'), 'must NOT call requestBuildInternal when no key is resolvable')
})

await test('requesting-build success (success, NO entries) → build-complete with buildUrl', async () => {
  const deps = makeDeps({ carried: { ciSecretEntries: [] } })
  const res = await runTailEffect('requesting-build', tailProgress(), deps)
  assertEquals(res.next, 'build-complete', 'a successful build with no pending entries finishes the wizard')
  assert(res.transient && typeof res.transient.buildUrl === 'string', 'must surface the build URL in transient')
})

await test('requesting-build failure with AI job ready → next ai-analysis-prompt (TUI renders it; aiJobId in transient)', async () => {
  const deps = makeDeps({
    requestBuildInternal: async (...a) => {
      deps.__calls.push({ name: 'requestBuildInternal', args: a })
      return { success: false, error: 'boom', aiAnalysis: { jobId: 'JOB1', capturedLogPath: '/tmp/log', ready: true } }
    },
    resolveApikey: () => 'k',
  })
  const res = await runTailEffect('requesting-build', tailProgress(), deps)
  assertEquals(res.next, 'ai-analysis-prompt', 'a failed build with a ready AI job routes to ai-analysis-prompt')
  assertEquals(res.transient && res.transient.aiJobId, 'JOB1', 'the AI job id must ride in transient for the TUI')
})

await test('requesting-build failure with NO AI job → build-complete', async () => {
  const deps = makeDeps({
    requestBuildInternal: async (...a) => {
      deps.__calls.push({ name: 'requestBuildInternal', args: a })
      return { success: false, error: 'boom' }
    },
    resolveApikey: () => 'k',
  })
  const res = await runTailEffect('requesting-build', tailProgress(), deps)
  assertEquals(res.next, 'build-complete', 'a failed build with no AI job finishes the wizard')
})

await test("detecting-ci-secrets (single GitHub target) → next 'ask-github-actions-setup' (uses detectCiSecretTargets)", async () => {
  const deps = makeDeps()
  const res = await runTailEffect('detecting-ci-secrets', tailProgress(), deps)
  assertEquals(res.next, 'ask-github-actions-setup', 'a single GitHub target routes to the GitHub Actions setup prompt')
  assert(deps.__calls.some(c => c.name === 'detectCiSecretTargets'), 'must call detectCiSecretTargets')
})

await test("checking-ci-secrets (GitHub) → next 'confirm-secrets-push' (uses getCiSecretRepoLabelAsync + listExistingCiSecretKeysAsync)", async () => {
  const deps = makeDeps()
  const progress = tailProgress({ ciSecretTarget: GITHUB_TARGET, setupMode: 'with-workflow' })
  const res = await runTailEffect('checking-ci-secrets', progress, deps)
  assertEquals(res.next, 'confirm-secrets-push', 'GitHub target routes to the confirm-secrets-push gate')
  assert(deps.__calls.some(c => c.name === 'getCiSecretRepoLabelAsync'), 'must resolve the repo label')
  assert(deps.__calls.some(c => c.name === 'listExistingCiSecretKeysAsync'), 'must list existing secret keys')
})

await test("uploading-ci-secrets (setupMode=with-workflow) → next 'pick-package-manager' (uses uploadCiSecretsAsync)", async () => {
  const deps = makeDeps()
  const progress = tailProgress({ ciSecretTarget: GITHUB_TARGET, setupMode: 'with-workflow' })
  const res = await runTailEffect('uploading-ci-secrets', progress, deps)
  assertEquals(res.next, 'pick-package-manager', 'with-workflow continues into the workflow-builder sub-flow')
  assert(deps.__calls.some(c => c.name === 'uploadCiSecretsAsync'), 'must call uploadCiSecretsAsync')
})

await test("uploading-ci-secrets (setupMode=secrets-only) → next 'build-complete'", async () => {
  const deps = makeDeps()
  const progress = tailProgress({ ciSecretTarget: GITHUB_TARGET, setupMode: 'secrets-only' })
  const res = await runTailEffect('uploading-ci-secrets', progress, deps)
  assertEquals(res.next, 'build-complete', 'secrets-only finishes after upload')
})

await test("exporting-env (written) → next 'build-complete' (uses exportCredentialsToEnv + defaultExportPath)", async () => {
  const deps = makeDeps()
  const res = await runTailEffect('exporting-env', tailProgress(), deps)
  assertEquals(res.next, 'build-complete', 'a successful export finishes the wizard')
  assert(deps.__calls.some(c => c.name === 'exportCredentialsToEnv'), 'must call exportCredentialsToEnv')
  const ex = deps.__calls.find(c => c.name === 'exportCredentialsToEnv')
  assertEquals(ex.args[0].platform, 'android', 'exportCredentialsToEnv platform comes from deps.platform')
})

await test("writing-workflow-file (written) → next 'build-complete' (uses writeWorkflowFile)", async () => {
  const deps = makeDeps()
  const progress = tailProgress({
    ciSecretTarget: GITHUB_TARGET,
    setupMode: 'with-workflow',
    selectedPackageManager: 'bun',
    buildScriptChoice: { type: 'npm-script', name: 'build' },
  })
  const res = await runTailEffect('writing-workflow-file', progress, deps)
  assertEquals(res.next, 'build-complete', 'after the workflow file is written the wizard finishes')
  assert(deps.__calls.some(c => c.name === 'writeWorkflowFile'), 'must call writeWorkflowFile')
  const wf = deps.__calls.find(c => c.name === 'writeWorkflowFile')
  assertEquals(wf.args[0].defaultPlatform, 'android', 'workflow defaultPlatform comes from deps.platform')
})

// ─── DRIVER threading: resolve credentials + CI entries ONCE, reuse downstream ──

const RESOLVED_ENTRIES = [
  { key: 'ANDROID_KEYSTORE_FILE', value: 'a2V5', masked: true },
  { key: 'KEYSTORE_KEY_ALIAS', value: 'release', masked: false },
  { key: 'CAPGO_TOKEN', value: 'resolved-capgo-key', masked: true },
]
const EXISTING_KEYS = ['CAPGO_TOKEN']

function makeDriverDeps(overrides = {}) {
  return makeDeps({
    createCiSecretEntries: (..._a) => {
      makeDriverDeps.__entryCalls = (makeDriverDeps.__entryCalls || 0) + 1
      return RESOLVED_ENTRIES
    },
    ...overrides,
  })
}

await test('DRIVER: createCiSecretEntries resolves ONCE at saving-credentials and is REUSED (not rebuilt) in checking', async () => {
  makeDriverDeps.__entryCalls = 0
  const deps = makeDriverDeps()

  // ── 1) saving-credentials: resolve entries + credentials ONCE ──
  const saved = await runTailEffect('saving-credentials', tailProgress(), deps)
  assertEquals(saved.next, 'ask-build', 'saving-credentials routes to ask-build')
  assertEquals(makeDriverDeps.__entryCalls, 1, 'createCiSecretEntries must be called exactly once (at saving-credentials)')
  assert(saved.transient && saved.transient.ciSecretEntries, 'saving-credentials must return ciSecretEntries in transient')
  assert(saved.transient.savedCredentials, 'saving-credentials must return savedCredentials in transient')
  assert(
    saved.transient.ciSecretEntries.some(e => e.key === 'CAPGO_TOKEN'),
    'resolved entries must include the CAPGO_TOKEN folded in at saving-credentials',
  )

  // The driver captures the transient and threads it back as carried.
  const carried = {
    savedCredentials: saved.transient.savedCredentials,
    ciSecretEntries: saved.transient.ciSecretEntries,
  }

  // ── 2) checking-ci-secrets: REUSE carried entries — do NOT rebuild ──
  const checkDeps = makeDriverDeps({ carried })
  const checkProgress = tailProgress({ ciSecretTarget: GITHUB_TARGET, setupMode: 'with-workflow' })
  const checked = await runTailEffect('checking-ci-secrets', checkProgress, checkDeps)
  assertEquals(checked.next, 'confirm-secrets-push', 'GitHub target routes to confirm-secrets-push')
  assertEquals(makeDriverDeps.__entryCalls, 1, 'checking-ci-secrets must REUSE carried entries, NOT rebuild them')
  assert(!checkDeps.__calls.some(c => c.name === 'createCiSecretEntries'), 'checking-ci-secrets must not call createCiSecretEntries')
  const listCall = checkDeps.__calls.find(c => c.name === 'listExistingCiSecretKeysAsync')
  assert(listCall, 'must list existing secret keys')
  assert(
    listCall.args[1].includes('CAPGO_TOKEN'),
    'listExistingCiSecretKeysAsync must receive the carried entries’ keys (incl. CAPGO_TOKEN)',
  )
  assert(checked.transient && Array.isArray(checked.transient.ciSecretExistingKeys), 'checking must return ciSecretExistingKeys in transient')
})

await test('DRIVER: uploading-ci-secrets passes the carried existing-keys list to uploadCiSecretsAsync (4th arg)', async () => {
  makeDriverDeps.__entryCalls = 0
  const carried = {
    ciSecretEntries: RESOLVED_ENTRIES,
    ciSecretExistingKeys: EXISTING_KEYS,
  }
  const deps = makeDriverDeps({ carried })
  const progress = tailProgress({ ciSecretTarget: GITHUB_TARGET, setupMode: 'with-workflow' })
  const res = await runTailEffect('uploading-ci-secrets', progress, deps)
  assertEquals(res.next, 'pick-package-manager', 'with-workflow continues into the workflow builder')
  const upload = deps.__calls.find(c => c.name === 'uploadCiSecretsAsync')
  assert(upload, 'must call uploadCiSecretsAsync')
  assertEquals(upload.args[0], GITHUB_TARGET, 'uploadCiSecretsAsync target arg')
  assertEquals(upload.args[1], RESOLVED_ENTRIES, 'uploadCiSecretsAsync must reuse the carried entries')
  assertEquals(upload.args[2], EXISTING_KEYS, 'uploadCiSecretsAsync must receive the carried existing-keys as the 4th (3rd positional) arg')
  assertEquals(makeDriverDeps.__entryCalls, 0, 'uploading must not call createCiSecretEntries when entries are carried')
})

await test('DRIVER: env-export writes the FULL carried savedCredentials (not a lossy rebuild)', async () => {
  const FULL_CREDS = { ...ANDROID_CREDENTIALS }
  const deps = makeDriverDeps({ carried: { savedCredentials: FULL_CREDS } })
  const res = await runTailEffect('exporting-env', tailProgress(), deps)
  assertEquals(res.next, 'build-complete', 'a successful export finishes the wizard')
  const exportCall = deps.__calls.find(c => c.name === 'exportCredentialsToEnv')
  assert(exportCall, 'must call exportCredentialsToEnv')
  assertEquals(exportCall.args[0].credentials, FULL_CREDS, 'exportCredentialsToEnv must receive the full carried savedCredentials')
})

await test('DRIVER: overwrite-and-export-env also writes the FULL carried savedCredentials', async () => {
  const FULL_CREDS = { ...ANDROID_CREDENTIALS }
  const deps = makeDriverDeps({ carried: { savedCredentials: FULL_CREDS } })
  const progress = tailProgress({ setupMode: 'declined', envExportTargetPath: `/tmp/.env.capgo.${APP_ID}.android` })
  const res = await runTailEffect('overwrite-and-export-env', progress, deps)
  assertEquals(res.next, 'build-complete', 'overwrite export finishes the wizard')
  const exportCall = deps.__calls.find(c => c.name === 'exportCredentialsToEnv')
  assert(exportCall, 'must call exportCredentialsToEnv')
  assertEquals(exportCall.args[0].credentials, FULL_CREDS, 'overwrite export must receive the full carried savedCredentials')
  assertEquals(exportCall.args[0].overwrite, true, 'overwrite export must pass overwrite: true')
})

await test('DRIVER: saving-credentials logs the random-password backup hint when keystorePasswordGenerated is set', async () => {
  const logs = []
  const deps = makeDriverDeps({ onLog: (msg, color) => logs.push({ msg, color }) })
  await runTailEffect('saving-credentials', tailProgress({ keystorePasswordGenerated: true }), deps)
  assert(
    logs.some(l => /auto-generated keystore password/i.test(l.msg) && /back up that file/i.test(l.msg)),
    'must emit the random-password backup hint when keystorePasswordGenerated is true',
  )
})

await test('DRIVER: saving-credentials does NOT log the backup hint when keystorePasswordGenerated is unset', async () => {
  const logs = []
  const deps = makeDriverDeps({ onLog: (msg, color) => logs.push({ msg, color }) })
  await runTailEffect('saving-credentials', tailProgress(), deps)
  assert(
    !logs.some(l => /auto-generated keystore password/i.test(l.msg)),
    'must NOT emit the backup hint when the password was not auto-generated',
  )
})

await test('DRIVER: writing-workflow-file reuses the carried entries’ keys (no rebuild)', async () => {
  makeDriverDeps.__entryCalls = 0
  const deps = makeDriverDeps({ carried: { ciSecretEntries: RESOLVED_ENTRIES } })
  const progress = tailProgress({
    ciSecretTarget: GITHUB_TARGET,
    setupMode: 'with-workflow',
    selectedPackageManager: 'bun',
    buildScriptChoice: { type: 'npm-script', name: 'build' },
  })
  const res = await runTailEffect('writing-workflow-file', progress, deps)
  assertEquals(res.next, 'build-complete', 'after the workflow file is written the wizard finishes')
  const writeCall = deps.__calls.find(c => c.name === 'writeWorkflowFile')
  assert(writeCall, 'must call writeWorkflowFile')
  assert(
    writeCall.args[0].secretKeys.includes('CAPGO_TOKEN'),
    'workflow secretKeys must come from the carried entries (incl. CAPGO_TOKEN)',
  )
  assertEquals(makeDriverDeps.__entryCalls, 0, 'writing-workflow-file must not rebuild entries when they are carried')
})

await test('DRIVER: detecting-ci-secrets surfaces setup advice via transient on the single-target path', async () => {
  const deps = makeDriverDeps({
    detectCiSecretTargets: () => ({ targets: [GITHUB_TARGET], setup: [{ provider: 'github', steps: ['gh auth login'] }], notes: [] }),
  })
  const res = await runTailEffect('detecting-ci-secrets', tailProgress(), deps)
  assert(res.transient, 'detecting must return a transient')
  assert(Array.isArray(res.transient.ciSecretSetupAdvice), 'detecting must surface ciSecretSetupAdvice on every path')
  assertEquals(res.transient.ciSecretSetupAdvice.length, 1, 'setup advice must be carried through even when a target is reachable')
})

// ─── CROSS-PLATFORM: detection / upload / build-request are credential-agnostic ─
//
// platform:'ios' through the neutral steps. These do NOT need an iOS credential
// SHAPE — they only need the platform tag threaded into the helper calls and the
// same routing. The driver supplies an iOS platform tag + carried entries (so no
// re-build is needed) and a build-cred-agnostic buildSavedCredentials/rebuild.

function makeIosDeps(overrides = {}) {
  return makeDeps({
    platform: 'ios',
    buildSavedCredentials: () => ({ /* iOS shape — unused on these steps */ }),
    rebuildTailCredentials: () => ({}),
    carried: { ciSecretEntries: RESOLVED_ENTRIES },
    ...overrides,
  })
}

await test("ios: detecting-ci-secrets (single GitHub target) → 'ask-github-actions-setup'", async () => {
  const deps = makeIosDeps()
  const res = await runTailEffect('detecting-ci-secrets', tailProgress({ platform: 'ios' }), deps)
  assertEquals(res.next, 'ask-github-actions-setup', 'ios single GitHub target routes identically')
  assert(deps.__calls.some(c => c.name === 'detectCiSecretTargets'), 'must call detectCiSecretTargets')
})

await test("ios: uploading-ci-secrets (with-workflow) → 'pick-package-manager' (uses deps.platform=ios nowhere here)", async () => {
  const deps = makeIosDeps()
  const progress = tailProgress({ platform: 'ios', ciSecretTarget: GITHUB_TARGET, setupMode: 'with-workflow' })
  const res = await runTailEffect('uploading-ci-secrets', progress, deps)
  assertEquals(res.next, 'pick-package-manager', 'ios with-workflow continues into the workflow builder')
  const upload = deps.__calls.find(c => c.name === 'uploadCiSecretsAsync')
  assertEquals(upload.args[1], RESOLVED_ENTRIES, 'ios upload reuses carried entries')
})

await test("ios: requesting-build (success, entries) → 'detecting-ci-secrets' with platform:ios in the request", async () => {
  const deps = makeIosDeps()
  const res = await runTailEffect('requesting-build', tailProgress({ platform: 'ios' }), deps)
  assertEquals(res.next, 'detecting-ci-secrets', 'ios success with entries routes to detecting-ci-secrets')
  const req = deps.__calls.find(c => c.name === 'requestBuildInternal')
  assertEquals(req.args[1].platform, 'ios', 'requestBuildInternal platform comes from deps.platform=ios')
})

await test("ios: writing-workflow-file sets defaultPlatform:ios", async () => {
  const deps = makeIosDeps()
  const progress = tailProgress({
    platform: 'ios',
    ciSecretTarget: GITHUB_TARGET,
    setupMode: 'with-workflow',
    selectedPackageManager: 'npm',
    buildScriptChoice: { type: 'npm-script', name: 'build' },
  })
  const res = await runTailEffect('writing-workflow-file', progress, deps)
  assertEquals(res.next, 'build-complete', 'ios workflow write finishes the wizard')
  const wf = deps.__calls.find(c => c.name === 'writeWorkflowFile')
  assertEquals(wf.args[0].defaultPlatform, 'ios', 'workflow defaultPlatform=ios comes from deps.platform')
})

await test("ios: exporting-env passes platform:ios to exportCredentialsToEnv", async () => {
  const deps = makeIosDeps({ carried: { savedCredentials: { ASC_KEY: 'x' } } })
  const res = await runTailEffect('exporting-env', tailProgress({ platform: 'ios' }), deps)
  assertEquals(res.next, 'build-complete', 'ios export finishes the wizard')
  const ex = deps.__calls.find(c => c.name === 'exportCredentialsToEnv')
  assertEquals(ex.args[0].platform, 'ios', 'exportCredentialsToEnv platform=ios comes from deps.platform')
  // No envExportTargetPath on progress → defaultExportPath fires with platform=ios.
  const def = deps.__calls.find(c => c.name === 'defaultExportPath')
  assert(def, 'defaultExportPath must be called when no envExportTargetPath is set')
  assertEquals(def.args[1], 'ios', 'defaultExportPath platform=ios comes from deps.platform')
})

// ─── CHOICE / INPUT tail VIEW steps: each exposes a usable (non-auto) view ────

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
  await test(`tailViewForStep('${step}') exposes a choice/input view`, async () => {
    const view = tailViewForStep(step, tailProgress(), { appId: APP_ID })
    assert(view, `view for ${step} must exist`)
    assertEquals(view.step, step, 'view.step must echo the requested step')
    assert(
      view.kind === 'choice' || view.kind === 'input',
      `${step} must be a choice/input step (got kind=${view.kind})`,
    )
  })
}

await test("tailViewForStep('build-complete') is a done view", async () => {
  const view = tailViewForStep('build-complete', tailProgress(), { appId: APP_ID })
  assertEquals(view.kind, 'done', 'build-complete must be a done view')
  assert(typeof view.message === 'string' && view.message.length > 0, 'build-complete must carry a message')
})

// ─── applyTailInput: the persisted-field reducers ────────────────────────────

await test('applyTailInput ci-secrets-target-select records ciSecretTarget', () => {
  const out = applyTailInput('ci-secrets-target-select', tailProgress(), { step: 'ci-secrets-target-select', ciSecretTarget: GITHUB_TARGET })
  assertEquals(out.ciSecretTarget, GITHUB_TARGET, 'records the chosen target')
})

await test('applyTailInput ask-github-actions-setup records setupMode', () => {
  const out = applyTailInput('ask-github-actions-setup', tailProgress(), { step: 'ask-github-actions-setup', value: 'with-workflow' })
  assertEquals(out.setupMode, 'with-workflow', 'records the setup mode')
})

await test('applyTailInput ask-export-env (yes) records envExportTargetPath; (no) unchanged', () => {
  const yes = applyTailInput('ask-export-env', tailProgress(), { step: 'ask-export-env', value: 'yes', envExportTargetPath: '/tmp/x.env' })
  assertEquals(yes.envExportTargetPath, '/tmp/x.env', 'yes records the path')
  const base = tailProgress()
  const no = applyTailInput('ask-export-env', base, { step: 'ask-export-env', value: 'no' })
  assertEquals(no, base, 'no returns progress unchanged')
})

await test('applyTailInput pick-package-manager records selectedPackageManager', () => {
  const out = applyTailInput('pick-package-manager', tailProgress(), { step: 'pick-package-manager', selectedPackageManager: 'bun' })
  assertEquals(out.selectedPackageManager, 'bun', 'records the chosen package manager')
})

await test('applyTailInput pick-build-script records buildScriptChoice; __custom__ is navigation-only', () => {
  const choice = { type: 'npm-script', name: 'build' }
  const out = applyTailInput('pick-build-script', tailProgress(), { step: 'pick-build-script', buildScriptChoice: choice })
  assertEquals(out.buildScriptChoice, choice, 'records the build-script choice')
  const base = tailProgress()
  const nav = applyTailInput('pick-build-script', base, { step: 'pick-build-script', value: '__custom__' })
  assertEquals(nav, base, '__custom__ is navigation-only (unchanged)')
})

await test('applyTailInput pick-build-script-custom trims + guards empty', () => {
  const out = applyTailInput('pick-build-script-custom', tailProgress(), { step: 'pick-build-script-custom', command: '  vite build  ' })
  assert(out.buildScriptChoice && out.buildScriptChoice.type === 'custom' && out.buildScriptChoice.command === 'vite build', 'records trimmed custom command')
  const base = tailProgress()
  const empty = applyTailInput('pick-build-script-custom', base, { step: 'pick-build-script-custom', command: '   ' })
  assertEquals(empty, base, 'empty custom command returns progress unchanged')
})

await test('applyTailInput navigation-only tail values fall through unchanged', () => {
  const base = tailProgress()
  for (const input of [
    { step: 'confirm-secrets-push', value: 'confirm' },
    { step: 'confirm-env-export-overwrite', value: 'skip' },
    { step: 'view-workflow-diff', value: 'close' },
    { step: 'ask-build', value: 'yes' },
    { step: 'ci-secrets-setup', value: 'retry' },
  ]) {
    assertEquals(applyTailInput(input.step, base, input), base, `${input.step}/${input.value} must be navigation-only`)
  }
})

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${testsPassed} passed, ${testsFailed} failed`)
if (testsFailed > 0)
  process.exit(1)
