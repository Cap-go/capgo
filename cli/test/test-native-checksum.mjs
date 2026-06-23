#!/usr/bin/env node

import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const fixtureRoot = join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures/native-checksum')

const {
  calculatePlatformChecksums,
  dependencyHasNativeFiles,
  getNativeScanRoots,
  normalizeChecksumRelativePath,
  normalizeNativeFileContentForChecksum,
} = await import('../src/native-checksum.ts')

const { compareNativePackages, summarizeBundleCompatibility } = await import(
  '../../supabase/functions/_backend/utils/bundle_compatibility.ts'
)

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

await test('normalizes CRLF and LF to the same checksum input', () => {
  const lf = Buffer.from('class AppPlugin {\n}\n', 'utf8')
  const crlf = Buffer.from('class AppPlugin {\r\n}\r\n', 'utf8')
  const file = 'ios/Sources/Plugin/AppPlugin.swift'

  const normalizedLf = normalizeNativeFileContentForChecksum(lf, file)
  const normalizedCrlf = normalizeNativeFileContentForChecksum(crlf, file)

  assert.equal(normalizedLf.toString('utf8'), normalizedCrlf.toString('utf8'))
})

await test('normalizes Windows-style relative paths with forward slashes', () => {
  const dependencyFolderPath = '/project/node_modules/@capacitor/app'
  const filePath = '/project/node_modules/@capacitor/app\\ios\\Sources\\AppPlugin.swift'

  assert.equal(
    normalizeChecksumRelativePath(dependencyFolderPath, filePath),
    'ios/Sources/AppPlugin.swift',
  )
})

await test('produces identical checksums for LF and CRLF plugin fixtures', async () => {
  const lf = await calculatePlatformChecksums(join(fixtureRoot, 'plugin-lf'))
  const crlf = await calculatePlatformChecksums(join(fixtureRoot, 'plugin-crlf'))

  assert.equal(lf.ios_checksum, crlf.ios_checksum)
  assert.equal(lf.android_checksum, crlf.android_checksum)
  assert.ok(lf.ios_checksum)
  assert.ok(lf.android_checksum)
})

await test('checksums @capacitor/android and @capacitor/ios platform package layouts', async () => {
  const android = await calculatePlatformChecksums(join(fixtureRoot, 'capacitor-android'))
  const ios = await calculatePlatformChecksums(join(fixtureRoot, 'capacitor-ios'))

  assert.ok(android.android_checksum, 'expected android checksum for @capacitor/android layout')
  assert.equal(android.ios_checksum, undefined)
  assert.ok(ios.ios_checksum, 'expected ios checksum for @capacitor/ios layout')
  assert.equal(ios.android_checksum, undefined)
})

await test('detects native files in platform package layouts', () => {
  assert.equal(dependencyHasNativeFiles(join(fixtureRoot, 'capacitor-android')), true)
  assert.equal(dependencyHasNativeFiles(join(fixtureRoot, 'capacitor-ios')), true)
})

await test('discovers alternate native scan roots for platform packages', () => {
  const androidRoots = getNativeScanRoots(join(fixtureRoot, 'capacitor-android'), 'android')
  const iosRoots = getNativeScanRoots(join(fixtureRoot, 'capacitor-ios'), 'ios')

  assert.ok(androidRoots.some(root => root.endsWith('/capacitor')))
  assert.ok(iosRoots.some(root => root.endsWith('/Capacitor')))
})

await test('does not treat lowercase capacitor/ as Capacitor/ on case-insensitive filesystems', () => {
  const iosRoots = getNativeScanRoots(join(fixtureRoot, 'capacitor-android'), 'ios')
  assert.equal(iosRoots.length, 0)
})

await test('flags same-semver checksum drift as incompatible (checksum is source of truth)', async () => {
  const baseline = await calculatePlatformChecksums(join(fixtureRoot, 'plugin-lf'))
  const candidate = await calculatePlatformChecksums(join(fixtureRoot, 'plugin-changed'))

  assert.notEqual(baseline.ios_checksum, candidate.ios_checksum, 'fixture sanity: ios checksums should differ')
  assert.notEqual(baseline.android_checksum, candidate.android_checksum, 'fixture sanity: android checksums should differ')

  const comparisons = compareNativePackages(
    [{
      name: '@capacitor/app',
      version: '8.1.0',
      ios_checksum: candidate.ios_checksum,
      android_checksum: candidate.android_checksum,
    }],
    [{
      name: '@capacitor/app',
      version: '8.1.0',
      ios_checksum: baseline.ios_checksum,
      android_checksum: baseline.android_checksum,
    }],
  )

  assert.equal(comparisons[0].status, 'changed')
  assert.equal(comparisons[0].compatible, false)
  assert.deepEqual(comparisons[0].reasons, ['both_platforms_changed'])

  const summary = summarizeBundleCompatibility(comparisons)
  assert.equal(summary.compatible, false)
  assert.deepEqual(summary.offenders, ['@capacitor/app'])
})

if (failures > 0) {
  console.error(`\n❌ ${failures} native checksum test(s) failed`)
  process.exit(1)
}

console.log('\n✅ Native checksum checks work')
