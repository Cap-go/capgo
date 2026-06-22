// Step-6 gap-fill 'generate' and step-8 p8 'convert' drive the shared p8 / SA
// generate sub-flows via injected generators, capture the produced Capgo creds,
// and continue the graph. 'skip' is unchanged. Generators are advisory: a non-ok
// outcome records a note and NEVER blocks.
import assert from 'node:assert'

const f = await import('../src/build/onboarding/appflow/flow.ts')

const base = (over = {}) => ({
  scope: 'both',
  token: { access_token: 't' },
  orgSlug: 'o',
  appId: 'a',
  migratable: { ios: true, android: true },
  completedSteps: ['explain', 'fetch-signing', 'fetch-distribution'],
  ...over,
})

// ── views for the two new auto generate steps are neutral 'auto' (generic) ──
const iosGenView = f.appflowFlow.viewForStep('ios-p8-generate', base())
assert.strictEqual(iosGenView.kind, 'auto')
assert.ok(/\.p8|api key/i.test(iosGenView.prompt))
const andGenView = f.appflowFlow.viewForStep('android-sa-generate', base())
assert.strictEqual(andGenView.kind, 'auto')
assert.ok(/service account/i.test(andGenView.prompt))

// ── iOS gap-fill 'generate' routes to ios-p8-generate, NOT straight to validate ──
const iosCertOnly = base({ ios: { BUILD_CERTIFICATE_BASE64: 'x', P12_PASSWORD: 'p' }, migratable: { ios: true, android: false }, scope: 'ios' })
assert.strictEqual(f.getAppflowResumeStep(iosCertOnly), 'ios-dist-gapfill')
const iosGen = f.appflowFlow.applyInput('ios-dist-gapfill', iosCertOnly, { value: 'generate' })
assert.strictEqual(iosGen.iosDistGapfill, 'generate')
assert.strictEqual(f.getAppflowResumeStep(iosGen), 'ios-p8-generate')

// effect: success merges APPLE_KEY_* into ios, marks step done, then continues to validate
const iosGenDeps = {
  generateIosP8Key: async () => ({ ok: true, creds: { APPLE_KEY_ID: 'K', APPLE_ISSUER_ID: 'I', APPLE_KEY_CONTENT: 'BASE64P8' } }),
}
const iosRes = await f.appflowFlow.runEffect('ios-p8-generate', iosGen, iosGenDeps)
assert.strictEqual(iosRes.progress.ios.APPLE_KEY_ID, 'K')
assert.strictEqual(iosRes.progress.ios.APPLE_ISSUER_ID, 'I')
assert.strictEqual(iosRes.progress.ios.APPLE_KEY_CONTENT, 'BASE64P8')
assert.ok(iosRes.progress.completedSteps.includes('ios-p8-generate'))
assert.strictEqual(iosRes.next, 'validate') // captured -> proceed
// runs at most once: a re-resolve of the same progress does NOT loop back
assert.notStrictEqual(f.getAppflowResumeStep(iosRes.progress), 'ios-p8-generate')

// ── step-8 'convert' drives the SAME generate step and drops the app-specific password ──
const appPw = base({ scope: 'ios', migratable: { ios: true, android: false }, ios: { FASTLANE_USER: 'u', FASTLANE_APPLE_APPLICATION_SPECIFIC_PASSWORD: 'w' }, completedSteps: ['explain', 'fetch-signing', 'fetch-distribution', 'validate'] })
assert.strictEqual(f.getAppflowResumeStep(appPw), 'p8-upgrade-prompt')
const converted = f.appflowFlow.applyInput('p8-upgrade-prompt', appPw, { value: 'convert' })
assert.strictEqual(f.getAppflowResumeStep(converted), 'ios-p8-generate')
const convRes = await f.appflowFlow.runEffect('ios-p8-generate', converted, iosGenDeps)
assert.strictEqual(convRes.progress.ios.APPLE_KEY_ID, 'K')
// the imported app-specific password is removed (the .p8 supersedes it)
assert.strictEqual(convRes.progress.ios.FASTLANE_APPLE_APPLICATION_SPECIFIC_PASSWORD, undefined)
// no longer eligible for the upgrade prompt -> proceeds to handoff
assert.strictEqual(f.getAppflowResumeStep(convRes.progress), 'handoff-build')

// ── Android gap-fill 'generate' routes to android-sa-generate, captures PLAY_CONFIG_JSON ──
const andOnly = base({ scope: 'android', migratable: { ios: false, android: true }, android: { ANDROID_KEYSTORE_FILE: 'x', KEYSTORE_STORE_PASSWORD: 'p', KEYSTORE_KEY_ALIAS: 'a' } })
assert.strictEqual(f.getAppflowResumeStep(andOnly), 'android-dist-gapfill')
const andGen = f.appflowFlow.applyInput('android-dist-gapfill', andOnly, { value: 'generate' })
assert.strictEqual(andGen.androidDistGapfill, 'generate')
assert.strictEqual(f.getAppflowResumeStep(andGen), 'android-sa-generate')
const andRes = await f.appflowFlow.runEffect('android-sa-generate', andGen, {
  generateAndroidServiceAccount: async () => ({ ok: true, creds: { PLAY_CONFIG_JSON: 'eyJ9' } }),
})
assert.strictEqual(andRes.progress.android.PLAY_CONFIG_JSON, 'eyJ9')
assert.ok(andRes.progress.completedSteps.includes('android-sa-generate'))
assert.strictEqual(andRes.next, 'validate')

// ── 'skip' is unchanged: no generate step, straight to validate, no creds touched ──
const iosSkip = f.appflowFlow.applyInput('ios-dist-gapfill', iosCertOnly, { value: 'skip' })
assert.strictEqual(iosSkip.iosDistGapfill, 'skip')
assert.strictEqual(f.getAppflowResumeStep(iosSkip), 'validate')
const andSkip = f.appflowFlow.applyInput('android-dist-gapfill', andOnly, { value: 'skip' })
assert.strictEqual(andSkip.androidDistGapfill, 'skip')
assert.strictEqual(f.getAppflowResumeStep(andSkip), 'validate')

// ── advisory: a non-ok generator (or absent dep) records a note and still advances ──
const iosFail = await f.appflowFlow.runEffect('ios-p8-generate', iosGen, { generateIosP8Key: async () => ({ ok: false, message: 'requires macOS' }) })
assert.ok(iosFail.progress.completedSteps.includes('ios-p8-generate'))
assert.ok(/macOS|did not complete/i.test(iosFail.transient?.note ?? ''))
assert.strictEqual(iosFail.next, 'validate') // never blocks
// absent dep -> skipped note, still advances, no ios creds invented
const iosAbsent = await f.appflowFlow.runEffect('ios-p8-generate', iosGen, {})
assert.ok(iosAbsent.progress.completedSteps.includes('ios-p8-generate'))
assert.strictEqual(iosAbsent.progress.ios?.APPLE_KEY_ID, undefined)
assert.ok((iosAbsent.transient?.note ?? '').length > 0)
const andAbsent = await f.appflowFlow.runEffect('android-sa-generate', andGen, {})
assert.ok(andAbsent.progress.completedSteps.includes('android-sa-generate'))
assert.strictEqual(andAbsent.progress.android?.PLAY_CONFIG_JSON, undefined)

console.log('appflow gapfill OK')
