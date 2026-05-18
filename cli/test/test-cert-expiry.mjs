#!/usr/bin/env node
/**
 * Unit tests for extractCertExpiry and extractCertSerial in csr.ts.
 *
 * We generate a real PKCS#12 with node-forge using a known-expiry self-signed
 * cert, then assert the helpers extract the expected values.
 */
import assert from 'node:assert/strict'
import forge from 'node-forge'
import { extractCertExpiry, extractCertSerial, DEFAULT_P12_PASSWORD } from '../src/build/onboarding/csr.ts'

let passed = 0
let failed = 0

function t(name, fn) {
  try {
    fn()
    process.stdout.write(`✓ ${name}\n`)
    passed++
  }
  catch (err) {
    process.stderr.write(`✗ ${name}\n  ${err.message}\n`)
    failed++
  }
}

function makeP12(opts) {
  const { notAfter, password = DEFAULT_P12_PASSWORD, serialHex = '01' } = opts
  const keys = forge.pki.rsa.generateKeyPair(2048)
  const cert = forge.pki.createCertificate()
  cert.publicKey = keys.publicKey
  cert.serialNumber = serialHex
  cert.validity.notBefore = new Date(notAfter.getTime() - 365 * 24 * 60 * 60 * 1000)
  cert.validity.notAfter = notAfter
  const attrs = [
    { name: 'commonName', value: 'Test iOS Distribution' },
    { name: 'organizationName', value: 'Capgo Test' },
    { shortName: 'OU', value: 'TEAM123' },
  ]
  cert.setSubject(attrs)
  cert.setIssuer(attrs)
  cert.sign(keys.privateKey, forge.md.sha256.create())
  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], password, { algorithm: '3des' })
  return forge.util.encode64(forge.asn1.toDer(p12Asn1).getBytes())
}

t('extracts notAfter from a P12 with the default password', () => {
  const expected = new Date('2027-05-18T12:00:00Z')
  const p12 = makeP12({ notAfter: expected })

  const got = extractCertExpiry(p12, DEFAULT_P12_PASSWORD)
  assert.ok(got instanceof Date)
  // node-forge stores dates with second precision; allow a small tolerance.
  assert.equal(Math.abs(got.getTime() - expected.getTime()) < 2000, true)
})

t('extracts notAfter when caller passes wrong password but default works', () => {
  const expected = new Date('2027-01-01T00:00:00Z')
  const p12 = makeP12({ notAfter: expected, password: DEFAULT_P12_PASSWORD })

  // Pass an obviously wrong password — the helper should fall back to DEFAULT_P12_PASSWORD.
  const got = extractCertExpiry(p12, 'totally-wrong-password')
  assert.ok(got instanceof Date)
  assert.equal(Math.abs(got.getTime() - expected.getTime()) < 2000, true)
})

t('extracts notAfter from a P12 with an empty password', () => {
  const expected = new Date('2026-12-01T00:00:00Z')
  const p12 = makeP12({ notAfter: expected, password: '' })

  const got = extractCertExpiry(p12, '')
  assert.ok(got instanceof Date)
  assert.equal(Math.abs(got.getTime() - expected.getTime()) < 2000, true)
})

t('extractCertSerial returns upper-case hex serial', () => {
  const p12 = makeP12({ notAfter: new Date('2027-05-18T00:00:00Z'), serialHex: 'abcdef' })
  const serial = extractCertSerial(p12, DEFAULT_P12_PASSWORD)
  assert.equal(serial, 'ABCDEF')
})

t('throws when given malformed base64', () => {
  assert.throws(() => extractCertExpiry('not-valid-asn1-der-bytes'), /Could not parse saved P12 certificate/)
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
