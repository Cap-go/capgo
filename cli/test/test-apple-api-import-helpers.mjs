import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { classifyCertAvailability, computeCertSha1 } from '../src/build/onboarding/apple-api.ts'

function t(name, fn) {
  try {
    fn()
    process.stdout.write(`✓ ${name}\n`)
  }
  catch (e) {
    process.stderr.write(`✗ ${name}\n`)
    throw e
  }
}

// ─── computeCertSha1 ──────────────────────────────────────────────────

t('computeCertSha1 hashes base64-encoded DER bytes', () => {
  const fakeDer = Buffer.from('hello-cert-der')
  const expected = createHash('sha1').update(fakeDer).digest('hex').toLowerCase()
  const actual = computeCertSha1(fakeDer.toString('base64'))
  assert.equal(actual, expected)
  assert.match(actual, /^[a-f0-9]{40}$/)
})

t('computeCertSha1 is deterministic across runs', () => {
  const b64 = Buffer.from('apple-distribution-fake-der').toString('base64')
  const h1 = computeCertSha1(b64)
  const h2 = computeCertSha1(b64)
  assert.equal(h1, h2)
})

t('computeCertSha1 distinguishes different inputs', () => {
  const a = computeCertSha1(Buffer.from('a').toString('base64'))
  const b = computeCertSha1(Buffer.from('b').toString('base64'))
  assert.notEqual(a, b)
})

t('computeCertSha1 returns lowercase hex', () => {
  const b64 = Buffer.from('Mixed-Case-Input').toString('base64')
  const h = computeCertSha1(b64)
  assert.equal(h, h.toLowerCase())
})

t('computeCertSha1 matches the SHA1 a Keychain identity would have', () => {
  // The DER inside DeveloperCertificates and the cert in Keychain are the same
  // bytes, so hashing the base64-decoded payload must match what
  // `security find-identity` reports (which is also SHA1 of the DER).
  const der = Buffer.from([0x30, 0x82, 0x01, 0x00, ...Array(20).fill(0xAB)])
  const expected = createHash('sha1').update(der).digest('hex').toLowerCase()
  assert.equal(computeCertSha1(der.toString('base64')), expected)
})

// ─── classifyCertAvailability ──────────────────────────────────────

t('classifyCertAvailability marks expired certs unavailable from local date alone', () => {
  const result = classifyCertAvailability({
    localExpirationDate: '2020-01-01T00:00:00.000Z',
    appleCertId: 'cert-123', // even with a hit, expiration trumps
  })
  assert.equal(result.available, false)
  assert.equal(result.reason, 'expired')
  assert.match(result.reasonText, /Expired \(2020-01-01\)/)
})

t('classifyCertAvailability marks managed certs as unsignable', () => {
  const result = classifyCertAvailability({
    isManaged: true,
    appleCertId: 'cert-123',
  })
  assert.equal(result.available, false)
  assert.equal(result.reason, 'managed')
  assert.match(result.reasonText, /Apple-managed/)
})

t('classifyCertAvailability surfaces network errors as check-failed', () => {
  const result = classifyCertAvailability({
    appleCertId: null,
    lookupError: new Error('ECONNREFUSED'),
  })
  assert.equal(result.available, false)
  assert.equal(result.reason, 'check-failed')
  assert.match(result.reasonText, /ECONNREFUSED/)
})

t('classifyCertAvailability surfaces non-Error throw values as check-failed', () => {
  const result = classifyCertAvailability({
    appleCertId: null,
    lookupError: 'string-thrown',
  })
  assert.equal(result.reason, 'check-failed')
  assert.match(result.reasonText, /string-thrown/)
})

t('classifyCertAvailability marks valid certs as available with the Apple id', () => {
  const result = classifyCertAvailability({
    localExpirationDate: '2099-01-01T00:00:00.000Z',
    appleCertId: 'apple-id-abc',
  })
  assert.equal(result.available, true)
  assert.equal(result.appleCertId, 'apple-id-abc')
  assert.equal(result.reason, undefined)
})

t('classifyCertAvailability marks null Apple result as not-visible (neutral wording)', () => {
  const result = classifyCertAvailability({
    appleCertId: null,
  })
  assert.equal(result.available, false)
  assert.equal(result.reason, 'not-visible')
  // Should NOT claim revocation — we can't prove that from the response.
  assert.doesNotMatch(result.reasonText, /Revoked/)
  assert.match(result.reasonText, /Not visible|different team|lookup/)
})

t('classifyCertAvailability tolerates malformed expiration date strings', () => {
  const result = classifyCertAvailability({
    localExpirationDate: 'not-a-date',
    appleCertId: 'apple-id-xyz',
  })
  // Bad date should not crash; falls through to the lookup result.
  assert.equal(result.available, true)
  assert.equal(result.appleCertId, 'apple-id-xyz')
})

process.stdout.write('OK\n')
