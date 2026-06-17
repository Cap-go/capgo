#!/usr/bin/env node
/**
 * Unit tests for the MCP OAuth broker HTTP client (createBrokerSession / pollBrokerSession).
 * Stubs global fetch to assert the request shape (path, app_id, Bearer poll_secret, x-confirm-code) and the
 * mapping of the broker's {status} responses to the typed BrokerPollResult.
 */
import process from 'node:process'

console.log('🧪 Testing MCP OAuth broker client...\n')

process.env.CAPGO_OAUTH_BROKER_URL = 'https://broker.test'
const { createBrokerSession, pollBrokerSession } = await import('../src/build/onboarding/mcp/broker-oauth.ts')

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
function restore() { globalThis.fetch = realFetch }
function jsonRes(body, status = 200) { return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }) }

await test('createBrokerSession POSTs app_id to the broker and maps the response', async () => {
  let seen
  stubFetch((url, init) => { seen = { url, init }; return jsonRes({ pub_id: 'P', poll_secret: 'S', sign_in_url: 'https://broker.test/builder_auth_direct/google/start?s=P', expires_at: 123 }) })
  const s = await createBrokerSession('com.acme.app')
  restore()
  eq(seen.url, 'https://broker.test/builder_auth_direct/google/sessions', 'create hits the sessions path')
  eq(seen.init.method, 'POST')
  eq(JSON.parse(seen.init.body).app_id, 'com.acme.app', 'app_id is sent in the body')
  eq(s.pubId, 'P'); eq(s.pollSecret, 'S'); eq(s.expiresAt, 123); ok(s.signInUrl.includes('start?s=P'))
})

await test('createBrokerSession throws on an incomplete response', async () => {
  stubFetch(() => jsonRes({ pub_id: 'P' }))
  let threw = false
  try { await createBrokerSession('com.x') } catch { threw = true }
  restore()
  ok(threw, 'missing poll_secret/sign_in_url must throw')
})

await test('pollBrokerSession sends Bearer + maps pending / awaiting_code / done', async () => {
  stubFetch(() => jsonRes({ status: 'pending' }))
  eq((await pollBrokerSession({ pubId: 'P', pollSecret: 'S' })).status, 'pending')

  let hdrs
  stubFetch((url, init) => { hdrs = init.headers; return jsonRes({ status: 'awaiting_code' }) })
  const aw = await pollBrokerSession({ pubId: 'P', pollSecret: 'S' })
  eq(aw.status, 'awaiting_code')
  eq(hdrs.authorization, 'Bearer S', 'poll authenticates with the poll_secret bearer')
  ok(!('x-confirm-code' in hdrs), 'no confirm-code header when none is provided')

  stubFetch((url, init) => { hdrs = init.headers; return jsonRes({ status: 'done', access_token: 'AT', expires_at: 999 }) })
  const done = await pollBrokerSession({ pubId: 'P', pollSecret: 'S' }, 'ABCD2345')
  restore()
  eq(done.status, 'done'); eq(done.accessToken, 'AT'); eq(done.expiresAt, 999)
  eq(hdrs['x-confirm-code'], 'ABCD2345', 'the confirm code rides the x-confirm-code header')
})

await test('pollBrokerSession maps 404 + error status to terminal errors', async () => {
  stubFetch(() => new Response('', { status: 404 }))
  eq((await pollBrokerSession({ pubId: 'P', pollSecret: 'S' })).status, 'error')
  stubFetch(() => jsonRes({ status: 'error', error: 'consent denied' }))
  const e = await pollBrokerSession({ pubId: 'P', pollSecret: 'S' })
  restore()
  eq(e.status, 'error'); eq(e.error, 'consent denied')
})

await test('pollBrokerSession treats a done with no token as an error (never a blank handoff)', async () => {
  stubFetch(() => jsonRes({ status: 'done', access_token: null }))
  eq((await pollBrokerSession({ pubId: 'P', pollSecret: 'S' }, 'X')).status, 'error')
  restore()
})

console.log(`\n📊 Results: ${pass} passed, ${fail} failed`)
if (fail > 0)
  process.exit(1)
