#!/usr/bin/env node
/**
 * Tests for buildProvisioningMap input validation:
 * - empty bundle ID in bundleId=path format
 * - empty path in bundleId=path format
 * - empty entry (whitespace-only)
 * - duplicate bundle IDs
 */

import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { buildProvisioningMap } from '../src/build/credentials-command.ts'

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

// --- Input validation (no file access needed) ---

t('rejects empty bundle ID in bundleId=path format', () => {
  assert.throws(
    () => buildProvisioningMap(['=./profile.mobileprovision']),
    /Empty bundle ID/,
  )
})

t('rejects whitespace-only bundle ID in bundleId=path format', () => {
  assert.throws(
    () => buildProvisioningMap(['  =./profile.mobileprovision']),
    /Empty bundle ID/,
  )
})

t('rejects empty path in bundleId=path format', () => {
  assert.throws(
    () => buildProvisioningMap(['com.example.app=']),
    /Empty profile path/,
  )
})

t('rejects whitespace-only path in bundleId=path format', () => {
  assert.throws(
    () => buildProvisioningMap(['com.example.app=   ']),
    /Empty profile path/,
  )
})

t('rejects empty entry (whitespace-only string)', () => {
  assert.throws(
    () => buildProvisioningMap(['   ']),
    /Empty provisioning profile entry/,
  )
})

t('rejects empty entry (empty string)', () => {
  assert.throws(
    () => buildProvisioningMap(['']),
    /Empty provisioning profile entry/,
  )
})

// --- Duplicate detection (needs real files to get past file-exists check) ---

// Helper to create a minimal fake .mobileprovision file with embedded plist
function createFakeProfile(dir, name, bundleId, profileName) {
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>Name</key>
  <string>${profileName}</string>
  <key>UUID</key>
  <string>fake-uuid</string>
  <key>Entitlements</key>
  <dict>
    <key>application-identifier</key>
    <string>TEAM.${bundleId}</string>
  </dict>
</dict>
</plist>`
  const prefix = Buffer.from([0x30, 0x82, 0x00, 0x00])
  const xml = Buffer.from(plist, 'utf-8')
  const suffix = Buffer.from([0x00, 0x00, 0x00])
  const path = join(dir, name)
  writeFileSync(path, Buffer.concat([prefix, xml, suffix]))
  return path
}

t('rejects duplicate bundle IDs in explicit format', () => {
  const dir = mkdtempSync(join(tmpdir(), 'prov-test-'))
  try {
    const p1 = createFakeProfile(dir, 'a.mobileprovision', 'com.example.app', 'Profile A')
    const p2 = createFakeProfile(dir, 'b.mobileprovision', 'com.example.app', 'Profile B')

    assert.throws(
      () => buildProvisioningMap([`com.example.app=${p1}`, `com.example.app=${p2}`]),
      /Duplicate provisioning profile for bundle ID "com\.example\.app"/,
    )
  }
  finally {
    rmSync(dir, { recursive: true })
  }
})

t('accepts different bundle IDs without error', () => {
  const dir = mkdtempSync(join(tmpdir(), 'prov-test-'))
  try {
    const p1 = createFakeProfile(dir, 'app.mobileprovision', 'com.example.app', 'App Profile')
    const p2 = createFakeProfile(dir, 'widget.mobileprovision', 'com.example.widget', 'Widget Profile')

    const result = buildProvisioningMap([`com.example.app=${p1}`, `com.example.widget=${p2}`])
    assert.ok(result['com.example.app'], 'should have app entry')
    assert.ok(result['com.example.widget'], 'should have widget entry')
    assert.equal(result['com.example.app'].name, 'App Profile')
    assert.equal(result['com.example.widget'].name, 'Widget Profile')
  }
  finally {
    rmSync(dir, { recursive: true })
  }
})

// --- Merge behavior (simulates updateCredentialsCommand logic) ---

/**
 * Simulates the merge logic from updateCredentialsCommand:
 * given an existing CAPGO_IOS_PROVISIONING_MAP JSON string and new entries,
 * merges them (new entries overwrite matching keys, existing keys preserved).
 */
function simulateMerge(existingMapJson, newEntries, overwrite) {
  if (overwrite)
    return newEntries

  let existingMap = {}
  if (existingMapJson) {
    try {
      existingMap = JSON.parse(existingMapJson)
    }
    catch {
      // Invalid JSON — start fresh
    }
  }
  return { ...existingMap, ...newEntries }
}

t('merge: new entries are added to existing map', () => {
  const dir = mkdtempSync(join(tmpdir(), 'prov-test-'))
  try {
    const p1 = createFakeProfile(dir, 'widget.mobileprovision', 'com.example.widget', 'Widget Profile')
    const newEntries = buildProvisioningMap([`com.example.widget=${p1}`])

    const existingJson = JSON.stringify({
      'com.example.app': { profile: 'base64app', name: 'App Profile' },
    })

    const merged = simulateMerge(existingJson, newEntries, false)
    assert.ok(merged['com.example.app'], 'existing app entry preserved')
    assert.equal(merged['com.example.app'].name, 'App Profile')
    assert.ok(merged['com.example.widget'], 'new widget entry added')
    assert.equal(merged['com.example.widget'].name, 'Widget Profile')
  }
  finally {
    rmSync(dir, { recursive: true })
  }
})

t('merge: new entry overwrites matching bundle ID in existing map', () => {
  const dir = mkdtempSync(join(tmpdir(), 'prov-test-'))
  try {
    const p1 = createFakeProfile(dir, 'app-new.mobileprovision', 'com.example.app', 'New App Profile')
    const newEntries = buildProvisioningMap([`com.example.app=${p1}`])

    const existingJson = JSON.stringify({
      'com.example.app': { profile: 'old-base64', name: 'Old App Profile' },
      'com.example.widget': { profile: 'base64widget', name: 'Widget Profile' },
    })

    const merged = simulateMerge(existingJson, newEntries, false)
    assert.equal(merged['com.example.app'].name, 'New App Profile', 'app entry updated')
    assert.notEqual(merged['com.example.app'].profile, 'old-base64', 'profile data updated')
    assert.equal(merged['com.example.widget'].name, 'Widget Profile', 'widget entry preserved')
  }
  finally {
    rmSync(dir, { recursive: true })
  }
})

t('merge: handles missing existing map gracefully', () => {
  const dir = mkdtempSync(join(tmpdir(), 'prov-test-'))
  try {
    const p1 = createFakeProfile(dir, 'app.mobileprovision', 'com.example.app', 'App Profile')
    const newEntries = buildProvisioningMap([`com.example.app=${p1}`])

    const merged = simulateMerge(undefined, newEntries, false)
    assert.ok(merged['com.example.app'], 'entry created from scratch')
    assert.equal(merged['com.example.app'].name, 'App Profile')
  }
  finally {
    rmSync(dir, { recursive: true })
  }
})

t('merge: handles invalid existing JSON gracefully', () => {
  const dir = mkdtempSync(join(tmpdir(), 'prov-test-'))
  try {
    const p1 = createFakeProfile(dir, 'app.mobileprovision', 'com.example.app', 'App Profile')
    const newEntries = buildProvisioningMap([`com.example.app=${p1}`])

    const merged = simulateMerge('{invalid json', newEntries, false)
    assert.ok(merged['com.example.app'], 'entry created despite invalid existing JSON')
    assert.equal(Object.keys(merged).length, 1, 'only new entry present')
  }
  finally {
    rmSync(dir, { recursive: true })
  }
})

t('overwrite: replaces entire map, drops existing entries', () => {
  const dir = mkdtempSync(join(tmpdir(), 'prov-test-'))
  try {
    const p1 = createFakeProfile(dir, 'app.mobileprovision', 'com.example.app', 'New App Profile')
    const newEntries = buildProvisioningMap([`com.example.app=${p1}`])

    const existingJson = JSON.stringify({
      'com.example.app': { profile: 'old-base64', name: 'Old App Profile' },
      'com.example.widget': { profile: 'base64widget', name: 'Widget Profile' },
    })

    const merged = simulateMerge(existingJson, newEntries, true)
    assert.equal(merged['com.example.app'].name, 'New App Profile', 'app entry replaced')
    assert.ok(!merged['com.example.widget'], 'widget entry dropped')
    assert.equal(Object.keys(merged).length, 1, 'only new entries remain')
  }
  finally {
    rmSync(dir, { recursive: true })
  }
})

process.stdout.write('OK\n')
