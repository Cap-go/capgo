import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { classifyCertAvailability, computeCertSha1, listProfilesForCert } from '../src/build/onboarding/apple-api.ts'

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

// ─── listProfilesForCert pagination ──────────────────────────────
// Verifies the fix for ultrareview issue #4: the 200 cap on /profiles is
// the team's total profile count, not matches for our cert, so the loop
// must follow body.links.next instead of returning page 1 only.

const ASC_BASE = 'https://api.appstoreconnect.apple.com/v1'

function installFetchMock(pages) {
  const calls = []
  const original = globalThis.fetch
  globalThis.fetch = async (input) => {
    const url = typeof input === 'string' ? input : input.url
    calls.push(url)
    const page = pages.shift()
    if (!page)
      throw new Error(`Unexpected extra fetch: ${url}`)
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => page,
    }
  }
  return {
    calls,
    restore: () => { globalThis.fetch = original },
  }
}

function makeProfile(id, certId, bundleId = 'bid-1') {
  return {
    id,
    type: 'profiles',
    attributes: {
      name: `profile-${id}`,
      profileType: 'IOS_APP_STORE',
      profileContent: '',
      expirationDate: '2099-01-01T00:00:00.000Z',
    },
    relationships: {
      certificates: { data: [{ type: 'certificates', id: certId }] },
      bundleId: { data: { type: 'bundleIds', id: bundleId } },
    },
  }
}

async function tAsync(name, fn) {
  try {
    await fn()
    process.stdout.write(`✓ ${name}\n`)
  }
  catch (e) {
    process.stderr.write(`✗ ${name}\n`)
    throw e
  }
}

await tAsync('listProfilesForCert follows links.next and aggregates pages', async () => {
  const pages = [
    {
      data: [makeProfile('p1', 'CERT_A'), makeProfile('p2', 'CERT_OTHER')],
      included: [{ id: 'bid-1', type: 'bundleIds', attributes: { identifier: 'com.example.one' } }],
      links: { next: `${ASC_BASE}/profiles?cursor=PAGE2&include=certificates,bundleId&limit=200` },
    },
    {
      data: [makeProfile('p3', 'CERT_A'), makeProfile('p4', 'CERT_A')],
      included: [{ id: 'bid-1', type: 'bundleIds', attributes: { identifier: 'com.example.one' } }],
      links: { next: `${ASC_BASE}/profiles?cursor=PAGE3&include=certificates,bundleId&limit=200` },
    },
    {
      data: [makeProfile('p5', 'CERT_OTHER')],
      included: [],
      links: {},
    },
  ]
  const mock = installFetchMock(pages)
  try {
    const result = await listProfilesForCert('tok', 'CERT_A')
    assert.equal(mock.calls.length, 3, 'should have walked all three pages')
    assert.equal(mock.calls[0], `${ASC_BASE}/profiles?include=certificates,bundleId&limit=200`)
    assert.equal(mock.calls[1], `${ASC_BASE}/profiles?cursor=PAGE2&include=certificates,bundleId&limit=200`)
    assert.equal(mock.calls[2], `${ASC_BASE}/profiles?cursor=PAGE3&include=certificates,bundleId&limit=200`)
    const ids = result.map(r => r.id).sort()
    assert.deepEqual(ids, ['p1', 'p3', 'p4'])
    for (const r of result)
      assert.equal(r.bundleIdentifier, 'com.example.one')
  }
  finally {
    mock.restore()
  }
})

await tAsync('listProfilesForCert stops when links.next is absent', async () => {
  const pages = [
    {
      data: [makeProfile('p1', 'CERT_A')],
      included: [{ id: 'bid-1', type: 'bundleIds', attributes: { identifier: 'com.example.one' } }],
      links: {},
    },
  ]
  const mock = installFetchMock(pages)
  try {
    const result = await listProfilesForCert('tok', 'CERT_A')
    assert.equal(mock.calls.length, 1)
    assert.equal(result.length, 1)
    assert.equal(result[0].id, 'p1')
  }
  finally {
    mock.restore()
  }
})

await tAsync('listProfilesForCert handles missing data/included arrays on a page', async () => {
  const pages = [
    {
      links: { next: `${ASC_BASE}/profiles?cursor=PAGE2` },
    },
    {
      data: [makeProfile('p2', 'CERT_A')],
      included: [{ id: 'bid-1', type: 'bundleIds', attributes: { identifier: 'com.example.one' } }],
      links: {},
    },
  ]
  const mock = installFetchMock(pages)
  try {
    const result = await listProfilesForCert('tok', 'CERT_A')
    assert.equal(mock.calls.length, 2)
    assert.equal(result.length, 1)
    assert.equal(result[0].id, 'p2')
    assert.equal(result[0].bundleIdentifier, 'com.example.one')
  }
  finally {
    mock.restore()
  }
})

// ─── SHA1-indexed batch validation (mirrors app.tsx batch path) ──────
// Verifies the fix for ultrareview issue #6: import-validating-all-certs
// now does ONE listDistributionCerts({includeContent:true}) fetch and
// indexes by SHA1 instead of N parallel findCertBySha1 calls. These tests
// pin the contract that map indexing is a faithful drop-in for the old
// fan-out — same lookup result for known SHA1s, undefined for unknowns,
// and case-insensitive matching against Keychain's uppercase hex output.

t('SHA1 map indexing finds a cert by its content hash', () => {
  const derA = Buffer.from('cert-A-der-bytes')
  const derB = Buffer.from('cert-B-der-bytes')
  const certs = [
    { id: 'id-A', name: 'A', certificateContent: derA.toString('base64') },
    { id: 'id-B', name: 'B', certificateContent: derB.toString('base64') },
  ]
  const bySha1 = new Map()
  for (const cert of certs) {
    if (!cert.certificateContent)
      continue
    bySha1.set(computeCertSha1(cert.certificateContent), cert)
  }
  const sha1A = createHash('sha1').update(derA).digest('hex').toLowerCase()
  const sha1B = createHash('sha1').update(derB).digest('hex').toLowerCase()
  assert.equal(bySha1.get(sha1A)?.id, 'id-A')
  assert.equal(bySha1.get(sha1B)?.id, 'id-B')
})

t('SHA1 map indexing returns undefined for an unknown identity', () => {
  const der = Buffer.from('only-cert')
  const bySha1 = new Map()
  bySha1.set(computeCertSha1(der.toString('base64')), { id: 'id-only' })
  // Identity whose SHA1 has no Apple-side match — the batch path treats this
  // as cert=null and lets classifyCertAvailability render the 'not-visible'
  // branch instead of throwing.
  const stranger = createHash('sha1').update(Buffer.from('stranger')).digest('hex').toLowerCase()
  assert.equal(bySha1.get(stranger), undefined)
})

t('SHA1 map lookup is case-insensitive when identities lowercase before lookup', () => {
  const der = Buffer.from('mixed-case-cert')
  const key = computeCertSha1(der.toString('base64'))
  const bySha1 = new Map()
  bySha1.set(key, { id: 'id-mixed' })
  // macOS `security find-identity` returns uppercase hex; the batch path
  // .toLowerCase()s before lookup to match computeCertSha1's lowercase output.
  const fromKeychain = key.toUpperCase()
  assert.equal(bySha1.get(fromKeychain.toLowerCase())?.id, 'id-mixed')
})

t('SHA1 map indexing skips certs missing certificateContent', () => {
  // Defensive: listDistributionCerts({includeContent:true}) normally returns
  // content for every cert, but Apple has been known to omit fields for
  // certain cert types. The batch path's `if (!cert.certificateContent)
  // continue` guard prevents a TypeError when hashing.
  const der = Buffer.from('has-content')
  const certs = [
    { id: 'id-with', certificateContent: der.toString('base64') },
    { id: 'id-without' }, // no certificateContent
  ]
  const bySha1 = new Map()
  for (const cert of certs) {
    if (!cert.certificateContent)
      continue
    bySha1.set(computeCertSha1(cert.certificateContent), cert)
  }
  assert.equal(bySha1.size, 1)
  assert.equal(bySha1.get(computeCertSha1(der.toString('base64')))?.id, 'id-with')
})

process.stdout.write('OK\n')
