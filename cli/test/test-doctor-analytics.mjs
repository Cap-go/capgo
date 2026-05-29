#!/usr/bin/env node
import assert from 'node:assert/strict'
import { computeDoctorAnalyticsTags } from '../src/app/info.ts'

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

console.log('✅ doctor analytics tags tests passed')
