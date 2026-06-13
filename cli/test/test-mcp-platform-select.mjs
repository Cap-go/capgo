#!/usr/bin/env node
/**
 * Platform is a SESSION decision, never inferred from disk.
 *
 * Regression for the bug where a fresh start_capgo_builder_onboarding silently
 * resumed whatever platform had leftover progress on disk (engine.ts used to call
 * activePlatform(facts) which scanned ios/android progress files). That:
 *   - skipped the platform picker on a fresh start, and
 *   - made two concurrent sessions for the same app read each other's progress.
 *
 * The fix tracks the chosen platform in PROCESS-LOCAL session memory
 * (session-state.ts) and asks the picker when none is chosen. These tests pin:
 *   1. fresh runStart with leftover iOS progress on disk → platform-select (asks).
 *   2. picking android → android flow, even though iOS progress exists on disk.
 *   3. a bare next_step({}) after the pick stays android (session memory, not disk).
 *   4. runStart again → re-asks (clears the committed platform).
 */
import process from 'node:process'

console.log('🧪 Testing MCP platform selection (session, not disk)...\n')

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

// Dual-platform project, app registered, with LEFTOVER iOS progress on disk (the
// exact shape that used to hijack a fresh start into iOS) and saved android
// credentials so the android pick lands on a concrete gate.
function worldDeps() {
  const effectDeps = {
    generateKeystore: () => ({ p12Base64: 'ks==', alias: 'release', notAfter: new Date(2030, 1, 1) }),
    listKeystoreAliases: () => ({ ok: true, aliases: ['release'] }),
    tryUnlockPrivateKey: () => ({ ok: true }),
    validateServiceAccountJson: async () => ({ ok: true, serviceAccountEmail: 'sa@p.iam.gserviceaccount.com', projectId: 'p' }),
    updateSavedCredentials: async () => {},
    loadSavedCredentials: async () => ({ android: { keystore: 'old==', keystorePassword: 'pw', keyAlias: 'release', keyPassword: 'pw' } }),
    saveAndroidProgress: async () => {},
    loadAndroidProgress: async () => null,
    deleteAndroidProgress: async () => {},
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
    cwd: '/tmp/app',
    hasSavedKey: () => true,
    getAppId: async () => 'com.acme.app',
    detectPlatforms: async () => ['ios', 'android'],
    isAppRegistered: async () => true,
    // LEFTOVER iOS progress on disk — the marker shape that used to force iOS.
    loadProgress: async () => ({ platform: 'ios', appId: 'com.acme.app', _credentialsExistGate: 'done', setupMethod: 'create-new', completedSteps: {} }),
    loadAndroidProgress: async () => null,
    registerApp: async () => ({ ok: true }),
    setAndroidServiceAccountPath: async () => {},
    finalizeAndroidCredentials: async () => ({ ok: true }),
    readBuildRecord: async () => null,
    buildRecordPath: (appId, platform) => `/tmp/rec-${appId}-${platform}.json`,
    setIosApiKey: async () => {},
    finalizeIosCredentials: async () => ({ ok: true }),
    androidEffectDeps: effectDeps,
    oauthSession: { begin: async () => {}, poll: () => ({ status: 'absent' }), clear: () => {} },
    canLaunchTerminal: () => false,
    launchBuildInTerminal: async () => ({ ok: false, error: 'n/a' }),
  }
}

await test('fresh start with leftover iOS progress → platform-select (does NOT resume iOS)', async () => {
  const r = await runStart(worldDeps())
  eq(r.state, 'platform-select', `a fresh start on a dual-platform project must ask the picker, not resume iOS (got state=${r.state}, platform=${r.platform})`)
  ok(/which platform/i.test(r.summary), 'the picker must ask which platform')
})

await test('picking android → android flow, ignoring the iOS progress on disk', async () => {
  const deps = worldDeps()
  await runStart(deps)
  const r = await runAdvance(deps, { platform: 'android' })
  eq(r.platform, 'android', `explicit android pick must enter android even with iOS progress on disk (got ${r.platform}/${r.state})`)
})

await test('bare next_step({}) after picking android stays android (session memory, not disk)', async () => {
  const deps = worldDeps()
  await runStart(deps)
  await runAdvance(deps, { platform: 'android' })
  const r = await runAdvance(deps, {}) // no platform — must use the SESSION platform, not disk (which holds iOS)
  eq(r.platform, 'android', `a bare next_step must resume the session platform (android), not the iOS progress on disk (got ${r.platform}/${r.state})`)
})

await test('runStart again re-asks the picker (clears the committed platform)', async () => {
  const deps = worldDeps()
  await runStart(deps)
  await runAdvance(deps, { platform: 'android' })
  const r = await runStart(deps) // a fresh start must re-offer the picker, not silently resume android
  eq(r.state, 'platform-select', `a second start must re-ask the picker, got state=${r.state}`)
})

console.log(`\n📊 Results: ${pass} passed, ${fail} failed`)
if (fail > 0)
  process.exit(1)
