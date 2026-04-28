#!/usr/bin/env node

import assert from 'node:assert/strict'

console.log('🧪 Testing interactive prompt guard in CI-like environments...\n')

const { canPromptInteractively } = await import('../src/utils.ts')

let failures = 0

async function test(name, fn) {
  try {
    await fn()
    console.log(`✅ ${name}`)
  }
  catch (error) {
    failures += 1
    console.error(`❌ ${name}`)
    console.error(error)
  }
}

await test('CI disables prompts even when stdin/stdout look interactive', () => {
  assert.equal(canPromptInteractively({
    stdinIsTTY: true,
    stdoutIsTTY: true,
    ci: true,
  }), false)
})

await test('missing TTY still disables prompts outside CI', () => {
  assert.equal(canPromptInteractively({
    stdinIsTTY: false,
    stdoutIsTTY: true,
    ci: false,
  }), false)
})

await test('silent mode disables prompts outside CI', () => {
  assert.equal(canPromptInteractively({
    silent: true,
    stdinIsTTY: true,
    stdoutIsTTY: true,
    ci: false,
  }), false)
})

await test('real interactive local sessions still allow prompts', () => {
  assert.equal(canPromptInteractively({
    stdinIsTTY: true,
    stdoutIsTTY: true,
    ci: false,
  }), true)
})

if (failures > 0) {
  console.error(`\n❌ ${failures} prompt guard test(s) failed`)
  process.exit(1)
}

console.log('\n✅ Prompt guard behaves correctly for CI/non-interactive sessions')
