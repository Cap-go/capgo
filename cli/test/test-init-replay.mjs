#!/usr/bin/env node
import assert from 'node:assert/strict'
import { applyCommandAnalyticsOptOut, applyRawCommandAnalyticsOptOut } from '../src/analytics/opt-out.ts'
import { buildInitReplayBody, createTerminalInteractionEvents, createTerminalSnapshot, createTerminalSnapshotNode, getReplayViewportSize, parseTerminalPixelSizeResponse, renderRedactedTerminalFrame, renderRedactedTerminalText, resolveCapgoReplayUrl, shouldStartInitReplay } from '../src/init/replay.ts'

console.log('🧪 Testing init replay telemetry...\n')

const baseGate = {
  analyticsEnabled: true,
  apikey: 'capgo-key',
  isCi: false,
  stdinIsTTY: true,
  stdoutIsTTY: true,
  telemetryDisabled: false,
}

assert.equal(shouldStartInitReplay(baseGate), true, 'interactive init with keys starts replay')
assert.equal(shouldStartInitReplay({ ...baseGate, analyticsEnabled: false }), false, '--no-analytics disables replay')
assert.equal(shouldStartInitReplay({ ...baseGate, apikey: '' }), false, 'missing Capgo API key disables replay')
assert.equal(shouldStartInitReplay({ ...baseGate, isCi: true }), false, 'CI disables replay')
assert.equal(shouldStartInitReplay({ ...baseGate, stdinIsTTY: false }), false, 'non-interactive stdin disables replay')
assert.equal(shouldStartInitReplay({ ...baseGate, stdoutIsTTY: false }), false, 'non-interactive stdout disables replay')
assert.equal(shouldStartInitReplay({ ...baseGate, telemetryDisabled: true }), false, 'env opt-out disables replay')

assert.equal(resolveCapgoReplayUrl('https://api.capgo.app'), 'https://api.capgo.app/private/replay')
assert.equal(resolveCapgoReplayUrl('https://api.capgo.app/private/replay'), 'https://api.capgo.app/private/replay')
assert.equal(resolveCapgoReplayUrl('not a url'), undefined)
assert.deepEqual(getReplayViewportSize(20, 5), { height: 480, width: 800 }, 'replay viewport has readable minimum dimensions')
assert.deepEqual(parseTerminalPixelSizeResponse('\u001B[4;412;640t'), { height: 412, width: 640 }, 'xterm pixel-size report is parsed as height and width')
assert.equal(parseTerminalPixelSizeResponse('\u001B[4;0;640t'), undefined, 'invalid terminal pixel reports are ignored')
assert.deepEqual(getReplayViewportSize(20, 5, { height: 412, width: 640 }), { height: 412, width: 640 }, 'reported terminal pixels override computed fallback size')
const pixelSizedFrame = await renderRedactedTerminalFrame('small real terminal', 20, 5, { height: 412, width: 640 })
assert.equal(pixelSizedFrame.width, 640, 'terminal frame uses reported pixel width')
assert.equal(pixelSizedFrame.height, 412, 'terminal frame uses reported pixel height')

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
  windowId: 'window-123',
})
assert.equal(body.event, '$snapshot')
assert.equal(body.properties.$session_id, 'init-session-123')
assert.equal(body.properties.$window_id, 'window-123')
assert.equal(body.properties.$current_url, 'capgo-cli://init')
assert.deepEqual(body.properties.$snapshot_data, [event])
assert.equal(typeof body.properties.$snapshot_bytes, 'number')
assert.ok(body.properties.$snapshot_bytes > 0, 'snapshot byte size is included')
assert.doesNotMatch(JSON.stringify(body), /capgo-key/, 'Capgo API keys are not replay properties')
assert.doesNotMatch(JSON.stringify(body), /phc-token/, 'PostHog project tokens are not sent by the CLI')
assert.equal('api_key' in body, false, 'backend owns the PostHog API key')
assert.equal('distinct_id' in body, false, 'backend owns replay identity')
assert.equal('token' in body.properties, false, 'backend owns PostHog token properties')
assert.equal('$set' in body.properties, false, 'backend owns PostHog person properties')

const buildOnboardingBody = buildInitReplayBody({
  currentUrl: 'capgo-cli://build-onboarding',
  events: [event],
  sessionId: 'build-onboarding-session-123',
  timestamp: '2026-06-16T00:00:00.000Z',
  windowId: 'window-123',
})
assert.equal(buildOnboardingBody.properties.$session_id, 'build-onboarding-session-123')
assert.equal(buildOnboardingBody.properties.$current_url, 'capgo-cli://build-onboarding')

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
