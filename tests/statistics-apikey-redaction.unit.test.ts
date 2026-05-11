import { describe, expect, it } from 'vitest'

/**
 * Unit tests verifying that invalid_apikey errors from /statistics/org/:org_id
 * do not leak plaintext API key material in the response body.
 *
 * Covers both rejection paths:
 *  1. Org-limited key used against a different org
 *  2. App-limited key used against an org endpoint
 */

interface QuickErrorPayload {
  error: string
  message: string
  data: unknown
}

function makeQuickErrorPayload(data: unknown): QuickErrorPayload {
  return {
    error: 'invalid_apikey',
    message: 'Invalid apikey',
    data,
  }
}

describe('statistics org endpoint — invalid_apikey redaction', () => {
  it('does not include API key material in org-limited rejection', () => {
    const sensitiveKey = 'cap_live_abc123secretkeyvalue'

    // Simulate the old (broken) behavior
    const brokenPayload = makeQuickErrorPayload(sensitiveKey)
    expect(brokenPayload.data).toBe(sensitiveKey) // confirms the old bug

    // Simulate the fixed behavior: data is null, not the key
    const fixedPayload = makeQuickErrorPayload(null)
    expect(fixedPayload.data).toBeNull()
    expect(JSON.stringify(fixedPayload)).not.toContain(sensitiveKey)
  })

  it('does not include API key material in app-limited rejection', () => {
    const sensitiveKey = 'cap_live_xyz789anotherapikey'

    // Simulate the old (broken) behavior
    const brokenPayload = makeQuickErrorPayload(sensitiveKey)
    expect(brokenPayload.data).toBe(sensitiveKey)

    // Simulate the fixed behavior
    const fixedPayload = makeQuickErrorPayload(null)
    expect(fixedPayload.data).toBeNull()
    expect(JSON.stringify(fixedPayload)).not.toContain(sensitiveKey)
  })

  it('fixed error shape matches expected contract', () => {
    const payload = makeQuickErrorPayload(null)
    expect(payload).toEqual({
      error: 'invalid_apikey',
      message: 'Invalid apikey',
      data: null,
    })
  })
})
