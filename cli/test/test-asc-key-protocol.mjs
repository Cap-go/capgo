#!/usr/bin/env node
import assert from 'node:assert/strict'
import {
  ASC_KEY_CHANNEL,
  ASC_LOG_LEVELS,
  ASC_PROTOCOL_VERSION,
  AscProtocolParser,
  ascEventToTrack,
  buildEventTags,
  formatInternalLogLine,
  parseAscProtocolLine,
} from '../src/build/onboarding/asc-key/protocol.ts'

console.log('🧪 Testing asc-key stdout stats protocol...\n')

// 1. parse a valid event line
{
  const line = parseAscProtocolLine('{"capgoAscKey":1,"kind":"event","ts":12,"runId":"r1","name":"step_changed","props":{"from":"login","to":"verifyAccess","elapsed_ms_on_prev":340}}')
  assert.ok(line, 'event line should parse')
  assert.equal(line.kind, 'event')
  assert.equal(line.name, 'step_changed')
  assert.equal(line.runId, 'r1')
  assert.equal(line.props.to, 'verifyAccess')
  console.log('✅ parses a valid event line')
}

// 2. parse a valid success result line (credentials present)
{
  const line = parseAscProtocolLine('{"capgoAscKey":1,"kind":"result","ts":900,"runId":"r1","ok":true,"keyId":"ABC123","issuerId":"iss-uuid","privateKey":"-----BEGIN PRIVATE KEY-----\\nX\\n-----END PRIVATE KEY-----"}')
  assert.ok(line, 'result line should parse')
  assert.equal(line.kind, 'result')
  assert.equal(line.ok, true)
  assert.equal(line.keyId, 'ABC123')
  assert.equal(line.issuerId, 'iss-uuid')
  assert.ok(line.privateKey.includes('BEGIN PRIVATE KEY'))
  console.log('✅ parses a success result line with credentials')
}

// 3. parse a failure result line
{
  const line = parseAscProtocolLine('{"capgoAscKey":1,"kind":"result","ok":false,"errorCode":"USER_CANCELLED","message":"closed"}')
  assert.ok(line)
  assert.equal(line.ok, false)
  assert.equal(line.errorCode, 'USER_CANCELLED')
  console.log('✅ parses a failure result line')
}

// 4. ignores non-protocol lines (chatter, wrong version, malformed, blank)
{
  assert.equal(parseAscProtocolLine(''), null)
  assert.equal(parseAscProtocolLine('some swift NSLog chatter'), null)
  assert.equal(parseAscProtocolLine('{"hello":"world"}'), null, 'no version tag => not protocol')
  assert.equal(parseAscProtocolLine('{"capgoAscKey":999,"kind":"event","name":"x"}'), null, 'wrong version => ignored')
  assert.equal(parseAscProtocolLine('{not valid json'), null)
  console.log('✅ ignores chatter / wrong version / malformed / blank')
}

// 5. streaming parser reassembles lines split across chunks
{
  const parser = new AscProtocolParser()
  const a = parser.push('{"capgoAscKey":1,"kind":"event","name":"helper_started","props":{}}\n{"capgoAscKey":1,"kind":"ev')
  assert.equal(a.length, 1, 'first complete line emitted, partial buffered')
  assert.equal(a[0].name, 'helper_started')
  const b = parser.push('ent","name":"signed_in","props":{"team_count":2}}\n')
  assert.equal(b.length, 1, 'buffered partial completed by next chunk')
  assert.equal(b[0].name, 'signed_in')
  assert.equal(b[0].props.team_count, 2)
  console.log('✅ streaming parser reassembles split lines')
}

// 6. flush() returns a trailing newline-less line
{
  const parser = new AscProtocolParser()
  const pushed = parser.push('{"capgoAscKey":1,"kind":"result","ok":true,"keyId":"K","issuerId":"I","privateKey":"P"}')
  assert.equal(pushed.length, 0, 'no newline yet => nothing emitted')
  const flushed = parser.flush()
  assert.equal(flushed.length, 1)
  assert.equal(flushed[0].keyId, 'K')
  console.log('✅ flush() yields the final newline-less line')
}

// 7. event -> trackEvent mapping uses the right channel + humanized name
{
  const event = { capgoAscKey: 1, kind: 'event', ts: 50, runId: 'r9', name: 'validation_succeeded', props: { duration_ms: 1200 } }
  const mapped = ascEventToTrack(event)
  assert.equal(mapped.channel, ASC_KEY_CHANNEL)
  assert.equal(mapped.event, 'ASC Key: Validation Succeeded')
  assert.equal(mapped.tags.helper_event, 'validation_succeeded')
  assert.equal(mapped.tags.helper_run_id, 'r9')
  assert.equal(mapped.tags.prop_duration_ms, 1200)
  console.log('✅ ascEventToTrack maps channel + humanized name + tags')
}

// 8. SECRET GUARD: a stray private key in event props must never reach tags
{
  const event = { capgoAscKey: 1, kind: 'event', ts: 1, runId: 'r', name: 'oops', props: { privateKey: 'SECRET', private_key: 'SECRET', p8: 'SECRET', token: 'SECRET', team_count: 3 } }
  const tags = buildEventTags(event)
  const serialized = JSON.stringify(tags)
  assert.ok(!serialized.includes('SECRET'), 'no secret-looking value should appear in tags')
  assert.equal(tags.prop_team_count, 3, 'non-secret props still pass through')
  console.log('✅ secret-looking props are stripped before analytics')
}

// 9. protocol version constant sanity
{
  assert.equal(ASC_PROTOCOL_VERSION, 1)
  console.log('✅ protocol version constant')
}

// 10. parse a valid log line (diagnostics → internal support log)
{
  const line = parseAscProtocolLine('{"capgoAscKey":1,"kind":"log","ts":420,"runId":"r2","level":"warn","message":"issuer_id scrape returned no value","props":{"attempt":3,"url":"https://appstoreconnect.apple.com/access/integrations/api"}}')
  assert.ok(line, 'log line should parse')
  assert.equal(line.kind, 'log')
  assert.equal(line.level, 'warn')
  assert.equal(line.message, 'issuer_id scrape returned no value')
  assert.equal(line.props.attempt, 3)
  console.log('✅ parses a valid log line')
}

// 11. log line: missing message is dropped; unknown/absent level defaults to info
{
  assert.equal(parseAscProtocolLine('{"capgoAscKey":1,"kind":"log","props":{}}'), null, 'no message => not a log line')
  const noLevel = parseAscProtocolLine('{"capgoAscKey":1,"kind":"log","message":"hi"}')
  assert.equal(noLevel.level, 'info', 'absent level defaults to info')
  const oddLevel = parseAscProtocolLine('{"capgoAscKey":1,"kind":"log","level":"verbose","message":"hi"}')
  assert.equal(oddLevel.level, 'info', 'unknown level falls back to info')
  assert.deepEqual([...ASC_LOG_LEVELS], ['debug', 'info', 'warn', 'error'])
  console.log('✅ log line tolerates missing message / odd level')
}

// 12. formatInternalLogLine renders a readable, prop-bearing support line
{
  const line = parseAscProtocolLine('{"capgoAscKey":1,"kind":"log","ts":1234,"runId":"r","level":"error","message":"Apple key validation failed","props":{"detail":"Unauthorized"}}')
  const rendered = formatInternalLogLine(line)
  assert.ok(rendered.includes('+1234ms'), 'includes the run-clock timestamp')
  assert.ok(rendered.includes('ERROR'), 'includes the upper-cased level')
  assert.ok(rendered.includes('Apple key validation failed'), 'includes the message')
  assert.ok(rendered.includes('"detail":"Unauthorized"'), 'includes structured props')
  // A log line with no props renders without a trailing props blob.
  const bare = formatInternalLogLine(parseAscProtocolLine('{"capgoAscKey":1,"kind":"log","ts":5,"level":"info","message":"hello"}'))
  assert.equal(bare, '[asc-helper +5ms] INFO hello')
  console.log('✅ formatInternalLogLine renders a readable support line')
}

// 13. SECRET GUARD: a stray secret in log props must never reach the support log
{
  const line = parseAscProtocolLine('{"capgoAscKey":1,"kind":"log","ts":1,"level":"debug","message":"oops","props":{"privateKey":"SECRET","p8":"SECRET","token":"SECRET","attempt":2}}')
  const rendered = formatInternalLogLine(line)
  assert.ok(!rendered.includes('SECRET'), 'no secret-looking value should appear in the rendered log line')
  assert.ok(rendered.includes('"attempt":2'), 'non-secret props still pass through')
  console.log('✅ secret-looking props are stripped from log lines')
}

console.log('\n🎉 All asc-key protocol tests passed')
