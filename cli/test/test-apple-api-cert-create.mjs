/**
 * apple-api createCertificate — modern Apple Distribution (`DISTRIBUTION`) type.
 *
 * Pins the cert-creation contract after the 2026-06-05 fix:
 *   • createCertificate POSTs certificateType DISTRIBUTION (the modern
 *     "Apple Distribution" type Xcode 11+ uses) — NOT the deprecated
 *     IOS_DISTRIBUTION whose per-type pool fills up from legacy certs.
 *   • When Apple rejects on the cert limit, the revoke-picker payload is
 *     scoped to the SAME pool that is actually full: the follow-up list
 *     call filters DISTRIBUTION only, so the picker never offers a cert
 *     whose revocation would not free a slot (the live 2026-06-05 trap:
 *     4 mixed-type certs listed, default cursor on the user's real
 *     Apple Distribution keychain cert).
 *   • listDistributionCerts keeps querying BOTH types by default — the
 *     import flow matches local Keychain identities against the full
 *     ledger and must keep seeing legacy certs.
 *
 * Network is stubbed via globalThis.fetch (ascFetch uses the global).
 */
import assert from 'node:assert/strict'
import {
  CertificateLimitError,
  createCertificate,
  createProfile,
  listDistributionCerts,
} from '../src/build/onboarding/apple-api.ts'

let passed = 0
async function t(name, fn) {
  try {
    await fn()
    passed++
    process.stdout.write(`✓ ${name}\n`)
  }
  catch (e) {
    process.stderr.write(`✗ ${name}\n`)
    throw e
  }
}

const realFetch = globalThis.fetch

/** Install a fetch stub; returns the captured request list. */
function stubFetch(handler) {
  const calls = []
  globalThis.fetch = async (url, init = {}) => {
    const call = { url: String(url), method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null }
    calls.push(call)
    return handler(call)
  }
  return calls
}

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return { ok, status, statusText: ok ? 'OK' : 'Conflict', json: async () => body }
}

const LIMIT_ERROR_BODY = {
  errors: [{
    title: 'There is a problem with the request entity',
    detail: 'You already have a current Distribution certificate or a pending certificate request.',
    code: 'ENTITY_ERROR.ATTRIBUTE.INVALID',
  }],
}

const APPLE_DIST_CERT = {
  id: 'CERT_AD_1',
  attributes: {
    name: 'Apple Distribution',
    serialNumber: 'SER1',
    expirationDate: '2026-12-17T00:00:00Z',
  },
}

try {
  console.log('🧪 apple-api createCertificate — Apple Distribution type + scoped limit pool\n')

  await t('createCertificate POSTs the modern DISTRIBUTION certificate type', async () => {
    const calls = stubFetch(() => jsonResponse({
      data: {
        id: 'NEWCERT',
        attributes: {
          certificateContent: 'Zm9v', // unparseable DER → extractTeamIdFromCert returns ''
          expirationDate: '2027-06-05T00:00:00Z',
        },
      },
    }))
    const created = await createCertificate('tok', 'CSR_PEM')
    assert.equal(calls.length, 1, 'exactly one request')
    assert.equal(calls[0].method, 'POST', 'creates via POST /certificates')
    assert.equal(
      calls[0].body.data.attributes.certificateType,
      'DISTRIBUTION',
      'must create the modern Apple Distribution type, not the deprecated IOS_DISTRIBUTION',
    )
    assert.equal(created.certificateId, 'NEWCERT', 'returns the created cert id')
  })

  await t('cert-limit rejection re-lists ONLY the DISTRIBUTION pool for the revoke picker', async () => {
    const calls = stubFetch((call) => {
      if (call.method === 'POST')
        return jsonResponse(LIMIT_ERROR_BODY, { ok: false, status: 409 })
      return jsonResponse({ data: [APPLE_DIST_CERT] })
    })
    let thrown = null
    try {
      await createCertificate('tok', 'CSR_PEM')
    }
    catch (e) {
      thrown = e
    }
    assert.ok(thrown instanceof CertificateLimitError, 'throws CertificateLimitError on the limit')
    assert.equal(calls.length, 2, 'POST + the follow-up list')
    const listUrl = calls[1].url
    assert.ok(listUrl.includes('filter[certificateType]=DISTRIBUTION'), 'follow-up list filters by certificateType')
    assert.ok(!listUrl.includes('IOS_DISTRIBUTION'), 'the revoke pool excludes legacy IOS_DISTRIBUTION certs — revoking one would not free a DISTRIBUTION slot')
    assert.equal(thrown.certificates.length, 1, 'carries the scoped pool')
    assert.equal(thrown.certificates[0].id, 'CERT_AD_1', 'the Apple Distribution cert is offered for revocation')
    assert.ok(thrown.message.includes('Apple Distribution certificate'), `limit message names the Apple Distribution pool (got: ${thrown.message})`)
  })

  await t('cert-limit rejection with an EMPTY scoped pool rethrows the original Apple error', async () => {
    stubFetch((call) => {
      if (call.method === 'POST')
        return jsonResponse(LIMIT_ERROR_BODY, { ok: false, status: 409 })
      return jsonResponse({ data: [] })
    })
    let thrown = null
    try {
      await createCertificate('tok', 'CSR_PEM')
    }
    catch (e) {
      thrown = e
    }
    assert.ok(thrown, 'still throws')
    assert.ok(!(thrown instanceof CertificateLimitError), 'no revoke prompt without revocable certs in the pool')
    assert.ok(thrown.message.includes('ENTITY_ERROR.ATTRIBUTE.INVALID'), 'surfaces the original Apple error')
  })

  await t('listDistributionCerts queries BOTH types by default (import matching contract)', async () => {
    const calls = stubFetch(() => jsonResponse({ data: [APPLE_DIST_CERT] }))
    await listDistributionCerts('tok')
    assert.ok(
      calls[0].url.includes('filter[certificateType]=DISTRIBUTION,IOS_DISTRIBUTION'),
      'default keeps the full ledger visible for Keychain identity matching',
    )
  })

  await t("listDistributionCerts({ types: ['DISTRIBUTION'] }) narrows the filter", async () => {
    const calls = stubFetch(() => jsonResponse({ data: [APPLE_DIST_CERT] }))
    await listDistributionCerts('tok', { types: ['DISTRIBUTION'] })
    assert.ok(calls[0].url.includes('filter[certificateType]=DISTRIBUTION'), 'filters the requested type')
    assert.ok(!calls[0].url.includes('IOS_DISTRIBUTION'), 'legacy type excluded when narrowed')
  })

  // ── HOSTILE-REVIEW LOW: the awaited follow-up list inside the catch must not
  // REPLACE the original error when it fails itself. ──────────────────────────

  await t('cert-limit rejection whose follow-up list ALSO fails rethrows the ORIGINAL Apple error', async () => {
    stubFetch((call) => {
      if (call.method === 'POST')
        return jsonResponse(LIMIT_ERROR_BODY, { ok: false, status: 409 })
      // The diagnostics list itself blows up — e.g. a transient ASC outage.
      return jsonResponse({ errors: [{ title: 'Service Unavailable', detail: 'try later', code: 'SERVICE_UNAVAILABLE' }] }, { ok: false, status: 503 })
    })
    let thrown = null
    try {
      await createCertificate('tok', 'CSR_PEM')
    }
    catch (e) {
      thrown = e
    }
    assert.ok(thrown, 'still throws')
    assert.ok(!(thrown instanceof CertificateLimitError), 'no revoke prompt when the pool could not be listed')
    assert.ok(thrown.message.includes('ENTITY_ERROR.ATTRIBUTE.INVALID'), `must surface the ORIGINAL create error, not the list failure (got: ${thrown.message})`)
  })

  await t('createProfile duplicate rejection whose findCapgoProfiles follow-up fails rethrows the ORIGINAL duplicate error', async () => {
    stubFetch((call) => {
      if (call.method === 'POST')
        return jsonResponse({ errors: [{ title: 'Conflict', detail: 'Multiple profiles found with the name Capgo com.example.app AppStore', code: 'ENTITY_ERROR' }] }, { ok: false, status: 409 })
      // findCapgoProfiles' GET blows up — must not replace the duplicate error.
      return jsonResponse({ errors: [{ title: 'Service Unavailable', detail: 'try later', code: 'SERVICE_UNAVAILABLE' }] }, { ok: false, status: 503 })
    })
    let thrown = null
    try {
      await createProfile('tok', 'BUNDLE_RES_ID', 'CERT_ID', 'com.example.app')
    }
    catch (e) {
      thrown = e
    }
    assert.ok(thrown, 'still throws')
    assert.ok(thrown.message.includes('Multiple profiles found'), `must surface the ORIGINAL duplicate error, not the list failure (got: ${thrown.message})`)
  })

  console.log(`\n✅ ${passed} apple-api cert-create tests passed`)
}
finally {
  globalThis.fetch = realFetch
}
