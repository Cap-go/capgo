#!/usr/bin/env node

import assert from 'node:assert/strict'
import { normalizeStoreUrl } from '../src/app/store-url.ts'

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

await test('normalizes ios store urls', () => {
  assert.equal(
    normalizeStoreUrl('https://apps.apple.com/app/id123', 'apps.apple.com'),
    'https://apps.apple.com/app/id123',
  )
})

await test('normalizes android store urls', () => {
  assert.equal(
    normalizeStoreUrl('https://play.google.com/store/apps/details?id=com.demo', 'play.google.com'),
    'https://play.google.com/store/apps/details?id=com.demo',
  )
})

await test('rejects invalid store hosts', () => {
  assert.throws(
    () => normalizeStoreUrl('https://example.com/app', 'apps.apple.com'),
    /apps.apple.com/,
  )
})

if (failures > 0) {
  console.error(`\n❌ ${failures} app set option test(s) failed`)
  process.exit(1)
}

console.log('\n✅ App set option checks work')
