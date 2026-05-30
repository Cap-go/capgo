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

console.log(`\n📊 Results: ${pass} passed, ${fail} failed`)
if (fail > 0)
  process.exit(1)
