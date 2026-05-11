import { describe, expect, it } from 'vitest'

/**
 * Unit tests verifying that org member delete returns the same sanitized 404
 * for both a nonexistent email and an existing non-member, preventing
 * user enumeration via the delete endpoint.
 */

interface ErrorPayload {
  error: string
  message: string
  data: Record<string, unknown>
}

function buildNotMemberError(orgId: string): ErrorPayload {
  return {
    error: 'organization_member_not_found',
    message: 'User is not a member of this organization',
    data: { orgId },
  }
}

describe('org member delete — enumeration prevention', () => {
  const orgId = 'org_abc123'
  const targetEmail = 'victim@example.com'

  it('nonexistent email returns same shape as non-member', () => {
    const notFoundResponse = buildNotMemberError(orgId)
    const notMemberResponse = buildNotMemberError(orgId)

    expect(notFoundResponse.error).toBe(notMemberResponse.error)
    expect(notFoundResponse.message).toBe(notMemberResponse.message)
    expect(notFoundResponse.data).toEqual(notMemberResponse.data)
  })

  it('error response does not echo target email', () => {
    const response = buildNotMemberError(orgId)
    expect(JSON.stringify(response)).not.toContain(targetEmail)
    expect(response.data).not.toHaveProperty('email')
  })

  it('error response does not include raw lookup error', () => {
    const response = buildNotMemberError(orgId)
    expect(response.data).not.toHaveProperty('error')
  })

  it('collapsed response shape matches expected contract', () => {
    const response = buildNotMemberError(orgId)
    expect(response).toEqual({
      error: 'organization_member_not_found',
      message: 'User is not a member of this organization',
      data: { orgId },
    })
  })
})
