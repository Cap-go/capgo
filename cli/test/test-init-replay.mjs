#!/usr/bin/env node
import assert from 'node:assert/strict'
import { applyCommandAnalyticsOptOut, applyRawCommandAnalyticsOptOut } from '../src/analytics/opt-out.ts'
import { buildInitReplayBody, createTerminalInteractionEvents, createTerminalSnapshot, createTerminalSnapshotNode, getReplayViewportSize, renderRedactedTerminalFrame, renderRedactedTerminalText, resolvePosthogReplayUrl, shouldStartInitReplay } from '../src/init/replay.ts'

console.log('🧪 Testing init replay telemetry...\n')

const baseGate = {
  analyticsEnabled: true,
  apikey: 'capgo-key',
  isCi: false,
  posthogToken: 'phc-token',
  stdinIsTTY: true,
  stdoutIsTTY: true,
  telemetryDisabled: false,
}

assert.equal(shouldStartInitReplay(baseGate), true, 'interactive init with keys starts replay')
assert.equal(shouldStartInitReplay({ ...baseGate, analyticsEnabled: false }), false, '--no-analytics disables replay')
assert.equal(shouldStartInitReplay({ ...baseGate, apikey: '' }), false, 'missing Capgo API key disables replay')
assert.equal(shouldStartInitReplay({ ...baseGate, isCi: true }), false, 'CI disables replay')
assert.equal(shouldStartInitReplay({ ...baseGate, posthogToken: '' }), false, 'missing PostHog token disables replay')
assert.equal(shouldStartInitReplay({ ...baseGate, stdinIsTTY: false }), false, 'non-interactive stdin disables replay')
assert.equal(shouldStartInitReplay({ ...baseGate, stdoutIsTTY: false }), false, 'non-interactive stdout disables replay')
assert.equal(shouldStartInitReplay({ ...baseGate, telemetryDisabled: true }), false, 'env opt-out disables replay')

assert.equal(resolvePosthogReplayUrl('https://eu.i.posthog.com/i/v0/e'), 'https://eu.i.posthog.com/s/')
assert.equal(resolvePosthogReplayUrl('https://eu.i.posthog.com/capture'), 'https://eu.i.posthog.com/s/')
assert.equal(resolvePosthogReplayUrl('https://eu.i.posthog.com/s/'), 'https://eu.i.posthog.com/s/')
assert.equal(resolvePosthogReplayUrl('not a url'), undefined)
assert.deepEqual(getReplayViewportSize(100, 30), { height: 632, width: 932 }, 'terminal cells are converted to replay pixels')
assert.deepEqual(getReplayViewportSize(20, 5), { height: 480, width: 800 }, 'replay viewport has readable minimum dimensions')

const redacted = await renderRedactedTerminalText([
  'capg_1234567890abcdef',
  'Authorization: Bearer abcdefghijklmno.1234567890',
  '-----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----',
].join('\n'), 120, 10)
assert.match(redacted, /\[REDACTED\]/, 'redacted marker is present')
assert.doesNotMatch(redacted, /capg_1234567890abcdef/, 'Capgo API key is redacted')
assert.doesNotMatch(redacted, /abcdefghijklmno\.1234567890/, 'bearer token is redacted')
assert.doesNotMatch(redacted, /BEGIN PRIVATE KEY/, 'private key block is redacted')

const styledFrame = await renderRedactedTerminalFrame('\u001B[32mhello replay\u001B[0m\nsecond line', 120, 10)
assert.match(styledFrame.html, /color:/, 'terminal HTML keeps xterm color styles')
assert.match(styledFrame.html, /hello replay/, 'terminal HTML includes visible text')
const node = await createTerminalSnapshotNode(styledFrame)
const serializedNode = JSON.stringify(node)
const ansiSplitSecret = await renderRedactedTerminalText('capg_1234\u001B[31m567890abcdef\u001B[0m', 120, 10)
assert.match(ansiSplitSecret, /\[REDACTED\]/, 'ANSI-normalized secret is redacted')
assert.doesNotMatch(ansiSplitSecret, /capg_1234567890abcdef/, 'ANSI-split Capgo API key is redacted after terminal normalization')
const softWrappedSecret = await renderRedactedTerminalText(`edge ${'x'.repeat(8)} capg_1234567890abcdef`, 12, 10)
assert.match(softWrappedSecret, /\[REDACTED\]/, 'soft-wrapped Capgo API key is redacted')
assert.doesNotMatch(softWrappedSecret, /capg_1234567890abcdef/, 'soft-wrapped API key is not serialized')
assert.match(serializedNode, /data-capgo-terminal/, 'snapshot includes the terminal wrapper')
assert.match(serializedNode, /hello replay/, 'snapshot includes visible terminal text')
const terminalSnapshot = await createTerminalSnapshot('hello input replay')
assert.equal(typeof terminalSnapshot.terminalNodeId, 'number', 'snapshot exposes terminal node id for input events')
assert.ok(terminalSnapshot.terminalNodeId > 0, 'terminal node id is positive')

const originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  enumerable: true,
  get: () => ({ userAgent: 'readonly-navigator-test' }),
})
try {
  const readonlyNavigatorSnapshot = await createTerminalSnapshot(styledFrame)
  assert.ok(readonlyNavigatorSnapshot.terminalNodeId > 0, 'snapshot works when global navigator is getter-only')
}
finally {
  if (originalNavigatorDescriptor)
    Object.defineProperty(globalThis, 'navigator', originalNavigatorDescriptor)
  else delete globalThis.navigator
}

const interactionEvents = createTerminalInteractionEvents({ terminalNodeId: terminalSnapshot.terminalNodeId, text: 'hello input replay', timestamp: 456 })
assert.equal(interactionEvents.length, 2, 'terminal frame creates click and input events')
assert.equal(interactionEvents[0].type, 3, 'first interaction event is incremental')
assert.equal(interactionEvents[0].data.source, 2, 'first interaction event is mouse interaction')
assert.equal(interactionEvents[1].data.source, 5, 'second interaction event is input')
assert.equal(interactionEvents[1].data.text, 'hello input replay', 'input event carries the redacted terminal text')
const event = {
  data: {
    height: 24,
    href: 'capgo-cli://init',
    width: 80,
  },
  timestamp: 123,
  type: 4,
}
const body = buildInitReplayBody({
  events: [event],
  sessionId: 'init-session-123',
  timestamp: '2026-06-16T00:00:00.000Z',
  token: 'phc-token',
  windowId: 'window-123',
})
assert.equal(body.event, '$snapshot')
assert.equal(body.api_key, 'phc-token')
assert.equal(body.distinct_id, 'cli:init-session-123')
assert.equal(body.properties.distinct_id, 'cli:init-session-123')
assert.equal(body.properties.$session_id, 'init-session-123')
assert.equal(body.properties.$window_id, 'window-123')
assert.equal(body.properties.$current_url, 'capgo-cli://init')
assert.deepEqual(body.properties.$snapshot_data, [event])
assert.equal(typeof body.properties.$snapshot_bytes, 'number')
assert.ok(body.properties.$snapshot_bytes > 0, 'snapshot byte size is included')
assert.doesNotMatch(JSON.stringify(body.properties), /capgo-key/, 'Capgo API keys are not replay properties')

const buildOnboardingBody = buildInitReplayBody({
  currentUrl: 'capgo-cli://build-onboarding',
  events: [event],
  sessionId: 'build-onboarding-session-123',
  timestamp: '2026-06-16T00:00:00.000Z',
  token: 'phc-token',
  windowId: 'window-123',
})
assert.equal(buildOnboardingBody.distinct_id, 'cli:build-onboarding-session-123', 'build onboarding replay falls back to replay session distinct_id')
assert.equal(buildOnboardingBody.properties.$session_id, 'build-onboarding-session-123')
assert.equal(buildOnboardingBody.properties.$current_url, 'capgo-cli://build-onboarding')

const identifiedBody = buildInitReplayBody({
  events: [event],
  identity: { distinctId: 'user-uuid-123', email: 'user@example.com', userId: 'user-uuid-123' },
  sessionId: 'init-session-123',
  timestamp: '2026-06-16T00:00:00.000Z',
  token: 'phc-token',
  windowId: 'window-123',
})
assert.equal(identifiedBody.distinct_id, 'user-uuid-123', 'replay uses API-key owner as PostHog distinct_id')
assert.equal(identifiedBody.properties.distinct_id, 'user-uuid-123')
assert.equal(identifiedBody.properties.user_id, 'user-uuid-123')
assert.deepEqual(identifiedBody.properties.$set, { email: 'user@example.com' }, 'replay sets PostHog person email')

const envTarget = {}
assert.equal(applyCommandAnalyticsOptOut('init', { analytics: false }, envTarget), true)
assert.equal(envTarget.CAPGO_DISABLE_TELEMETRY, 'true')
const buildEnvTarget = {}
assert.equal(applyCommandAnalyticsOptOut('build init', { analytics: false }, buildEnvTarget), true)
assert.equal(buildEnvTarget.CAPGO_DISABLE_TELEMETRY, 'true')
assert.equal(applyCommandAnalyticsOptOut('build onboarding', { analytics: false }, {}), true)
assert.equal(applyCommandAnalyticsOptOut('bundle upload', { analytics: false }, {}), false)
assert.equal(applyCommandAnalyticsOptOut('init', { analytics: true }, {}), false)
const rawInitEnvTarget = {}
assert.equal(applyRawCommandAnalyticsOptOut(['node', 'capgo', 'init', '--no-analytics', '--bad-option'], rawInitEnvTarget), true)
assert.equal(rawInitEnvTarget.CAPGO_DISABLE_TELEMETRY, 'true')
const rawBuildEnvTarget = {}
assert.equal(applyRawCommandAnalyticsOptOut(['node', 'capgo', 'build', 'onboarding', '--no-analytics', '--bad-option'], rawBuildEnvTarget), true)
assert.equal(rawBuildEnvTarget.CAPGO_DISABLE_TELEMETRY, 'true')
assert.equal(applyRawCommandAnalyticsOptOut(['node', 'capgo', 'bundle', 'upload', '--no-analytics'], {}), false)

console.log('✅ init replay telemetry tests passed')
