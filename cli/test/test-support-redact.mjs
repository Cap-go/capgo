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

t('redacts p8/pem-keyed values (ASC helper log props) but keeps p8Path', () => {
  const out = redactSecrets('asc-helper error: bad key {"p8":"PRIVKEYBASE64SECRET","pem":"PEMSECRET","p8Path":"/Users/x/AuthKey_ABC.p8","attempt":2}')
  assert.ok(!out.includes('PRIVKEYBASE64SECRET'))
  assert.ok(!out.includes('PEMSECRET'))
  assert.ok(out.includes('/Users/x/AuthKey_ABC.p8'), 'the .p8 file PATH is useful for support, not a secret — kept')
  assert.ok(out.includes('"attempt":2'), 'non-secret context preserved')
})
