#!/usr/bin/env node
/**
 * The MCP server hands clients an `instructions` string in the `initialize` result.
 * Clients that honor it (Codex, Claude Code) inject it into the model's context — it
 * is the one cross-client, server-side lever for steering WHEN to reach for the tools.
 *
 * These tests pin buildServerInstructions (src/mcp/instructions.ts):
 *  - always describes the general Capgo Cloud capabilities,
 *  - only promises start_capgo_builder_onboarding when onboarding is actually enabled
 *    (the same flag that gates tool registration), and
 *  - stays under the 512-char cap some clients (Codex) apply.
 */
import process from 'node:process'

console.log('🧪 Testing MCP server instructions...\n')

const { buildServerInstructions } = await import('../src/mcp/instructions.ts')

// Codex caps server instructions at 512 chars; keep both variants safely under it.
const MAX_LEN = 512

let pass = 0
let fail = 0
async function test(name, fn) {
  try { console.log(`\n🔍 ${name}`); await fn(); console.log(`✅ PASSED: ${name}`); pass++ }
  catch (e) { console.error(`❌ FAILED: ${name}`); console.error(`   ${e.message}`); fail++ }
}
function ok(c, msg) { if (!c) throw new Error(msg || 'expected truthy') }

await test('disabled: describes the general Capgo Cloud tools, never names the onboarding tool', async () => {
  const text = buildServerInstructions(false)
  ok(/capgo/i.test(text), 'must identify the server as Capgo')
  ok(/bundle/i.test(text) && /channel/i.test(text), 'must describe the general capabilities (bundles, channels)')
  ok(!text.includes('start_capgo_builder_onboarding'), 'must NOT advertise the onboarding tool when it is not registered')
})

await test('enabled: appends the onboarding steer naming start_capgo_builder_onboarding', async () => {
  const text = buildServerInstructions(true)
  ok(text.includes('start_capgo_builder_onboarding'), 'enabled instructions must name the onboarding tool to call first')
  ok(/FIRST/.test(text), 'must tell the model to call it first')
})

await test('enabled is a strict superset of disabled (base is always present)', async () => {
  const base = buildServerInstructions(false)
  const full = buildServerInstructions(true)
  ok(full.startsWith(base), 'enabled instructions must begin with the same general description')
  ok(full.length > base.length, 'enabled instructions must add the onboarding steer')
})

await test('both variants stay under the 512-char client cap', async () => {
  for (const enabled of [false, true]) {
    const len = buildServerInstructions(enabled).length
    ok(len > 0, `instructions(${enabled}) must be non-empty`)
    ok(len <= MAX_LEN, `instructions(${enabled}) is ${len} chars, exceeds the ${MAX_LEN} cap`)
  }
})

console.log(`\n📊 Results: ${pass} passed, ${fail} failed`)
if (fail > 0)
  process.exit(1)
