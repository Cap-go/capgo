#!/usr/bin/env node
/**
 * The disk-persisted broker session (broker-session.ts) must survive an MCP process restart: the in-flight
 * handle (pubId/pollSecret/signInUrl) lives in the on-disk Android onboarding progress, NOT in memory. These
 * tests drive begin/poll/clear against a temp progress dir with a stubbed broker fetch and assert the handle
 * is persisted, the poll maps the broker status, and clear removes it.
 */
import process from 'node:process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

console.log('🧪 Testing MCP broker session (disk-persisted)...\n')

process.env.CAPGO_OAUTH_BROKER_URL = 'https://broker.test'
const { brokerBegin, brokerPoll, brokerClear } = await import('../src/build/onboarding/mcp/broker-session.ts')
const { saveAndroidProgress, loadAndroidProgress } = await import('../src/build/onboarding/android/progress.ts')

let pass = 0
let fail = 0
async function test(name, fn) {
  try { console.log(`\n🔍 ${name}`); await fn(); console.log(`✅ PASSED: ${name}`); pass++ }
  catch (e) { console.error(`❌ FAILED: ${name}`); console.error(`   ${e.message}`); fail++ }
}
function eq(a, b, msg) { if (a !== b) throw new Error(msg || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`) }
function ok(c, msg) { if (!c) throw new Error(msg || 'expected truthy') }

const realFetch = globalThis.fetch
function stubFetch(handler) { globalThis.fetch = async (url, init) => handler(String(url), init || {}) }
function jsonRes(body, status = 200) { return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }) }

const APP = 'com.acme.app'
const dir = await mkdtemp(join(tmpdir(), 'capgo-broker-session-'))
async function seedProgress() { await saveAndroidProgress(APP, { platform: 'android', appId: APP, completedSteps: {} }, dir) }

try {
  await test('begin persists the broker handle into on-disk progress', async () => {
    await seedProgress()
    stubFetch(() => jsonRes({ pub_id: 'P', poll_secret: 'S', sign_in_url: 'https://broker.test/builder_auth_direct/google/start?s=P', expires_at: 999 }))
    const { signInUrl } = await brokerBegin(APP, dir)
    ok(signInUrl.includes('start?s=P'))
    const p = await loadAndroidProgress(APP, dir)
    eq(p._brokerOAuth.pubId, 'P'); eq(p._brokerOAuth.pollSecret, 'S')
  })

  await test('poll returns absent when no handle is persisted', async () => {
    await seedProgress() // fresh progress, no _brokerOAuth
    eq((await brokerPoll(APP, undefined, dir)).status, 'absent')
  })

  await test('poll maps pending / awaiting_code / done and carries the sign-in URL', async () => {
    await seedProgress()
    stubFetch(() => jsonRes({ pub_id: 'P', poll_secret: 'S', sign_in_url: 'https://broker.test/s?s=P', expires_at: 1 }))
    await brokerBegin(APP, dir)
    stubFetch(() => jsonRes({ status: 'pending' }))
    const pend = await brokerPoll(APP, undefined, dir)
    eq(pend.status, 'pending'); ok(pend.signInUrl.includes('s?s=P'), 'pending carries the sign-in URL for the gate')
    stubFetch(() => jsonRes({ status: 'awaiting_code', error: 'incorrect code' }))
    const aw = await brokerPoll(APP, 'WRONG', dir)
    eq(aw.status, 'awaiting_code'); eq(aw.error, 'incorrect code')
    stubFetch(() => jsonRes({ status: 'done', access_token: 'AT', expires_at: 4242 }))
    const done = await brokerPoll(APP, 'ABCD2345', dir)
    eq(done.status, 'done'); eq(done.accessToken, 'AT'); eq(done.expiresAt, 4242)
  })

  await test('clear removes the handle (reopen / recovery)', async () => {
    await seedProgress()
    stubFetch(() => jsonRes({ pub_id: 'P', poll_secret: 'S', sign_in_url: 'https://broker.test/s', expires_at: 1 }))
    await brokerBegin(APP, dir)
    await brokerClear(APP, dir)
    const p = await loadAndroidProgress(APP, dir)
    ok(!p._brokerOAuth, 'handle is gone after clear')
    eq((await brokerPoll(APP, undefined, dir)).status, 'absent')
  })
}
finally {
  globalThis.fetch = realFetch
  await rm(dir, { recursive: true, force: true })
}

console.log(`\n📊 Results: ${pass} passed, ${fail} failed`)
if (fail > 0)
  process.exit(1)
