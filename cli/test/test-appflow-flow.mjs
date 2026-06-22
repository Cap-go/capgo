import assert from 'node:assert'

const f = await import('../src/build/onboarding/appflow/flow.ts')

// ── autoSelect ──
assert.strictEqual(f.autoSelect([]), null)
assert.deepStrictEqual(f.autoSelect(['only']), 'only')
assert.strictEqual(f.autoSelect(['a', 'b']), 'prompt')

// ── decideAfterFetchSigning (scope-aware) ──
assert.strictEqual(f.decideAfterFetchSigning({ scope: 'both', migratable: { ios: false, android: false } }), 'no-signing-submenu')
assert.strictEqual(f.decideAfterFetchSigning({ scope: 'both', migratable: { ios: true, android: false } }), 'fetch-distribution')
assert.strictEqual(f.decideAfterFetchSigning({ scope: 'android', migratable: { ios: true, android: false } }), 'no-signing-submenu')

// ── explain view mentions support + Ionic CLI ──
const v = f.appflowFlow.viewForStep('explain', { scope: 'both', migratable: { ios: false, android: false }, completedSteps: [] })
assert.ok(/support@capgo\.app/.test(v.prompt))
assert.ok(/Ionic CLI|same/i.test(v.prompt))

// ── no-signing submenu: four options ──
const sub = f.appflowFlow.viewForStep('no-signing-submenu', { scope: 'both', migratable: { ios: false, android: false }, noSigningScope: 'all', completedSteps: [] })
assert.deepStrictEqual((sub.options || []).map(o => o.value).sort(), ['abandon', 'email-support', 'go-back', 'skip'].sort())

// ── applyInput records the submenu choice ──
const after = f.appflowFlow.applyInput('no-signing-submenu', { scope: 'both', migratable: { ios: false, android: false }, noSigningScope: 'all', completedSteps: [] }, { value: 'abandon' })
assert.ok(after.completedSteps.includes('no-signing-submenu'))

// ── runValidations: advisory, failures->warn, never block ──
const results = await f.runValidations(
  { scope: 'both', android: { PLAY_CONFIG_JSON: 'x', ANDROID_KEYSTORE_FILE: 'x', KEYSTORE_STORE_PASSWORD: 'p', KEYSTORE_KEY_ALIAS: 'a' }, ios: { FASTLANE_USER: 'a@b', FASTLANE_APPLE_APPLICATION_SPECIFIC_PASSWORD: 'w', APPLE_APP_ID: '1' }, migratable: { ios: true, android: true }, completedSteps: [] },
  { validateServiceAccountJson: async () => ({ ok: false, reason: 'bad' }), tryUnlockPrivateKey: async () => false, validateAppleAppPassword: async () => ({ valid: false, message: 'nope' }) },
)
assert.ok(results.every(r => ['pass', 'warn', 'skipped'].includes(r.status)))
assert.ok(results.some(r => r.status === 'warn'))
assert.ok(!results.some(r => r.status === 'block'))

// ── runValidations: p12 local check (advisory) when a cert was imported ──
const p12pass = await f.runValidations(
  { scope: 'ios', ios: { BUILD_CERTIFICATE_BASE64: 'x', P12_PASSWORD: 'p' }, migratable: { ios: true, android: false }, completedSteps: [] },
  { validateP12: async () => true },
)
assert.ok(p12pass.some(r => r.id === 'p12' && r.status === 'pass'))
const p12warn = await f.runValidations(
  { scope: 'ios', ios: { BUILD_CERTIFICATE_BASE64: 'x', P12_PASSWORD: 'wrong' }, migratable: { ios: true, android: false }, completedSteps: [] },
  { validateP12: async () => false },
)
assert.ok(p12warn.some(r => r.id === 'p12' && r.status === 'warn'))
// absent validator -> skipped, never blocks
const p12skip = await f.runValidations(
  { scope: 'ios', ios: { BUILD_CERTIFICATE_BASE64: 'x' }, migratable: { ios: true, android: false }, completedSteps: [] },
  {},
)
assert.ok(p12skip.some(r => r.id === 'p12' && r.status === 'skipped'))

// ── validate is an AUTO step (so runValidations actually runs); results show in validate-results ──
const valView = f.appflowFlow.viewForStep('validate', { scope: 'ios', ios: {}, migratable: { ios: true, android: false }, completedSteps: [] })
assert.strictEqual(valView.kind, 'auto')
const valRes = f.appflowFlow.viewForStep('validate-results', { scope: 'ios', migratable: { ios: true, android: false }, completedSteps: [] }, { results: [{ id: 'p12', status: 'pass', message: 'cert opens' }] })
assert.strictEqual(valRes.kind, 'info')
assert.ok(/cert opens/.test(valRes.prompt))
assert.ok(/never blocks/i.test(valRes.prompt))

// ── p8 upgrade view ──
const g = f.appflowFlow.viewForStep('p8-upgrade-prompt', { scope: 'ios', ios: { FASTLANE_APPLE_APPLICATION_SPECIFIC_PASSWORD: 'w' }, migratable: { ios: true, android: false }, completedSteps: [] })
assert.ok(/recommended|api key|\.p8/i.test(g.prompt))
assert.ok((g.options || []).map(o => o.value).includes('convert'))
assert.ok((g.options || []).map(o => o.value).includes('skip'))

// ── step-6 gap-fill routing: iOS creds present but no upload destination -> ios-dist-gapfill (once) ──
const distDone = { scope: 'ios', token: { access_token: 't' }, orgSlug: 'o', appId: 'a', ios: { BUILD_CERTIFICATE_BASE64: 'x', P12_PASSWORD: 'p' }, migratable: { ios: true, android: false }, completedSteps: ['explain', 'fetch-signing', 'fetch-distribution'] }
assert.strictEqual(f.getAppflowResumeStep(distDone), 'ios-dist-gapfill')
const afterGap = f.appflowFlow.applyInput('ios-dist-gapfill', distDone, { value: 'skip' })
assert.strictEqual(afterGap.iosDistGapfill, 'skip')
assert.strictEqual(f.getAppflowResumeStep(afterGap), 'validate') // asked once -> proceed to validate

// generate choice is recorded too
const afterGapGen = f.appflowFlow.applyInput('ios-dist-gapfill', distDone, { value: 'generate' })
assert.strictEqual(afterGapGen.iosDistGapfill, 'generate')

// ── step-8 p8 upgrade routing: app-specific password imported -> p8-upgrade-prompt after validate ──
const appPwDone = { scope: 'ios', token: { access_token: 't' }, orgSlug: 'o', appId: 'a', ios: { FASTLANE_USER: 'u', FASTLANE_APPLE_APPLICATION_SPECIFIC_PASSWORD: 'w' }, migratable: { ios: true, android: false }, completedSteps: ['explain', 'fetch-signing', 'fetch-distribution', 'validate'] }
assert.strictEqual(f.getAppflowResumeStep(appPwDone), 'p8-upgrade-prompt')
const afterP8 = f.appflowFlow.applyInput('p8-upgrade-prompt', appPwDone, { value: 'convert' })
assert.strictEqual(afterP8.p8Upgrade, 'convert')
assert.strictEqual(f.getAppflowResumeStep(afterP8), 'ios-p8-generate') // 'convert' drives the shared .p8 generate sub-flow

// ── platformsToBuild (scope-aware) ──
assert.deepStrictEqual(f.platformsToBuild({ scope: 'both', ios: { x: '1' }, android: {}, migratable: { ios: true, android: false }, completedSteps: [] }), ['ios'])
assert.deepStrictEqual(f.platformsToBuild({ scope: 'both', ios: { x: '1' }, android: { y: '1' }, migratable: { ios: true, android: true }, completedSteps: [] }).sort(), ['android', 'ios'])
assert.deepStrictEqual(f.platformsToBuild({ scope: 'ios', ios: { x: '1' }, android: { y: '1' }, migratable: { ios: true, android: true }, completedSteps: [] }), ['ios'])

// ── handoff-build is skippable ──
const hb = f.appflowFlow.viewForStep('handoff-build', { scope: 'ios', ios: { x: '1' }, migratable: { ios: true, android: false }, completedSteps: [] })
assert.ok((hb.options || []).some(o => o.value === 'skip'))

// ── resume routing ──
assert.strictEqual(f.getAppflowResumeStep(null), 'explain')
assert.strictEqual(f.getAppflowResumeStep({ scope: 'both', migratable: { ios: false, android: false }, completedSteps: ['explain'] }), 'authenticating')

// ── token present + no org/app yet routes through the fetch-orgs/fetch-apps AUTO steps ──
// (C2/C5/C26) Before fetch-orgs has run, resume must go to fetch-orgs (which
// populates options); only after it's done does it route to the select-org prompt.
assert.strictEqual(f.getAppflowResumeStep({ scope: 'both', token: { access_token: 't' }, migratable: { ios: false, android: false }, completedSteps: ['explain', 'authenticating'] }), 'fetch-orgs')
assert.strictEqual(f.getAppflowResumeStep({ scope: 'both', token: { access_token: 't' }, migratable: { ios: false, android: false }, completedSteps: ['explain', 'authenticating', 'fetch-orgs'] }), 'select-org')
assert.strictEqual(f.getAppflowResumeStep({ scope: 'both', token: { access_token: 't' }, orgSlug: 'o', migratable: { ios: false, android: false }, completedSteps: ['explain', 'authenticating', 'fetch-orgs'] }), 'fetch-apps')
assert.strictEqual(f.getAppflowResumeStep({ scope: 'both', token: { access_token: 't' }, orgSlug: 'o', migratable: { ios: false, android: false }, completedSteps: ['explain', 'authenticating', 'fetch-orgs', 'fetch-apps'] }), 'select-app')

// ── select-ios-cert / select-android-cert reducer STORES the chosen tag (C1/C6/C16) ──
const certBase = { scope: 'both', token: { access_token: 't' }, orgSlug: 'o', appId: 'a', migratable: { ios: true, android: true }, completedSteps: ['explain', 'authenticating', 'fetch-orgs', 'fetch-apps', 'fetch-signing'] }
const afterIosCert = f.appflowFlow.applyInput('select-ios-cert', certBase, { value: 'chosen-ios-tag' })
assert.strictEqual(afterIosCert.iosCertTag, 'chosen-ios-tag', 'iOS cert tag stored (not discarded)')
const afterAndCert = f.appflowFlow.applyInput('select-android-cert', certBase, { value: 'chosen-and-tag' })
assert.strictEqual(afterAndCert.androidCertTag, 'chosen-and-tag', 'Android cert tag stored')

// ── select-ios-dist / select-android-dist reducer stores the chosen id (C8) ──
const afterIosDist = f.appflowFlow.applyInput('select-ios-dist', certBase, { value: '42' })
assert.strictEqual(afterIosDist.iosDistId, '42')
const afterAndDist = f.appflowFlow.applyInput('select-android-dist', certBase, { value: '7' })
assert.strictEqual(afterAndDist.androidDistId, '7')

// ── no-signing-submenu 'go-back' rewinds to the app picker (C7) ──
const stuck = { scope: 'ios', token: { access_token: 't' }, orgSlug: 'o', appId: 'a', appSlug: 's', noSigningScope: 'ios', migratable: { ios: false, android: false }, completedSteps: ['explain', 'authenticating', 'fetch-orgs', 'fetch-apps', 'fetch-signing', 'no-signing-submenu'] }
const goneBack = f.appflowFlow.applyInput('no-signing-submenu', stuck, { value: 'go-back' })
assert.strictEqual(goneBack.appId, undefined, 'go-back clears appId')
assert.ok(!goneBack.completedSteps.includes('fetch-signing'), 'go-back rewinds the fetch-signing completion')
// resume now routes back toward app selection (fetch-apps), NOT forward to fetch-distribution
assert.notStrictEqual(f.getAppflowResumeStep(goneBack), 'fetch-distribution')

// ── new select-* views render the ctx options ──
const certView = f.appflowFlow.viewForStep('select-ios-cert', certBase, { options: [{ value: 't1', label: 'Cert 1' }, { value: 't2', label: 'Cert 2' }] })
assert.strictEqual(certView.kind, 'choice')
assert.deepStrictEqual(certView.options.map(o => o.value), ['t1', 't2'])
const distView = f.appflowFlow.viewForStep('select-ios-dist', certBase, { options: [{ value: '1', label: 'd1' }] })
assert.strictEqual(distView.kind, 'choice')
assert.deepStrictEqual(distView.options.map(o => o.value), ['1'])

console.log('appflow flow OK')
