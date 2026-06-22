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
  platformsRemainingToBuild,
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

// A migration that has reached the build hand-off: both platforms migrated creds.
function bothMigrated(extra = {}) {
  return {
    scope: 'both',
    appId: 'com.example.app',
    token: { access_token: 't' },
    orgSlug: 'org',
    ios: { BUILD_CERTIFICATE_BASE64: 'p12', P12_PASSWORD: 'x' },
    android: { ANDROID_KEYSTORE_FILE: 'ks', KEYSTORE_STORE_PASSWORD: 'x' },
    migratable: { ios: true, android: true },
    // Resolve the step-6 gap-fill decisions so resume lands at handoff-build (the
    // imported creds carry no upload destination in this fixture, so both gap-fills
    // would otherwise fire first).
    iosDistGapfill: 'skip',
    androidDistGapfill: 'skip',
    // Mark every interactive prerequisite done so resume lands at handoff-build.
    completedSteps: ['explain', 'fetch-signing', 'fetch-distribution', 'validate'],
    ...extra,
  }
}

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
  const p = bothMigrated()
  assert.strictEqual(getAppflowResumeStep(p), 'handoff-build')
})

test('handoff \'build\' (both migrated) routes into the build-platform-pick converge step', () => {
  const p = bothMigrated()
  const after = applyAppflowInput('handoff-build', p, { value: 'build' })
  assert.strictEqual(after.handoffChoice, 'build')
  assert.strictEqual(getAppflowResumeStep(after), 'build-platform-pick')
})

test('handoff \'build\' (single platform migrated) routes straight to the tail (saving-credentials)', () => {
  const p = singleMigrated('ios')
  const after = applyAppflowInput('handoff-build', p, { value: 'build' })
  assert.strictEqual(getAppflowResumeStep(after), 'saving-credentials')
  assert.ok(isAppflowTailStep('saving-credentials'))
})

// ── 2. 'skip' finishes ────────────────────────────────────────────────────────
test('handoff \'skip\' finishes the migration (resume -> done)', () => {
  const p = bothMigrated()
  const after = applyAppflowInput('handoff-build', p, { value: 'skip' })
  assert.strictEqual(after.handoffChoice, 'skip')
  assert.strictEqual(getAppflowResumeStep(after), 'done')
})

// ── 3. both-platform build asks platform-first, then offers the second ─────────
test('build-platform-pick offers the not-yet-built platforms + a skip', () => {
  const p = { ...bothMigrated(), handoffChoice: 'build' }
  const view = appflowFlow.viewForStep('build-platform-pick', p)
  assert.strictEqual(view.kind, 'choice')
  const values = (view.options ?? []).map(o => o.value).sort()
  assert.deepStrictEqual(values, ['android', 'ios', 'skip'].sort())
})

test('picking a platform at build-platform-pick commits it and enters the tail', () => {
  const p = { ...bothMigrated(), handoffChoice: 'build' }
  const after = applyAppflowInput('build-platform-pick', p, { value: 'ios' })
  assert.strictEqual(after.buildPlatform, 'ios')
  assert.strictEqual(getAppflowBuildResumeStep(after), 'saving-credentials')
})

test('after the first platform completes, the migration offers the second', () => {
  // ios just finished its tail run (committed as buildPlatform).
  const p = { ...bothMigrated(), handoffChoice: 'build', buildPlatform: 'ios' }
  const { progress: marked, next } = markTailRunComplete(p)
  assert.deepStrictEqual(marked.builtPlatforms, ['ios'])
  assert.strictEqual(marked.buildPlatform, undefined)
  // Only android remains → it builds directly (single remaining, no re-pick).
  assert.strictEqual(next, 'saving-credentials')
  assert.deepStrictEqual(platformsRemainingToBuild(marked), ['android'])
})

test('after BOTH platforms complete, the migration is done', () => {
  const p = { ...bothMigrated(), handoffChoice: 'build', buildPlatform: 'android', builtPlatforms: ['ios'] }
  const { progress: marked, next } = markTailRunComplete(p)
  assert.deepStrictEqual(marked.builtPlatforms.sort(), ['android', 'ios'])
  assert.strictEqual(next, 'done')
})

test('build-platform-pick \'skip\' finishes the build hand-off', () => {
  const p = { ...bothMigrated(), handoffChoice: 'build' }
  const after = applyAppflowInput('build-platform-pick', p, { value: 'skip' })
  assert.strictEqual(after.handoffChoice, 'skip')
  assert.strictEqual(getAppflowResumeStep(after), 'done')
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
  const p = bothMigrated()
  assert.strictEqual(nextTailStep('ask-build', 'yes', p), 'requesting-build')
  assert.strictEqual(nextTailStep('ask-build', 'no', p), 'build-complete')
})

test('nextTailStep: ask-github-actions-setup with-workflow -> checking-ci-secrets, no -> ask-export-env', () => {
  const p = bothMigrated()
  assert.strictEqual(nextTailStep('ask-github-actions-setup', 'with-workflow', p), 'checking-ci-secrets')
  assert.strictEqual(nextTailStep('ask-github-actions-setup', 'no', p), 'ask-export-env')
})

test('nextTailStep: preview-workflow-file write -> writing-workflow-file, view -> view-workflow-diff', () => {
  const p = bothMigrated()
  assert.strictEqual(nextTailStep('preview-workflow-file', 'write', p), 'writing-workflow-file')
  assert.strictEqual(nextTailStep('preview-workflow-file', 'view', p), 'view-workflow-diff')
})

test('ask-build renders as a shared-tail choice via the appflow view', () => {
  const p = { ...singleMigrated('ios'), handoffChoice: 'build', buildPlatform: 'ios' }
  const view = appflowFlow.viewForStep('ask-build', p)
  assert.strictEqual(view.kind, 'choice')
  assert.ok((view.options ?? []).some(o => o.value === 'yes'))
})

console.log(`\n📊 Results: ${passed} passed, ${failed} failed`)
if (failed > 0)
  process.exit(1)
