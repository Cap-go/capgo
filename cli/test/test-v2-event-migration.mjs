#!/usr/bin/env node
import assert from 'node:assert/strict'
import { markSnag } from '../src/app/debug.ts'

console.log('🧪 Testing v2 event migration (markSnag → onboarding events)...\n')

const originalFetch = globalThis.fetch

try {
  const requests = []
  globalThis.fetch = async (url, init) => {
    requests.push({ init, url: String(url) })
    if (String(url).endsWith('/private/config'))
      return new Response('', { status: 500 })
    return new Response('{}', {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    })
  }

  // markSnag is the shared helper behind every onboarding-step-* / debug event.
  await markSnag('onboarding-v2', 'org-123', 'capgo-key', 'onboarding-step-done', 'com.example.app')

  const eventRequest = requests.find(request => request.url.endsWith('/private/events'))
  assert.ok(eventRequest, 'Expected markSnag telemetry request')
  assert.equal(eventRequest.init.method, 'POST')
  assert.equal(eventRequest.init.headers.capgkey, 'capgo-key')

  const body = JSON.parse(eventRequest.init.body)
  assert.equal(body.event, 'onboarding-step-done')
  assert.equal(body.channel, 'onboarding-v2')
  assert.equal(body.notify, false)
  assert.equal(body.org_id, 'org-123', 'org is now sent as org_id (not user_id)')
  assert.equal(body.tracking_version, 2, 'event opts into the v2 actor-scoped contract')
  assert.equal(body.user_id, undefined, 'CLI must not send user_id (backend derives the actor from the key)')
  assert.deepEqual(body.tags, { 'app-id': 'com.example.app' })

  // The optional tags parameter merges caller tags with the app-id tag.
  await markSnag('onboarding-v2', 'org-123', 'capgo-key', 'canceled', undefined, '🤷', {
    last_step: 'add-app',
    elapsed_ms: 1234,
  })

  const eventRequests = requests.filter(request => request.url.endsWith('/private/events'))
  assert.equal(eventRequests.length, 2, 'Expected one request per markSnag call')
  const canceledBody = JSON.parse(eventRequests[1].init.body)
  assert.equal(canceledBody.event, 'canceled')
  assert.equal(canceledBody.icon, '🤷')
  assert.deepEqual(canceledBody.tags, { last_step: 'add-app', elapsed_ms: 1234 })

  console.log('✅ v2 event migration tests passed')
}
finally {
  globalThis.fetch = originalFetch
}
