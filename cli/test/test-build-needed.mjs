#!/usr/bin/env node

import assert from 'node:assert/strict'

const {
  BUILD_NEEDED_ERROR_EXIT_CODE,
  formatShortBuildNeeded,
  formatVerboseBuildNeeded,
  getBuildNeededExitCode,
  getConfiguredDefaultChannel,
  getNativeDiffLabel,
  getVersionChangeType,
  isBuildNeeded,
  selectDefaultChannelName,
} = await import('../src/build/needed.ts')
const { formatTable, visibleWidth } = await import('../src/terminal-table.ts')

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

await test('maps build requirement to short output and exit code', () => {
  assert.equal(formatShortBuildNeeded(true), 'yes')
  assert.equal(formatShortBuildNeeded(false), 'no')
  assert.equal(getBuildNeededExitCode(true), 1)
  assert.equal(getBuildNeededExitCode(false), 0)
  assert.equal(BUILD_NEEDED_ERROR_EXIT_CODE, 2)
})

await test('detects build requirement from native compatibility entries', () => {
  assert.equal(isBuildNeeded([
    {
      name: '@capacitor/camera',
      localVersion: '2.0.0',
      remoteVersion: '1.0.0',
    },
  ]), true)

  assert.equal(isBuildNeeded([
    {
      name: '@capacitor/camera',
      localVersion: undefined,
      remoteVersion: '1.0.0',
    },
  ]), false)
})

await test('classifies version changes for verbose diff output', () => {
  assert.equal(getVersionChangeType({ name: 'pkg', remoteVersion: '1.2.3', localVersion: '2.0.0' }), 'major')
  assert.equal(getVersionChangeType({ name: 'pkg', remoteVersion: '1.2.3', localVersion: '1.3.0' }), 'minor')
  assert.equal(getVersionChangeType({ name: 'pkg', remoteVersion: '1.2.3', localVersion: '1.2.4' }), 'patch')
  assert.equal(getVersionChangeType({ name: 'pkg', remoteVersion: '1.2.3', localVersion: '1.2.3' }), 'same')
  assert.equal(getVersionChangeType({ name: 'pkg', remoteVersion: undefined, localVersion: '1.2.3' }), 'new')
  assert.equal(getVersionChangeType({ name: 'pkg', remoteVersion: '1.2.3', localVersion: undefined }), 'removed')
  assert.equal(getVersionChangeType({ name: 'pkg', remoteVersion: 'workspace:*', localVersion: '1.2.3' }), 'changed')
})

await test('detects native checksum platform changes', () => {
  assert.equal(getNativeDiffLabel({
    name: 'pkg',
    remoteVersion: '1.0.0',
    localVersion: '1.0.0',
    remoteIosChecksum: 'ios-old',
    localIosChecksum: 'ios-new',
    remoteAndroidChecksum: 'android-old',
    localAndroidChecksum: 'android-new',
  }), 'iOS + Android')

  assert.equal(getNativeDiffLabel({
    name: 'pkg',
    remoteVersion: '1.0.0',
    localVersion: '1.0.0',
    remoteIosChecksum: 'same',
    localIosChecksum: 'same',
    remoteAndroidChecksum: 'android-old',
    localAndroidChecksum: 'android-new',
  }), 'Android')

  assert.equal(getNativeDiffLabel({
    name: 'pkg',
    remoteVersion: '1.0.0',
    localVersion: '1.0.0',
    remoteIosChecksum: undefined,
    localIosChecksum: 'ios-new',
  }), 'iOS')
})

await test('resolves configured default channel from Capacitor config', () => {
  assert.equal(getConfiguredDefaultChannel({
    plugins: {
      CapacitorUpdater: {
        defaultChannel: ' production ',
      },
    },
  }), 'production')

  assert.equal(getConfiguredDefaultChannel({
    plugins: {
      CapacitorUpdater: {
        defaultChannel: ' ',
      },
    },
  }), undefined)
})

await test('selects a unique public default channel and rejects ambiguous defaults', () => {
  assert.equal(selectDefaultChannelName([
    { name: 'production' },
    { name: ' production ' },
  ]), 'production')

  assert.throws(() => selectDefaultChannelName([]), /No default channel/)
  assert.throws(() => selectDefaultChannelName([
    { name: 'production' },
    { name: 'beta' },
  ]), /Multiple default channels/)
})

await test('formats verbose table with version-change color coding', () => {
  const output = formatVerboseBuildNeeded({
    required: true,
    resolvedAppId: 'com.example.app',
    channel: 'production',
    finalCompatibility: [
      { name: 'major-lib', remoteVersion: '1.0.0', localVersion: '2.0.0' },
      { name: 'minor-lib', remoteVersion: '1.0.0', localVersion: '1.1.0' },
      { name: 'patch-lib', remoteVersion: '1.0.0', localVersion: '1.0.1' },
    ],
  }, { color: true })

  assert.match(output, /Build needed: yes/)
  assert.match(output, /Exit code: 1/)
  assert.match(output, /\x1B\[31mmajor\x1B\[0m/)
  assert.match(output, /\x1B\[33mminor\x1B\[0m/)
  assert.match(output, /\x1B\[32mpatch\x1B\[0m/)
})

await test('formats table borders around emoji and ansi cells', () => {
  const output = formatTable({
    headers: ['Package', 'Status', 'Details'],
    rows: [
      ['@capacitor/android', '❌', 'version changed: 8.1.0 → 0.1.0'],
      ['@capacitor/ios', '✅', '\x1B[32mCompatible\x1B[0m'],
    ],
  })

  const lineWidths = output.split('\n').map(line => visibleWidth(line))
  assert.deepEqual([...new Set(lineWidths)], [lineWidths[0]])
})

if (failures > 0) {
  console.error(`\n❌ ${failures} build needed test(s) failed`)
  process.exit(1)
}

console.log('\n✅ Build needed checks work')
