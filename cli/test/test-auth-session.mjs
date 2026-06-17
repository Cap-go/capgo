#!/usr/bin/env bun
/**
 * Unit tests for the shared auth core (src/auth/session.ts) — the single
 * validate/persist/introspect path behind `capgo login` and the MCP
 * capgo_login / capgo_whoami / capgo_logout tools.
 *
 * Covers the deterministic, offline surface: input guards, env-source
 * detection, and local-key removal. The network validation path
 * (resolveUserIdFromApiKey) is exercised by the integration smoke test.
 */
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'

console.log('🧪 Testing auth/session...\n')

let pass = 0
let fail = 0
async function test(name, fn) {
  try { console.log(`🔍 ${name}`); await fn(); console.log(`✅ ${name}\n`); pass++ }
  catch (e) { console.error(`❌ ${name}`); console.error(`   ${e.message}\n`); fail++ }
}
function ok(c, m) { if (!c) throw new Error(m || 'expected truthy') }
function eq(a, b, m) { if (a !== b) throw new Error(m || `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`) }

const { validateAndSaveKey, getLoginState, clearSavedKey } = await import('../src/auth/session.ts')

await test('validateAndSaveKey rejects an empty key (no write, no network)', async () => {
  let threw = false
  try { await validateAndSaveKey('') }
  catch (e) { threw = true; ok(/Missing API key/.test(e.message), `unexpected message: ${e.message}`) }
  ok(threw, 'must throw on empty key')
})

await test('validateAndSaveKey(local) refuses outside a git repository', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'capgo-auth-nogit-'))
  const prev = process.cwd()
  process.chdir(dir)
  try {
    let threw = false
    // A non-empty key gets past the first guard, then the .git check fires
    // BEFORE any network call — so this stays offline and deterministic.
    try { await validateAndSaveKey('not-a-real-key', { local: true }) }
    catch (e) { threw = true; ok(/git repository/i.test(e.message), `unexpected message: ${e.message}`) }
    ok(threw, 'must refuse a local save without a .git directory')
  }
  finally { process.chdir(prev) }
})

await test('getLoginState detects the CAPGO_TOKEN env source without validating', async () => {
  const prev = process.env.CAPGO_TOKEN
  process.env.CAPGO_TOKEN = 'tok_unit_test_value'
  try {
    const state = await getLoginState()
    eq(state.loggedIn, true, 'an env token means logged in')
    eq(state.source, 'env', 'source should be env')
  }
  finally {
    if (prev === undefined) delete process.env.CAPGO_TOKEN
    else process.env.CAPGO_TOKEN = prev
  }
})

await test('clearSavedKey(local) removes ./.capgo and is idempotent', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'capgo-auth-clear-'))
  const prev = process.cwd()
  process.chdir(dir)
  try {
    eq((await clearSavedKey({ local: true })).cleared, false, 'nothing to clear yet')
    writeFileSync('.capgo', 'some-key\n')
    eq((await clearSavedKey({ local: true })).cleared, true, 'removes the existing local key')
    eq((await clearSavedKey({ local: true })).cleared, false, 'idempotent after removal')
  }
  finally { process.chdir(prev) }
})

console.log(`📊 Results: ${pass} passed, ${fail} failed`)
if (fail > 0)
  process.exit(1)
