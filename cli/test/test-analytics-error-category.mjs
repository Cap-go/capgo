#!/usr/bin/env node
import assert from 'node:assert/strict'
import { categorizeCliError } from '../src/analytics/error-category.ts'

console.log('🧪 Testing categorizeCliError...\n')

assert.equal(categorizeCliError({ status: 401 }), 'unauthorized')
assert.equal(categorizeCliError({ status: 403 }), 'forbidden')
assert.equal(categorizeCliError({ status: 404 }), 'not_found')
assert.equal(categorizeCliError({ status: 413 }), 'payload_too_large')
assert.equal(categorizeCliError({ status: 500 }), 'server_error')

assert.equal(categorizeCliError(new Error('fetch failed: ECONNREFUSED')), 'network_error')
assert.equal(categorizeCliError(new Error('The operation timed out')), 'timeout')
assert.equal(categorizeCliError(new Error('Invalid app id format')), 'validation_error')

assert.equal(categorizeCliError({ code: 'commander.help' }), 'commander')

assert.equal(categorizeCliError(new Error('something weird')), 'unknown')
assert.equal(categorizeCliError(undefined), 'unknown')

console.log('✅ categorizeCliError tests passed')
