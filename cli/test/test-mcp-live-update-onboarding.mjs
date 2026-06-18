#!/usr/bin/env node
/** Headless tests for the MCP-conducted Capgo live-update onboarding engine. */
import process from 'node:process'

console.log('🧪 Testing MCP live-update onboarding...\n')

const { renderResult, LIVE_UPDATE_RULES } = await import('../src/init/mcp/contract.ts')
const { clearAllSessions } = await import('../src/init/mcp/session-state.ts')

let pass = 0
let fail = 0
async function test(name, fn) {
  clearAllSessions()
  try { console.log(`\n🔍 ${name}`); await fn(); console.log(`✅ PASSED: ${name}`); pass++ }
  catch (e) { console.error(`❌ FAILED: ${name}`); console.error(`   ${e.message}`); fail++ }
}
function eq(a, b, msg) { if (a !== b) throw new Error(msg || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`) }
function ok(c, msg) { if (!c) throw new Error(msg || 'expected truthy') }

await test('LIVE_UPDATE_RULES mentions explain tool and login', async () => {
  const joined = LIVE_UPDATE_RULES.join('\n')
  ok(/capgo_live_update_onboarding_explain/.test(joined))
  ok(/npx @capgo\/cli@latest login/.test(joined))
  ok(/paste/i.test(joined) && /never/i.test(joined))
})

await test('renderResult leads with directive and embeds JSON', async () => {
  const result = {
    onboarding: 'capgo-live-update', phase: 'prepare', state: 'add-app', progress: 8,
    kind: 'auto', summary: 'Registering app…',
    next: { tool: 'capgo_live_update_onboarding_next_step', instruction: 'Wait.', call: 'capgo_live_update_onboarding_next_step({})' },
  }
  const text = renderResult(result)
  ok(text.includes('DO THIS NEXT'))
  ok(text.includes('"onboarding": "capgo-live-update"'))
})

const { decideStart, decideAdvance, gatherFacts, runStart } = await import('../src/init/mcp/engine.ts')

const facts = (o = {}) => ({
  capacitorProject: true,
  appId: 'com.acme.app',
  platformsDetected: ['ios', 'android'],
  authenticated: true,
  appRegistered: true,
  progress: null,
  ...o,
})

function fakeDeps(o = {}) {
  let progress = null
  return {
    cwd: '/tmp/app',
    hasSavedKey: () => true,
    getAppId: async () => 'com.acme.app',
    detectPlatforms: async () => ['ios', 'android'],
    isAppRegistered: async () => true,
    loadProgress: () => progress,
    saveProgress: (data) => { progress = data },
    clearProgress: () => { progress = null },
    registerApp: async () => ({ ok: true }),
    ensureChannel: async () => ({ ok: true }),
    installUpdater: async () => ({ ok: true, delta: false, currentVersion: '1.0.0' }),
    addIntegrationCode: async () => ({ ok: true }),
    setupEncryption: async (_a, enable) => ({ ok: true, enabled: enable }),
    buildProject: async () => ({ ok: true }),
    applyTestChange: async () => ({ ok: true, version: '1.0.1' }),
    uploadBundle: async () => ({ ok: true }),
    getRunDeviceCommand: () => ({ command: 'npx cap run ios' }),
    getGitStatus: () => ({ inRepo: true, clean: true, entries: [] }),
    ...o,
  }
}

await test('decideStart: no capacitor project → error', async () => {
  const r = await decideStart(facts({ capacitorProject: false, appId: undefined }), fakeDeps())
  eq(r.kind, 'error')
  eq(r.state, 'no-capacitor-project')
})

await test('decideStart: not authenticated → login human_gate', async () => {
  const r = await decideStart(facts({ authenticated: false }), fakeDeps())
  eq(r.kind, 'human_gate')
  eq(r.state, 'login-required')
})

await test('decideStart: saved progress → resume-prompt', async () => {
  const r = await decideStart(facts({ progress: { step_done: 3, appId: 'com.acme.app' } }), fakeDeps())
  eq(r.kind, 'choice')
  eq(r.state, 'resume-prompt')
})

await test('decideAdvance: encryption choice at step 5', async () => {
  const deps = fakeDeps()
  deps.saveProgress({ step_done: 4, appId: 'com.acme.app' })
  const r = await decideAdvance(facts({ progress: { step_done: 4, appId: 'com.acme.app' } }), deps, { encryptionChoice: 'skip' })
  ok(r.state === 'setup-encryption' || r.state === 'select-platform' || r.kind === 'auto')
})

await test('decideAdvance: platform choice at step 6', async () => {
  const deps = fakeDeps()
  deps.saveProgress({ step_done: 5, appId: 'com.acme.app', encryptionEnabled: false })
  const r = await decideAdvance(facts({ progress: deps.loadProgress() }), deps, { platform: 'ios' })
  ok(r.platform === 'ios' || r.state === 'select-platform' || r.kind === 'auto')
})

await test('gatherFacts maps deps', async () => {
  const f = await gatherFacts(fakeDeps())
  eq(f.appId, 'com.acme.app')
  eq(f.authenticated, true)
})

await test('runStart enters prepare phase', async () => {
  const r = await runStart(fakeDeps())
  ok(r.onboarding === 'capgo-live-update')
  ok(r.phase === 'prepare' || r.phase === 'preflight' || r.kind === 'auto')
})

const { registerLiveUpdateTools } = await import('../src/init/mcp/live-update-tools.ts')

function fakeServer() {
  const tools = {}
  return {
    tools,
    tool(name, _desc, _schema, handler) { tools[name] = { handler } },
  }
}

await test('registerLiveUpdateTools registers spine + explain', async () => {
  const server = fakeServer()
  registerLiveUpdateTools(server, null, fakeDeps())
  ok(server.tools.start_capgo_live_update_onboarding)
  ok(server.tools.capgo_live_update_onboarding_next_step)
  ok(server.tools.capgo_live_update_onboarding_explain)
})

await test('registerLiveUpdateTools: start returns rendered text', async () => {
  const server = fakeServer()
  registerLiveUpdateTools(server, null, fakeDeps())
  const res = await server.tools.start_capgo_live_update_onboarding.handler({})
  ok(res.content[0].text.includes('Capgo live-update onboarding'))
})

console.log(`\n📊 Results: ${pass} passed, ${fail} failed`)
if (fail > 0)
  process.exit(1)
