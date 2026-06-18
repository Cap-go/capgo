#!/usr/bin/env node
/**
 * Resume prompt (continue vs restart) — MCP parity with the Ink TUI's
 * `resume-prompt` fork (ui/app.tsx, android/ui/app.tsx).
 *
 * Regression for the bug where a fresh `start_capgo_builder_onboarding` with an
 * in-progress onboarding on disk SILENTLY teleported the user into the middle of
 * the wizard (e.g. landed on the Google Play sign-in step) — they were never
 * asked whether to continue where they left off or start over, even though the
 * TUI always asks.
 *
 * The contract these tests pin:
 *   1. A fresh START (runStart, the "mount" analog) onto a platform that has
 *      resumable on-disk progress returns the `resume-prompt` choice first.
 *   2. `resumeChoice: 'continue'` resumes the saved step.
 *   3. `resumeChoice: 'restart'` wipes that platform's progress and begins again.
 *   4. A mid-flow bare `next_step({})` (runAdvance) NEVER re-asks the prompt —
 *      it resumes silently, exactly like advancing inside a running TUI.
 *   5. No on-disk progress → no prompt (zero-friction first run is unchanged).
 *   6. A second fresh START re-asks (the prompt is re-offered every "mount").
 *   7. The iOS flow shows the same prompt for an in-progress iOS setup.
 */
import process from 'node:process'

console.log('🧪 Testing MCP resume prompt (continue vs restart)...\n')

const { runStart, runAdvance } = await import('../src/build/onboarding/mcp/engine.ts')
const { clearAllSessions } = await import('../src/build/onboarding/mcp/session-state.ts')

let pass = 0
let fail = 0
async function test(name, fn) {
  try { clearAllSessions(); console.log(`\n🔍 ${name}`); await fn(); console.log(`✅ PASSED: ${name}`); pass++ }
  catch (e) { console.error(`❌ FAILED: ${name}`); console.error(`   ${e.message}`); fail++ }
}
function eq(a, b, msg) { if (a !== b) throw new Error(msg || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`) }
function ok(c, msg) { if (!c) throw new Error(msg || 'expected truthy') }

// Android progress that resumes (getAndroidResumeStep) to 'service-account-method-select':
// keystore phase complete, but the service-account fork not yet chosen.
function inProgressAndroid() {
  return {
    platform: 'android',
    appId: 'com.acme.app',
    startedAt: new Date(2026, 5, 1).toISOString(),
    activePlatform: 'android',
    serviceAccountForkSeen: true,
    keystoreMethod: 'generate',
    keystoreAlias: 'release',
    keystoreStorePassword: 'storePw',
    _keystoreBase64: 'base64ks==',
    completedSteps: {
      keystoreReady: { keystorePath: 'android/app/release.p12', alias: 'release', isGenerated: true },
    },
  }
}

// Dual-platform deps with a STATEFUL android progress holder so a restart can be
// observed deleting it. `savedCreds` controls whether the data-safety gate fires
// (default: no saved credentials, so a restart lands on keystore-method-select).
function makeDeps({ androidProgress = null, iosProgress = null, savedCreds = null } = {}) {
  let androidProg = androidProgress
  const effectDeps = {
    generateKeystore: () => ({ p12Base64: 'ks==', alias: 'release', notAfter: new Date(2030, 1, 1) }),
    listKeystoreAliases: () => ({ ok: true, aliases: ['release'] }),
    tryUnlockPrivateKey: () => ({ ok: true }),
    validateServiceAccountJson: async () => ({ ok: true, serviceAccountEmail: 'sa@p.iam.gserviceaccount.com', projectId: 'p' }),
    updateSavedCredentials: async () => {},
    loadSavedCredentials: async () => savedCreds,
    saveAndroidProgress: async (_appId, p) => { androidProg = p },
    loadAndroidProgress: async () => androidProg,
    deleteAndroidProgress: async () => { androidProg = null },
    readFile: async () => Buffer.from('{"type":"service_account"}'),
    copyFile: async () => {},
    fetchUserInfo: async () => ({ email: 'u@e.com', sub: 's' }),
    getAccessToken: async () => 't',
    revokeToken: async () => {},
    listProjects: async () => [{ projectId: 'p', name: 'P', projectNumber: '1' }],
    createProject: async () => { throw new Error('nope') },
    enableService: async () => {},
    ensureServiceAccount: async () => ({ account: { email: 'sa@p.iam.gserviceaccount.com', uniqueId: 'u' }, created: true }),
    createServiceAccountKey: async () => ({ privateKeyDataBase64: 'k==' }),
    inviteServiceAccount: async () => {},
    findAndroidApplicationIds: async () => ['com.acme.app'],
    startOAuthFlow: async () => ({ authUrl: 'x', redirectUri: 'y', result: new Promise(() => {}), close() {} }),
    onStatus: undefined,
    onLog: undefined,
  }
  return {
    _getAndroidProgress: () => androidProg,
    cwd: '/tmp/app',
    hasSavedKey: () => true,
    getAppId: async () => 'com.acme.app',
    detectPlatforms: async () => ['ios', 'android'],
    isAppRegistered: async () => true,
    loadProgress: async () => iosProgress,
    loadAndroidProgress: async () => androidProg,
    registerApp: async () => ({ ok: true }),
    readBuildRecord: async () => null,
    buildRecordPath: (appId, platform) => `/tmp/rec-${appId}-${platform}.json`,
    androidEffectDeps: effectDeps,
    oauthSession: { begin: async () => {}, poll: () => ({ status: 'absent' }), clear: () => {} },
    canLaunchTerminal: () => false,
    launchBuildInTerminal: async () => ({ ok: false, error: 'n/a' }),
  }
}

await test('fresh start(android) with in-progress android → resume-prompt (continue/restart choice)', async () => {
  const r = await runStart(makeDeps({ androidProgress: inProgressAndroid() }), 'android')
  eq(r.state, 'resume-prompt', `must ask continue-vs-restart, got state=${r.state}`)
  eq(r.kind, 'choice', `resume prompt is a choice, got kind=${r.kind}`)
  eq(r.platform, 'android', `must carry the platform, got ${r.platform}`)
  const values = (r.options || []).map(o => o.value).sort()
  ok(values.includes('continue') && values.includes('restart'), `options must offer continue + restart, got ${JSON.stringify(values)}`)
  ok(/continue|start over/i.test(r.summary), 'summary must describe the continue/restart choice')
})

await test('resumeChoice:"continue" resumes the saved step (service-account-method-select)', async () => {
  const deps = makeDeps({ androidProgress: inProgressAndroid() })
  await runStart(deps, 'android')
  const r = await runAdvance(deps, { resumeChoice: 'continue' })
  eq(r.state, 'service-account-method-select', `continue must resume the saved step, got ${r.state}`)
  eq(r.platform, 'android')
})

await test('resumeChoice:"restart" wipes the saved progress and begins again', async () => {
  const deps = makeDeps({ androidProgress: inProgressAndroid() })
  await runStart(deps, 'android')
  const r = await runAdvance(deps, { resumeChoice: 'restart' })
  eq(r.state, 'keystore-method-select', `restart must begin again at the first step, got ${r.state}`)
  ok(r.state !== 'resume-prompt', 'restart must not loop back to the prompt')
})

await test('mid-flow bare next_step({}) never re-asks the resume prompt', async () => {
  const deps = makeDeps({ androidProgress: inProgressAndroid() })
  await runStart(deps, 'android')
  await runAdvance(deps, { resumeChoice: 'continue' }) // acknowledge once
  const r = await runAdvance(deps, {}) // a plain mid-flow advance
  ok(r.state !== 'resume-prompt', `a mid-flow advance must not re-show the prompt, got ${r.state}`)
})

await test('a bare next_step({}) is NEVER intercepted by the prompt (advance mode)', async () => {
  // Even with in-progress android committed but the prompt unresolved, an
  // advance-mode call resumes; only the start tool shows the prompt.
  const deps = makeDeps({ androidProgress: inProgressAndroid() })
  await runStart(deps, 'android') // commits android (shows the prompt)
  const r = await runAdvance(deps, {}) // advance, NOT start → must not be the prompt
  ok(r.state !== 'resume-prompt', `next_step must resume, not re-prompt, got ${r.state}`)
})

await test('fresh start(android) with NO saved progress → no prompt (zero-friction first run)', async () => {
  const r = await runStart(makeDeps({ androidProgress: null, savedCreds: null }), 'android')
  ok(r.state !== 'resume-prompt', `a first run must skip the prompt, got ${r.state}`)
  eq(r.state, 'keystore-method-select', `a fresh android start lands on the first step, got ${r.state}`)
})

await test('a second fresh start re-asks the resume prompt (every "mount" re-offers it)', async () => {
  const deps = makeDeps({ androidProgress: inProgressAndroid() })
  await runStart(deps, 'android')
  await runAdvance(deps, { resumeChoice: 'continue' }) // resolve it
  const r = await runStart(deps, 'android') // a fresh start must re-ask
  eq(r.state, 'resume-prompt', `a second start must re-ask, got ${r.state}`)
})

await test('iOS: fresh start(ios) with in-progress iOS setup → resume-prompt', async () => {
  const iosProgress = { platform: 'ios', appId: 'com.acme.app', startedAt: new Date(2026, 5, 1).toISOString(), _credentialsExistGate: 'done', setupMethod: 'create-new', completedSteps: {} }
  const r = await runStart(makeDeps({ iosProgress }), 'ios')
  eq(r.state, 'resume-prompt', `iOS in-progress must also ask continue-vs-restart, got ${r.state}`)
  eq(r.platform, 'ios')
})

console.log(`\n📊 Results: ${pass} passed, ${fail} failed`)
if (fail > 0)
  process.exit(1)
