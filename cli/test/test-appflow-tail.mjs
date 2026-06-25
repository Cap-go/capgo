import assert from 'node:assert'

const flow = await import('../src/build/onboarding/appflow/flow.ts')
const tail = await import('../src/build/onboarding/appflow/tail.ts')

const {
  appflowFlow,
  applyAppflowInput,
  getAppflowResumeStep,
  getAppflowBuildResumeStep,
  isAppflowTailStep,
  nextTailStep,
  markTailRunComplete,
} = flow
const { toAppflowTailDeps, buildAppflowSavedCredentials } = tail

let passed = 0
let failed = 0
function test(name, fn) {
  try {
    fn()
    console.log(`✅ ${name}`)
    passed++
  }
  catch (err) {
    console.log(`❌ ${name}\n   ${err instanceof Error ? err.message : String(err)}`)
    failed++
  }
}

// A single-platform migration that has reached the build hand-off.
function singleMigrated(platform, extra = {}) {
  const creds = platform === 'ios'
    ? { ios: { BUILD_CERTIFICATE_BASE64: 'p12', P12_PASSWORD: 'x' } }
    : { android: { ANDROID_KEYSTORE_FILE: 'ks', KEYSTORE_STORE_PASSWORD: 'x' } }
  return {
    scope: platform,
    appId: 'com.example.app',
    token: { access_token: 't' },
    orgSlug: 'org',
    ...creds,
    migratable: { ios: platform === 'ios', android: platform === 'android' },
    // Resolve the per-platform gap-fill so resume lands at handoff-build.
    iosDistGapfill: 'skip',
    androidDistGapfill: 'skip',
    completedSteps: ['explain', 'fetch-signing', 'fetch-distribution', 'validate'],
    ...extra,
  }
}

// ── 1. handoff 'build' routes INTO the tail ───────────────────────────────────
test('handoff-build is the resume step before the choice is made', () => {
  const p = singleMigrated('ios')
  assert.strictEqual(getAppflowResumeStep(p), 'handoff-build')
})

test('handoff \'build\' routes straight to the tail (saving-credentials)', () => {
  const p = singleMigrated('ios')
  const after = applyAppflowInput('handoff-build', p, { value: 'build' })
  assert.strictEqual(after.handoffChoice, 'build')
  assert.strictEqual(getAppflowResumeStep(after), 'saving-credentials')
  assert.ok(isAppflowTailStep('saving-credentials'))
})

test('handoff \'build\' (android) routes straight to the tail (saving-credentials)', () => {
  const p = singleMigrated('android')
  const after = applyAppflowInput('handoff-build', p, { value: 'build' })
  assert.strictEqual(getAppflowBuildResumeStep(after), 'saving-credentials')
})

// ── 2. 'skip' finishes ────────────────────────────────────────────────────────
test('handoff \'skip\' finishes the migration (resume -> done)', () => {
  const p = singleMigrated('ios')
  const after = applyAppflowInput('handoff-build', p, { value: 'skip' })
  assert.strictEqual(after.handoffChoice, 'skip')
  assert.strictEqual(getAppflowResumeStep(after), 'done')
})

// ── 3. single-platform build completes → done (no second-platform offer) ───────
test('markTailRunComplete marks the run built and finishes', () => {
  const p = { ...singleMigrated('ios'), handoffChoice: 'build' }
  const { progress: marked, next } = markTailRunComplete(p)
  assert.strictEqual(marked.built, true)
  assert.strictEqual(next, 'done')
})

test('getAppflowBuildResumeStep returns done once the platform is built', () => {
  const p = { ...singleMigrated('android'), handoffChoice: 'build', built: true }
  assert.strictEqual(getAppflowBuildResumeStep(p), 'done')
})

// ── 4. tail deps build saved credentials from the migrated progress ────────────
test('buildAppflowSavedCredentials selects the iOS credential map', () => {
  const p = { ...singleMigrated('ios'), appId: 'com.example.app' }
  const creds = buildAppflowSavedCredentials(p, 'ios')
  assert.strictEqual(creds.BUILD_CERTIFICATE_BASE64, 'p12')
  assert.strictEqual(creds.P12_PASSWORD, 'x')
})

test('buildAppflowSavedCredentials selects the Android credential map', () => {
  const p = { ...singleMigrated('android'), appId: 'com.example.app' }
  const creds = buildAppflowSavedCredentials(p, 'android')
  assert.strictEqual(creds.ANDROID_KEYSTORE_FILE, 'ks')
})

test('buildAppflowSavedCredentials throws when the platform has no migrated creds', () => {
  const p = { ...singleMigrated('ios'), appId: 'com.example.app' }
  assert.throws(() => buildAppflowSavedCredentials(p, 'android'), /No android credentials/)
})

test('toAppflowTailDeps builds saved credentials via buildSavedCredentials from progress', async () => {
  const deps = toAppflowTailDeps('ios', { apikey: 'k' })
  assert.strictEqual(deps.platform, 'ios')
  const p = { ...singleMigrated('ios'), appId: 'com.example.app' }
  const creds = await deps.buildSavedCredentials(p)
  assert.strictEqual(creds.BUILD_CERTIFICATE_BASE64, 'p12')
  // The thin no-disk persistence: loadProgress resolves null (no self-heal target).
  assert.strictEqual(await deps.loadProgress('com.example.app'), null)
  // resolveApikey honours the flag.
  assert.strictEqual(deps.resolveApikey(), 'k')
  // The shared CLI helpers are wired (reused, not re-implemented).
  assert.strictEqual(typeof deps.generateWorkflow, 'function')
  assert.strictEqual(typeof deps.writeWorkflowFile, 'function')
  assert.strictEqual(typeof deps.requestBuildInternal, 'function')
  assert.strictEqual(typeof deps.createCiSecretEntries, 'function')
})

test('rebuildTailCredentials re-selects the migrated map (lossy fallback)', () => {
  const deps = toAppflowTailDeps('android')
  const p = { ...singleMigrated('android'), appId: 'com.example.app' }
  assert.strictEqual(deps.rebuildTailCredentials(p).ANDROID_KEYSTORE_FILE, 'ks')
  // Absent platform map → {} (never throws), matching the native contract.
  const ios = { ...singleMigrated('ios'), appId: 'com.example.app' }
  assert.deepStrictEqual(deps.rebuildTailCredentials(ios), {})
})

// ── 5. tail interactive transitions (ask-build routes into the build) ──────────
test('nextTailStep: ask-build yes -> requesting-build, no -> build-complete', () => {
  const p = singleMigrated('ios')
  assert.strictEqual(nextTailStep('ask-build', 'yes', p), 'requesting-build')
  assert.strictEqual(nextTailStep('ask-build', 'no', p), 'build-complete')
})

test('nextTailStep: ask-github-actions-setup with-workflow -> checking-ci-secrets, no -> ask-export-env', () => {
  const p = singleMigrated('ios')
  assert.strictEqual(nextTailStep('ask-github-actions-setup', 'with-workflow', p), 'checking-ci-secrets')
  assert.strictEqual(nextTailStep('ask-github-actions-setup', 'no', p), 'ask-export-env')
})

test('nextTailStep: preview-workflow-file write -> writing-workflow-file, view -> view-workflow-diff', () => {
  const p = singleMigrated('ios')
  assert.strictEqual(nextTailStep('preview-workflow-file', 'write', p), 'writing-workflow-file')
  assert.strictEqual(nextTailStep('preview-workflow-file', 'view', p), 'view-workflow-diff')
})

test('ask-build renders as a shared-tail choice via the appflow view', () => {
  const p = { ...singleMigrated('ios'), handoffChoice: 'build' }
  const view = appflowFlow.viewForStep('ask-build', p)
  assert.strictEqual(view.kind, 'choice')
  assert.ok((view.options ?? []).some(o => o.value === 'yes'))
})

console.log(`\n📊 Results: ${passed} passed, ${failed} failed`)
if (failed > 0)
  process.exit(1)
