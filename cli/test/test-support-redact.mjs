// cli/test/test-support-redact.mjs
import assert from 'node:assert/strict'
import { redactSecrets } from '../src/support/redact.ts'
import { t } from './support-harness.mjs'

t('redacts bearer tokens', () => {
  const out = redactSecrets('Authorization: Bearer abc123DEF456ghi789')
  assert.ok(!out.includes('abc123DEF456ghi789'))
  assert.ok(out.includes('[REDACTED]'))
})

t('redacts capgo api keys (capgkey/capg_ prefixes)', () => {
  const out = redactSecrets('using key capg_1234567890abcdef and capgkey=zzzzzzzzzzzz')
  assert.ok(!out.includes('capg_1234567890abcdef'))
  assert.ok(!out.includes('zzzzzzzzzzzz'))
})

t('redacts PEM private key blocks', () => {
  const pem = '-----BEGIN PRIVATE KEY-----\nMIIabc\nDEF==\n-----END PRIVATE KEY-----'
  const out = redactSecrets(`key:\n${pem}\ndone`)
  assert.ok(out.includes('done'))
  assert.ok(!out.includes('MIIabc'))
  assert.ok(out.includes('[REDACTED PRIVATE KEY]'))
})

t('leaves ordinary text untouched', () => {
  assert.equal(redactSecrets('Build failed at step signing'), 'Build failed at step signing')
})

t('redacts JSON-style secrets from raw API error bodies', () => {
  const out = redactSecrets('{"error":"invalid","access_token":"ya29.SECRETVALUE123","detail":"x"}')
  assert.ok(!out.includes('ya29.SECRETVALUE123'))
  assert.ok(out.includes('[REDACTED]'))
  assert.ok(out.includes('"detail":"x"')) // non-secret fields preserved
})
