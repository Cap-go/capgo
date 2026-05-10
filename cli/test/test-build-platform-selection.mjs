#!/usr/bin/env node

import assert from 'node:assert/strict'

const { resolveBuildPlatform } = await import('../src/build/request.ts')

let failures = 0

async function test(name, fn) {
  try {
    await fn()
    console.log(`✓ ${name}`)
  }
  catch (error) {
    failures += 1
    console.error(`❌ ${name}`)
    console.error(error)
  }
}

await test('uses an explicitly provided iOS platform', async () => {
  assert.equal(await resolveBuildPlatform('ios', { interactive: false }), 'ios')
})

await test('uses an explicitly provided Android platform', async () => {
  assert.equal(await resolveBuildPlatform('android', { interactive: false }), 'android')
})

await test('rejects invalid platforms before prompting', async () => {
  await assert.rejects(
    () => resolveBuildPlatform('web', {
      interactive: true,
      promptPlatform: async () => {
        throw new Error('prompt should not run')
      },
    }),
    /Invalid platform "web"/,
  )
})

await test('keeps missing platform invalid in non-interactive mode', async () => {
  await assert.rejects(
    () => resolveBuildPlatform(undefined, { interactive: false }),
    /Missing required argument: --platform <ios\|android>/,
  )
})

await test('prompts for a missing platform in interactive mode', async () => {
  let prompted = false
  const platform = await resolveBuildPlatform(undefined, {
    interactive: true,
    promptPlatform: async () => {
      prompted = true
      return 'android'
    },
  })

  assert.equal(prompted, true)
  assert.equal(platform, 'android')
})

await test('rejects canceled interactive platform selection', async () => {
  await assert.rejects(
    () => resolveBuildPlatform(undefined, {
      interactive: true,
      promptPlatform: async () => Symbol('cancel'),
    }),
    /Build request canceled/,
  )
})

if (failures > 0) {
  console.error(`\n❌ ${failures} build platform selection test(s) failed`)
  process.exit(1)
}

console.log('\n✅ Build platform selection works')
