#!/usr/bin/env node
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { computeDoctorAnalyticsTags } from '../src/app/info.ts'
import { getCapgoPluginTags, listCapgoPackages } from '../src/utils.ts'

console.log('🧪 Testing doctor analytics tags...\n')

const tags = computeDoctorAnalyticsTags(
  { '@capgo/capacitor-updater': '6.0.0', '@capacitor/core': '6.1.0' },
  { '@capgo/capacitor-updater': '6.2.0', '@capacitor/core': '6.1.0' },
)
assert.equal(tags.is_outdated, true, 'updater behind latest => outdated')
assert.equal(tags.dependency_count, 2)
assert.equal(tags.outdated_count, 1)

const fresh = computeDoctorAnalyticsTags(
  { '@capgo/capacitor-updater': '6.2.0' },
  { '@capgo/capacitor-updater': '6.2.0' },
)
assert.equal(fresh.is_outdated, false)
assert.equal(fresh.dependency_count, 1)
assert.equal(fresh.outdated_count, 0)

// edge cases
const empty = computeDoctorAnalyticsTags({}, {})
assert.equal(empty.is_outdated, false)
assert.equal(empty.dependency_count, 0)
assert.equal(empty.outdated_count, 0)

const allOutdated = computeDoctorAnalyticsTags({ a: '1.0.0', b: '2.0.0' }, { a: '1.1.0', b: '2.1.0' })
assert.equal(allOutdated.is_outdated, true)
assert.equal(allOutdated.dependency_count, 2)
assert.equal(allOutdated.outdated_count, 2)

// --- capgo plugin tags helper (shared by init/doctor/upload events) ---
const dir = mkdtempSync(join(tmpdir(), 'capgo-plugin-tags-'))
const pkgPath = join(dir, 'package.json')
writeFileSync(pkgPath, JSON.stringify({
  dependencies: {
    '@capgo/capacitor-updater': '^7.0.0',
    '@capacitor/core': '^7.0.0',
  },
  devDependencies: {
    '@capgo/cli': '^7.0.0',
    '@capgo/capacitor-social-login': '^1.0.0',
  },
}))

const plugins = listCapgoPackages(pkgPath)
assert.deepEqual(plugins, ['@capgo/capacitor-social-login', '@capgo/capacitor-updater', '@capgo/cli'], 'deps + devDeps, sorted, @capgo/* only')

const pluginTags = getCapgoPluginTags(pkgPath)
assert.equal(pluginTags.capgo_plugins, '@capgo/capacitor-social-login,@capgo/capacitor-updater,@capgo/cli')
assert.equal(pluginTags.capgo_plugin_count, 3)

// The result is cached per process: later calls reuse it whatever the path.
assert.deepEqual(listCapgoPackages('/nonexistent/package.json'), plugins)

console.log('✅ doctor analytics tags tests passed')
