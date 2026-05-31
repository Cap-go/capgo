#!/usr/bin/env node
import assert from 'node:assert/strict'
import { trackBuilderOnboardingAction } from '../src/build/onboarding/telemetry.ts'

console.log('🧪 Testing onboarding telemetry...\n')

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

  await trackBuilderOnboardingAction({
    action: 'android_sa_method_selected',
    apikey: 'capgo-key',
    appId: 'com.example.app',
    orgId: 'org-id',
    platform: 'android',
    step: 'service-account-method-select',
    tags: {
      accepted: true,
      action: 'caller_action',
      app_id: 'caller_app',
      attempt: 1,
      method: 'existing',
      platform: 'ios',
      step: 'caller-step',
    },
  })

  const eventRequest = requests.find(request => request.url.endsWith('/private/events'))
  assert.ok(eventRequest, 'Expected onboarding action telemetry request')
  assert.equal(eventRequest.init.method, 'POST')
  assert.equal(eventRequest.init.headers.capgkey, 'capgo-key')
  assert.equal(eventRequest.init.headers['Content-Type'], 'application/json')
  assert.equal(eventRequest.init.signal instanceof AbortSignal, true)

  const body = JSON.parse(eventRequest.init.body)
  assert.equal(body.event, 'Builder Onboarding Action')
  assert.equal(body.channel, 'builder-onboarding')
  assert.equal(body.notify, false)
  assert.equal(body.org_id, 'org-id')
  assert.equal(body.tracking_version, 2)
  assert.deepEqual(body.tags, {
    accepted: 'true',
    action: 'android_sa_method_selected',
    app_id: 'com.example.app',
    attempt: '1',
    method: 'existing',
    platform: 'android',
    step: 'service-account-method-select',
  })

  console.log('✅ Onboarding telemetry tests passed')
}
finally {
  globalThis.fetch = originalFetch
}
