#!/usr/bin/env node

import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const testHome = mkdtempSync(join(tmpdir(), 'capgo-prompt-prefs-'))
const testPreferencesPath = join(testHome, '.capgo-prompt-preferences.json')

console.log('🧪 Testing prompt preference persistence...\n')

const {
  getRememberedPromptPreference,
  rememberPromptPreference,
  rememberPromptPreferenceSafely,
} = await import('../src/promptPreferences.ts')

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

await test('missing preference file returns undefined', async () => {
  assert.equal(await getRememberedPromptPreference('uploadStarCapgoRepo', testPreferencesPath), undefined)
  assert.equal(existsSync(testPreferencesPath), false)
})

await test('remembered choices persist to disk', async () => {
  await rememberPromptPreference('uploadStarCapgoRepo', false, testPreferencesPath)
  await rememberPromptPreference('uploadShowReplicationProgress', true, testPreferencesPath)

  assert.equal(await getRememberedPromptPreference('uploadStarCapgoRepo', testPreferencesPath), false)
  assert.equal(await getRememberedPromptPreference('uploadShowReplicationProgress', testPreferencesPath), true)

  const stored = JSON.parse(readFileSync(testPreferencesPath, 'utf8'))
  assert.deepEqual(stored, {
    uploadStarCapgoRepo: false,
    uploadShowReplicationProgress: true,
  })
})

await test('invalid preference files are ignored safely', async () => {
  writeFileSync(testPreferencesPath, '{not-json', 'utf8')
  assert.equal(await getRememberedPromptPreference('uploadStarCapgoRepo', testPreferencesPath), undefined)
})

await test('safe preference persistence swallows write errors', async () => {
  const brokenParent = join(testHome, 'broken-parent')
  const brokenPreferencesPath = join(brokenParent, '.capgo-prompt-preferences.json')
  writeFileSync(brokenParent, 'not-a-directory', 'utf8')

  await rememberPromptPreferenceSafely('uploadStarCapgoRepo', true, brokenPreferencesPath)
  assert.equal(existsSync(brokenPreferencesPath), false)
})

if (failures > 0) {
  console.error(`\n❌ ${failures} prompt preference test(s) failed`)
  process.exit(1)
}

console.log('\n✅ Prompt preferences persist correctly')
