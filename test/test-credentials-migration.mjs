#!/usr/bin/env node
/**
 * Test suite for build credentials migration
 * Tests the buildMigrationMap function that converts legacy provisioning profiles
 * to the new CAPGO_IOS_PROVISIONING_MAP format.
 */

import assert from 'node:assert/strict'
import { buildMigrationMap } from '../src/build/credentials-command.ts'

function t(name, fn) {
  try {
    fn()
    process.stdout.write(`\u2713 ${name}\n`)
  }
  catch (e) {
    process.stderr.write(`\u2717 ${name}\n`)
    throw e
  }
}

/**
 * Create a fake mobileprovision buffer with embedded plist, then base64-encode it.
 */
function createFakeProfileBase64(plistContent) {
  const prefix = Buffer.from([0x30, 0x82, 0x00, 0x00])
  const xml = Buffer.from(plistContent, 'utf-8')
  const suffix = Buffer.from([0x00, 0x00, 0x00])
  return Buffer.concat([prefix, xml, suffix]).toString('base64')
}

const testPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Name</key>
  <string>match AppStore com.example.app</string>
  <key>UUID</key>
  <string>ABCD-1234</string>
  <key>Entitlements</key>
  <dict>
    <key>application-identifier</key>
    <string>TEAM.com.example.app</string>
  </dict>
</dict>
</plist>`

t('buildMigrationMap produces valid JSON with correct structure', () => {
  const base64 = createFakeProfileBase64(testPlist)
  const result = buildMigrationMap(base64, 'com.example.app')

  const parsed = JSON.parse(result)

  assert.ok(parsed['com.example.app'], 'Map should contain the bundle ID key')
  assert.equal(parsed['com.example.app'].name, 'match AppStore com.example.app')
  assert.equal(parsed['com.example.app'].profile, base64, 'Profile base64 should be preserved')
})

t('buildMigrationMap uses the provided bundleId, not the one from profile', () => {
  const base64 = createFakeProfileBase64(testPlist)
  const result = buildMigrationMap(base64, 'com.different.app')

  const parsed = JSON.parse(result)

  assert.ok(parsed['com.different.app'], 'Map should use the provided bundle ID')
  assert.ok(!parsed['com.example.app'], 'Map should NOT use the profile bundle ID')
})

t('buildMigrationMap extracts profile name from base64 content', () => {
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>Name</key>
  <string>Custom Profile Name</string>
  <key>UUID</key>
  <string>uuid-here</string>
  <key>Entitlements</key>
  <dict>
    <key>application-identifier</key>
    <string>TEAM.com.test.app</string>
  </dict>
</dict>
</plist>`

  const base64 = createFakeProfileBase64(plist)
  const result = buildMigrationMap(base64, 'com.test.app')

  const parsed = JSON.parse(result)
  assert.equal(parsed['com.test.app'].name, 'Custom Profile Name')
})

t('buildMigrationMap throws for invalid base64 content', () => {
  assert.throws(
    () => buildMigrationMap('not-a-valid-profile', 'com.test.app'),
    /No embedded plist found/,
  )
})

process.stdout.write('OK\n')
