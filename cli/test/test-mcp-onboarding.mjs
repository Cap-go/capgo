#!/usr/bin/env node
/** Headless tests for the MCP-conducted Capgo Builder onboarding engine. */
import process from 'node:process'

console.log('🧪 Testing MCP Builder onboarding...\n')

const { renderResult, ONBOARDING_RULES } = await import('../src/build/onboarding/mcp/contract.ts')

let pass = 0
let fail = 0
async function test(name, fn) {
  try { console.log(`\n🔍 ${name}`); await fn(); console.log(`✅ PASSED: ${name}`); pass++ }
  catch (e) { console.error(`❌ FAILED: ${name}`); console.error(`   ${e.message}`); fail++ }
}
function eq(a, b, msg) { if (a !== b) throw new Error(msg || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`) }
function ok(c, msg) { if (!c) throw new Error(msg || 'expected truthy') }

await test('ONBOARDING_RULES is a non-trivial preamble', async () => {
  ok(Array.isArray(ONBOARDING_RULES) && ONBOARDING_RULES.length >= 3)
})

await test('renderResult leads with a directive and embeds the JSON', async () => {
  const result = {
    onboarding: 'capgo-builder', phase: 'preflight', state: 'platform-select', progress: 5,
    kind: 'choice', summary: 'Pick a platform.',
    options: [{ value: 'ios', label: 'iOS', note: 'needs Apple key' }],
    next: { tool: 'capgo_builder_onboarding_next_step', instruction: 'Ask the user, then call next_step.', call: 'capgo_builder_onboarding_next_step({ platform: "ios" })' },
  }
  const text = renderResult(result)
  ok(text.includes('DO THIS NEXT'), 'should contain the directive header')
  ok(text.includes('Example call:'), 'should contain the example call')
  ok(text.includes('"kind": "choice"'), 'should embed the JSON payload')
  ok(text.includes('- ios'), 'should list options')
})

const { decideStart, decideAdvance } = await import('../src/build/onboarding/mcp/engine.ts')

const facts = (o = {}) => ({
  capacitorProject: true,
  appId: 'com.acme.app',
  platformsDetected: ['ios', 'android'],
  authenticated: true,
  appRegistered: true,
  ...o,
})

await test('decideStart: not a Capacitor project → error', async () => {
  const r = decideStart(facts({ capacitorProject: false, appId: undefined }), null)
  eq(r.kind, 'error')
  eq(r.phase, 'preflight')
})

await test('decideStart: not authenticated → login human_gate, no chat paste', async () => {
  const r = decideStart(facts({ authenticated: false }), null)
  eq(r.kind, 'human_gate')
  eq(r.state, 'login-required')
  ok(/cli login/i.test(r.human.instruction), 'should mention the login command')
  ok(/not paste/i.test(r.human.instruction), 'should warn against pasting into chat')
})

await test('decideStart: both platforms → choice with two options', async () => {
  const r = decideStart(facts(), null)
  eq(r.kind, 'choice')
  eq(r.state, 'platform-select')
  eq(r.options.length, 2)
  ok(r.roadmap.length >= 3, 'first decision should carry the roadmap')
})

await test('decideStart: single platform → auto-selects and enters credentials phase', async () => {
  const r = decideStart(facts({ platformsDetected: ['android'] }), null)
  eq(r.platform, 'android')
  eq(r.phase, 'credentials')
})

await test('decideStart: no native folder → human_gate cap add', async () => {
  const r = decideStart(facts({ platformsDetected: [] }), null)
  eq(r.kind, 'human_gate')
  eq(r.state, 'no-platform')
})

await test('decideAdvance: platform choice records it and enters credentials', async () => {
  const r = decideAdvance(facts(), null, { platform: 'ios' })
  eq(r.platform, 'ios')
  eq(r.phase, 'credentials')
})

await test('decideAdvance: platform choice while unauthenticated bounces to login', async () => {
  const r = decideAdvance(facts({ authenticated: false }), null, { platform: 'ios' })
  eq(r.state, 'login-required')
})

const { gatherFacts, runStart, runAdvance } = await import('../src/build/onboarding/mcp/engine.ts')

const fakeDeps = (o = {}) => ({
  cwd: '/tmp/app',
  hasSavedKey: () => true,
  getAppId: async () => 'com.acme.app',
  detectPlatforms: async () => ['ios'],
  isAppRegistered: async () => true,
  loadProgress: async () => null,
  loadAndroidProgress: async () => null,
  ...o,
})

await test('gatherFacts: maps injected deps into facts', async () => {
  const f = await gatherFacts(fakeDeps())
  eq(f.capacitorProject, true)
  eq(f.appId, 'com.acme.app')
  eq(f.authenticated, true)
  eq(f.platformsDetected.length, 1)
  eq(f.appRegistered, true)
})

await test('gatherFacts: no appId → not a capacitor project, skips app check', async () => {
  let appChecked = false
  const f = await gatherFacts(fakeDeps({
    getAppId: async () => undefined,
    isAppRegistered: async () => { appChecked = true; return true },
  }))
  eq(f.capacitorProject, false)
  eq(appChecked, false, 'must not call isAppRegistered without an appId')
})

await test('gatherFacts: unauthenticated skips the registered-app check', async () => {
  let appChecked = false
  const f = await gatherFacts(fakeDeps({
    hasSavedKey: () => false,
    isAppRegistered: async () => { appChecked = true; return true },
  }))
  eq(f.authenticated, false)
  eq(appChecked, false, 'must not call the API when unauthenticated')
})

await test('runStart: single platform via deps → enters credentials phase', async () => {
  const r = await runStart(fakeDeps())
  eq(r.platform, 'ios')
  eq(r.phase, 'credentials')
})

await test('runAdvance: passes platform input through to the decider', async () => {
  const r = await runAdvance(fakeDeps({ detectPlatforms: async () => ['ios', 'android'] }), { platform: 'ios' })
  eq(r.platform, 'ios')
})

const { registerOnboardingTools } = await import('../src/build/onboarding/mcp/onboarding-tools.ts')

function fakeServer() {
  const tools = {}
  return {
    tools,
    tool(name, _desc, _schema, handler) { tools[name] = { handler } },
  }
}

await test('registerOnboardingTools: registers the two-tool spine', async () => {
  const server = fakeServer()
  registerOnboardingTools(server, /* sdk */ null, fakeDeps())
  ok(server.tools.start_capgo_builder_onboarding, 'start tool registered')
  ok(server.tools.capgo_builder_onboarding_next_step, 'next_step tool registered')
})

await test('registerOnboardingTools: start handler returns rendered text content', async () => {
  const server = fakeServer()
  registerOnboardingTools(server, null, fakeDeps())
  const res = await server.tools.start_capgo_builder_onboarding.handler({})
  ok(Array.isArray(res.content) && res.content[0].type === 'text', 'returns MCP text content')
  ok(res.content[0].text.includes('Capgo Builder onboarding'), 'renders the result')
})

await test('registerOnboardingTools: next_step handler forwards platform input', async () => {
  const server = fakeServer()
  registerOnboardingTools(server, null, fakeDeps({ detectPlatforms: async () => ['ios', 'android'] }))
  const res = await server.tools.capgo_builder_onboarding_next_step.handler({ platform: 'ios' })
  ok(res.content[0].text.includes('"platform": "ios"'), 'forwards the chosen platform')
})

await test('decideStart: authenticated but app not registered → auto registering-app', async () => {
  const r = decideStart(facts({ appRegistered: false }), null)
  eq(r.kind, 'auto')
  eq(r.phase, 'app')
  eq(r.state, 'registering-app')
})

await test('decideStart: app registered → proceeds to platform decision', async () => {
  const r = decideStart(facts({ appRegistered: true }), null)
  ok(r.state === 'platform-select' || r.phase === 'credentials', 'should be past the app phase')
})

await test('decideAdvance: platform chosen but app not registered → routes back to register first', async () => {
  const r = decideAdvance(facts({ appRegistered: false }), null, { platform: 'ios' })
  eq(r.state, 'registering-app')
})

function appPhaseDeps(o = {}) {
  let registered = false
  return {
    cwd: '/tmp/app',
    hasSavedKey: () => true,
    getAppId: async () => 'com.acme.app',
    detectPlatforms: async () => ['ios', 'android'],
    isAppRegistered: async () => registered,
    loadProgress: async () => null,
    loadAndroidProgress: async () => null,
    registerApp: async () => { registered = true; return { ok: true } },
    ...o,
  }
}

await test('runStart: unregistered app → executor registers it → ends at platform-select', async () => {
  const r = await runStart(appPhaseDeps())
  eq(r.state, 'platform-select')
})

await test('runStart: register-app side effect runs exactly once', async () => {
  let calls = 0
  let registered = false
  const deps = appPhaseDeps()
  deps.isAppRegistered = async () => registered
  deps.registerApp = async () => { calls++; registered = true; return { ok: true } }
  await runStart(deps)
  eq(calls, 1)
})

await test('drive loop guards against a non-progressing auto step', async () => {
  const deps = appPhaseDeps({ isAppRegistered: async () => false, registerApp: async () => ({ ok: true }) })
  const r = await runStart(deps)
  eq(r.kind, 'error')
  eq(r.state, 'auto-loop-guard')
})

await test('drive loop: app id taken by another account → human_gate conflict with suggestions', async () => {
  const deps = appPhaseDeps({
    isAppRegistered: async () => false,
    registerApp: async () => ({ ok: false, alreadyExists: true, error: 'already exists' }),
  })
  const r = await runStart(deps)
  eq(r.kind, 'human_gate')
  eq(r.state, 'app-id-conflict')
  ok(/com\.acme\.app/.test(r.human.instruction), 'should suggest alternates based on the id')
})

await test('drive loop: registration hard-fails → error result', async () => {
  const deps = appPhaseDeps({
    isAppRegistered: async () => false,
    registerApp: async () => ({ ok: false, alreadyExists: false, error: 'network down' }),
  })
  const r = await runStart(deps)
  eq(r.kind, 'error')
  eq(r.state, 'register-app-failed')
})

// --- Plan 3: Android credentials ---
const { decideAndroid } = await import('../src/build/onboarding/mcp/engine.ts')

function androidDeps(o = {}) {
  let prog = null
  return {
    cwd: '/tmp/app',
    hasSavedKey: () => true,
    getAppId: async () => 'com.acme.app',
    detectPlatforms: async () => ['android'],
    isAppRegistered: async () => true,
    loadProgress: async () => null,
    registerApp: async () => ({ ok: true }),
    loadAndroidProgress: async () => prog,
    generateAndroidKeystore: async () => {
      prog = {
        ...(prog || {}),
        completedSteps: {
          ...(prog?.completedSteps || {}),
          keystoreReady: { keystorePath: 'android/app/release.p12', alias: 'release', isGenerated: true },
        },
      }
    },
    ...o,
  }
}

const androidFacts = (o = {}) => ({
  capacitorProject: true,
  appId: 'com.acme.app',
  platformsDetected: ['android'],
  authenticated: true,
  appRegistered: true,
  androidProgress: null,
  ...o,
})

await test('decideAndroid: no keystore yet → auto android-keystore', async () => {
  const r = decideAndroid(androidFacts())
  eq(r.kind, 'auto')
  eq(r.state, 'android-keystore')
  eq(r.platform, 'android')
})

await test('decideAndroid: keystore ready → advances to next android milestone', async () => {
  const r = decideAndroid(androidFacts({
    androidProgress: { completedSteps: { keystoreReady: { keystorePath: 'p', alias: 'release', isGenerated: true } } },
  }))
  eq(r.state, 'android-credentials-next')
})

await test('runStart (android): keystore generated, then flow advances past it', async () => {
  const r = await runStart(androidDeps())
  eq(r.platform, 'android')
  eq(r.state, 'android-credentials-next')
})

await test('runStart (android): generateAndroidKeystore runs exactly once', async () => {
  let calls = 0
  const deps = androidDeps()
  const orig = deps.generateAndroidKeystore
  deps.generateAndroidKeystore = async (id) => { calls++; return orig(id) }
  await runStart(deps)
  eq(calls, 1)
})

console.log(`\n📊 Results: ${pass} passed, ${fail} failed`)
if (fail > 0)
  process.exit(1)
