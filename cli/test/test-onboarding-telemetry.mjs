#!/usr/bin/env node
import assert from 'node:assert/strict'
import { trackBuilderOnboardingAction, trackBuilderOnboardingCancelled, trackBuilderOnboardingStep } from '../src/build/onboarding/telemetry.ts'

// sendEvent() now injects the shared global analytics props (OS, arch, OS
// release, CLI/Node versions, CI context) on every event. Strip them so the
// caller-tag assertions below stay focused on event-specific dimensions.
const GLOBAL_TAG_KEYS = ['cli_version', 'node_version', 'os_platform', 'os_arch', 'os_release', 'is_ci', 'is_tty', 'invocation_source', 'ci_provider']
function callerTags(tags) {
  const rest = { ...tags }
  for (const key of GLOBAL_TAG_KEYS)
    delete rest[key]
  return rest
}

console.log('🧪 Testing onboarding telemetry...\n')

const originalFetch = globalThis.fetch

// Mock fetch so /private/config resolves (500 → silent fallback) and every
// /private/events POST is captured for assertions. Returns the captured
// requests so each case can find its own event payload.
function installFetchMock() {
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
  return requests
}

function findEventBody(requests) {
  const eventRequest = requests.find(request => request.url.endsWith('/private/events'))
  assert.ok(eventRequest, 'Expected a telemetry request to /private/events')
  assert.equal(eventRequest.init.method, 'POST')
  assert.equal(eventRequest.init.headers.capgkey, 'capgo-key')
  assert.equal(eventRequest.init.headers['Content-Type'], 'application/json')
  assert.equal(eventRequest.init.signal instanceof AbortSignal, true)
  const body = JSON.parse(eventRequest.init.body)
  // sendEvent() injects the shared global analytics props on every event.
  assert.equal(typeof body.tags.os_release, 'string', 'global os_release tag present')
  assert.equal(typeof body.tags.os_platform, 'string', 'global os_platform tag present')
  assert.equal(typeof body.tags.os_arch, 'string', 'global os_arch tag present')
  assert.equal(typeof body.tags.cli_version, 'string', 'global cli_version tag present')
  return body
}

try {
  // ── Action event carries the journey id ───────────────────────────────────
  {
    const requests = installFetchMock()
    await trackBuilderOnboardingAction({
      action: 'android_sa_method_selected',
      apikey: 'capgo-key',
      appId: 'com.example.app',
      orgId: 'org-id',
      journeyId: 'bj_journey-1',
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

    const body = findEventBody(requests)
    assert.equal(body.event, 'Builder Onboarding Action')
    assert.equal(body.channel, 'builder-onboarding')
    assert.equal(body.notify, false)
    assert.equal(body.org_id, 'org-id')
    assert.equal(body.tracking_version, 2)
    assert.deepEqual(callerTags(body.tags), {
      accepted: 'true',
      action: 'android_sa_method_selected',
      app_id: 'com.example.app',
      attempt: '1',
      journey_id: 'bj_journey-1',
      method: 'existing',
      platform: 'android',
      step: 'service-account-method-select',
    })
    console.log('✅ Action event carries journey_id')
  }

  // ── Step event carries the journey id ─────────────────────────────────────
  {
    const requests = installFetchMock()
    await trackBuilderOnboardingStep({
      apikey: 'capgo-key',
      appId: 'com.example.app',
      orgId: 'org-id',
      journeyId: 'bj_journey-2',
      platform: 'ios',
      step: 'api-key-instructions',
      durationMs: 1234,
      durationStep: 'welcome',
    })

    const body = findEventBody(requests)
    assert.equal(body.event, 'Builder Onboarding Step')
    assert.equal(body.channel, 'builder-onboarding')
    assert.deepEqual(callerTags(body.tags), {
      app_id: 'com.example.app',
      duration_ms: '1234',
      duration_step: 'welcome',
      journey_id: 'bj_journey-2',
      platform: 'ios',
      step: 'api-key-instructions',
    })
    console.log('✅ Step event carries journey_id')
  }

  // ── Quit event: full payload (platform + last step + duration) ─────────────
  {
    const requests = installFetchMock()
    await trackBuilderOnboardingCancelled({
      apikey: 'capgo-key',
      appId: 'com.example.app',
      orgId: 'org-id',
      journeyId: 'bj_journey-3',
      platform: 'ios',
      lastStep: 'verifying-key',
      durationMs: 9876.4,
    })

    const body = findEventBody(requests)
    assert.equal(body.event, 'Builder Onboarding Quit')
    assert.equal(body.channel, 'builder-onboarding')
    assert.equal(body.icon, '🚪')
    assert.equal(body.notify, false)
    assert.equal(body.org_id, 'org-id')
    assert.equal(body.tracking_version, 2)
    assert.deepEqual(callerTags(body.tags), {
      app_id: 'com.example.app',
      duration_ms: '9876', // rounded
      journey_id: 'bj_journey-3',
      last_step: 'verifying-key',
      platform: 'ios',
    })
    console.log('✅ Quit event carries journey_id, last_step, duration_ms, platform')
  }

  // ── Quit event: minimal payload (quit before choosing a platform) ──────────
  {
    const requests = installFetchMock()
    await trackBuilderOnboardingCancelled({
      apikey: 'capgo-key',
      appId: 'com.example.app',
      journeyId: 'bj_journey-4',
      // no platform, no lastStep, no orgId, no durationMs
    })

    const body = findEventBody(requests)
    assert.equal(body.event, 'Builder Onboarding Quit')
    assert.equal(body.org_id, undefined)
    // Only the always-present tags survive; the optional dimensions are omitted
    // rather than sent as empty/undefined strings.
    assert.deepEqual(callerTags(body.tags), {
      app_id: 'com.example.app',
      journey_id: 'bj_journey-4',
    })
    console.log('✅ Quit event omits optional dimensions when quitting pre-platform')
  }

  console.log('\n✅ Onboarding telemetry tests passed')
}
finally {
  globalThis.fetch = originalFetch
}
