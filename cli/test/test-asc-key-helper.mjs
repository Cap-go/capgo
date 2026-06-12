#!/usr/bin/env node
// Journey tests for the ASC key helper integration. We cannot drive the native
// Swift GUI, but we CAN drive the whole CLI side of the journey: spawn a process
// that speaks the stdout stats protocol, stream + parse it, forward events to
// PostHog, and return / route the credentials. We use a fake helper binary (a
// tiny node script) that emits a scripted protocol so every branch — success,
// cancel, crash, secret-stripping, analytics-off — is exercised end to end.
import assert from 'node:assert/strict'
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { flushAnalytics } from '../src/analytics/track.ts'
import { NotMacOSError, resolveHelperBinary, runAscKeyHelper } from '../src/build/onboarding/asc-key/helper.ts'

console.log('🧪 Testing asc-key helper journeys...\n')

const PRIVATE_KEY_SENTINEL = '-----BEGIN PRIVATE KEY-----SECRET_PK_DO_NOT_LEAK-----END PRIVATE KEY-----'
const EVENT_SECRET_SENTINEL = 'EVENT_PROP_SECRET_DO_NOT_LEAK'

const dir = mkdtempSync(join(tmpdir(), 'capgo-asc-helper-test-'))

// A reusable fake helper: reads its scripted lines + exit code from an env var
// and replays them on stdout/stderr. Cross-platform (node), shebang + +x.
const fakeHelper = join(dir, 'fake-helper')
writeFileSync(
  fakeHelper,
  `#!/usr/bin/env node
const spec = JSON.parse(process.env.FAKE_HELPER_SPEC || '{}')
for (const line of (spec.lines || [])) process.stdout.write(line + '\\n')
if (spec.stderr) process.stderr.write(spec.stderr)
process.exit(spec.exit ?? 0)
`,
  { mode: 0o755 },
)
chmodSync(fakeHelper, 0o755)

function ev(name, props = {}) {
  return JSON.stringify({ capgoAscKey: 1, kind: 'event', ts: 1, runId: 'RUN-1', name, props })
}
function okResult() {
  return JSON.stringify({ capgoAscKey: 1, kind: 'result', ts: 9, runId: 'RUN-1', ok: true, keyId: 'ABC123XYZ', issuerId: 'issuer-uuid-1', privateKey: PRIVATE_KEY_SENTINEL })
}
function setSpec(lines, exit = 0, stderr = '') {
  process.env.FAKE_HELPER_SPEC = JSON.stringify({ lines, exit, stderr })
}

// --- fetch stub mirroring test-analytics.mjs --------------------------------
const originalFetch = globalThis.fetch
function stubFetch() {
  const requests = []
  globalThis.fetch = async (url, init) => {
    requests.push({ init, url: String(url) })
    if (String(url).endsWith('/private/config'))
      return new Response('', { status: 500 })
    return new Response('{}', { headers: { 'Content-Type': 'application/json' }, status: 200 })
  }
  return requests
}
const eventRequests = requests => requests.filter(r => r.url.endsWith('/private/events'))
function ascEventBodies(requests) {
  return eventRequests(requests)
    .map(r => JSON.parse(r.init.body))
    .filter(b => b.channel === 'app-store-connect-key')
}

const savedDisable = process.env.CAPGO_DISABLE_TELEMETRY
const savedDisableP = process.env.CAPGO_DISABLE_POSTHOG
delete process.env.CAPGO_DISABLE_TELEMETRY
delete process.env.CAPGO_DISABLE_POSTHOG

try {
  // ── macOS gate journey ────────────────────────────────────────────────────
  // The helper only runs on macOS. On a non-mac CI runner, the meaningful
  // journey is that it throws NotMacOSError (and the spawn journeys are skipped).
  if (process.platform !== 'darwin') {
    await assert.rejects(
      () => runAscKeyHelper({ helperPathOverride: fakeHelper, apikey: 'k', forwardToAnalytics: false }),
      NotMacOSError,
      'non-macOS must reject with NotMacOSError',
    )
    console.log('✅ non-macOS: rejects with NotMacOSError (spawn journeys skipped off-darwin)')
    console.log('\n🎉 asc-key helper journeys passed (macOS gate)')
    process.exit(0)
  }

  // ── 0. resolveHelperBinary honours the env override ───────────────────────
  {
    const prev = process.env.CAPGO_ASC_KEY_HELPER_PATH
    process.env.CAPGO_ASC_KEY_HELPER_PATH = fakeHelper
    assert.equal(resolveHelperBinary(), fakeHelper, 'env override should win')
    if (prev === undefined)
      delete process.env.CAPGO_ASC_KEY_HELPER_PATH
    else process.env.CAPGO_ASC_KEY_HELPER_PATH = prev
    console.log('✅ resolveHelperBinary honours CAPGO_ASC_KEY_HELPER_PATH')
  }

  // ── 1. SUCCESS journey: events forwarded, credentials returned ────────────
  {
    setSpec([
      ev('helper_started', { protocol_version: 1 }),
      ev('signed_in', { team_count: 2 }),
      ev('step_changed', { from: 'login', to: 'verifyAccess', elapsed_ms_on_prev: 340 }),
      ev('validation_succeeded', { duration_ms: 1200 }),
      okResult(),
    ], 0)
    const requests = stubFetch()
    const seen = []
    const outcome = await runAscKeyHelper({ helperPathOverride: fakeHelper, apikey: 'capgo-key', onEvent: e => seen.push(e.name) })
    await flushAnalytics()

    assert.equal(outcome.ok, true, 'success outcome')
    assert.equal(outcome.credentials.keyId, 'ABC123XYZ')
    assert.equal(outcome.credentials.issuerId, 'issuer-uuid-1')
    assert.equal(outcome.credentials.privateKey, PRIVATE_KEY_SENTINEL, 'credentials returned to caller')
    assert.equal(outcome.runId, 'RUN-1')
    assert.equal(outcome.eventCount, 4, '4 event lines (result is not an event)')
    assert.deepEqual(seen, ['helper_started', 'signed_in', 'step_changed', 'validation_succeeded'], 'onEvent saw every event in order')

    const bodies = ascEventBodies(requests)
    assert.equal(bodies.length, 4, 'all 4 events forwarded to PostHog')
    const names = bodies.map(b => b.event)
    assert.ok(names.includes('ASC Key: Helper Started'), 'humanized event name')
    assert.ok(names.includes('ASC Key: Validation Succeeded'))
    const signedIn = bodies.find(b => b.event === 'ASC Key: Signed In')
    assert.equal(signedIn.tags.prop_team_count, 2, 'props forwarded as prop_* tags')
    assert.equal(signedIn.tags.helper_run_id, 'RUN-1', 'run id correlates events')
    assert.equal(signedIn.channel, 'app-store-connect-key')
    console.log('✅ success: 4 events forwarded to PostHog + credentials returned')

    // CRITICAL: the private key must never appear in any forwarded request body.
    for (const r of eventRequests(requests)) {
      assert.ok(!String(r.init.body).includes(PRIVATE_KEY_SENTINEL), 'private key must NEVER reach analytics')
    }
    console.log('✅ success: private key never forwarded to analytics')
  }

  // ── 2. CANCEL journey ─────────────────────────────────────────────────────
  {
    setSpec([
      ev('helper_started'),
      JSON.stringify({ capgoAscKey: 1, kind: 'result', ok: false, runId: 'RUN-2', errorCode: 'USER_CANCELLED', message: 'closed' }),
    ], 1)
    stubFetch()
    const outcome = await runAscKeyHelper({ helperPathOverride: fakeHelper, apikey: 'capgo-key', forwardToAnalytics: false })
    await flushAnalytics()
    assert.equal(outcome.ok, false)
    assert.equal(outcome.errorCode, 'USER_CANCELLED')
    console.log('✅ cancel: USER_CANCELLED surfaced as a failure outcome')
  }

  // ── 3. CRASH journey: no result line, nonzero exit, stderr captured ───────
  {
    setSpec(['random NSLog chatter not protocol', '{"unrelated":true}'], 2, 'kaboom on stderr')
    stubFetch()
    const outcome = await runAscKeyHelper({ helperPathOverride: fakeHelper, apikey: 'capgo-key', forwardToAnalytics: false })
    await flushAnalytics()
    assert.equal(outcome.ok, false)
    assert.equal(outcome.errorCode, 'NO_RESULT')
    assert.ok(outcome.message.includes('kaboom'), 'stderr surfaced in the error message')
    console.log('✅ crash: missing result line + nonzero exit → NO_RESULT (stderr captured)')
  }

  // ── 4. SPAWN-FAILED journey: binary path does not exist ───────────────────
  {
    stubFetch()
    const outcome = await runAscKeyHelper({ helperPathOverride: join(dir, 'does-not-exist'), apikey: 'capgo-key', forwardToAnalytics: false })
    await flushAnalytics()
    assert.equal(outcome.ok, false)
    assert.equal(outcome.errorCode, 'SPAWN_FAILED')
    console.log('✅ spawn-failed: missing binary → SPAWN_FAILED (no throw)')
  }

  // ── 5. SECRET GUARD journey: a stray secret in event props is stripped ────
  {
    setSpec([
      ev('oops_leaky', { privateKey: EVENT_SECRET_SENTINEL, team_count: 3 }),
      okResult(),
    ], 0)
    const requests = stubFetch()
    const outcome = await runAscKeyHelper({ helperPathOverride: fakeHelper, apikey: 'capgo-key' })
    await flushAnalytics()
    assert.equal(outcome.ok, true)
    for (const r of eventRequests(requests)) {
      const body = String(r.init.body)
      assert.ok(!body.includes(EVENT_SECRET_SENTINEL), 'secret-looking event prop must be stripped')
      assert.ok(!body.includes(PRIVATE_KEY_SENTINEL), 'result private key must never be forwarded')
    }
    const leaky = ascEventBodies(requests).find(b => b.event === 'ASC Key: Oops Leaky')
    assert.equal(leaky.tags.prop_team_count, 3, 'non-secret props still forwarded')
    assert.equal(leaky.tags.prop_privateKey, undefined, 'secret prop dropped')
    console.log('✅ secret guard: stray secret prop stripped, non-secret props kept')
  }

  // ── 6. ANALYTICS-OFF journey: credentials still returned, nothing sent ────
  {
    setSpec([ev('helper_started'), okResult()], 0)
    const requests = stubFetch()
    const seen = []
    const outcome = await runAscKeyHelper({ helperPathOverride: fakeHelper, apikey: 'capgo-key', forwardToAnalytics: false, onEvent: e => seen.push(e.name) })
    await flushAnalytics()
    assert.equal(outcome.ok, true)
    assert.deepEqual(seen, ['helper_started'], 'onEvent still fires for UI')
    assert.equal(ascEventBodies(requests).length, 0, 'forwardToAnalytics:false sends nothing')
    console.log('✅ analytics-off: credentials returned, onEvent fires, nothing sent')
  }

  console.log('\n🎉 All asc-key helper journey tests passed')
}
finally {
  globalThis.fetch = originalFetch
  if (savedDisable !== undefined)
    process.env.CAPGO_DISABLE_TELEMETRY = savedDisable
  if (savedDisableP !== undefined)
    process.env.CAPGO_DISABLE_POSTHOG = savedDisableP
}
