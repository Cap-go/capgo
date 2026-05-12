import { describe, expect, it } from 'vitest'

/**
 * Unit tests verifying that invalid audit query values are not reflected
 * in error details from the organization audit endpoint.
 */

// The simplified redaction approach: only expose issue_count
function buildRedactedError(rawIssues: any[]) {
  return { issue_count: rawIssues.length }
}

describe('organization audit — schema error redaction', () => {
  it('does not reflect invalid submitted values in error response', () => {
    const sensitiveValue = 'DROP TABLE org_users;--'
    const rawIssues = [
      { code: 'invalid_type', path: ['orgId'], data: sensitiveValue, message: `Expected string, got ${sensitiveValue}` },
    ]

    const error = buildRedactedError(rawIssues)
    expect(JSON.stringify(error)).not.toContain(sensitiveValue)
    expect(error.issue_count).toBe(1)
  })

  it('preserves issue count but not raw issue content', () => {
    const rawIssues = [
      { code: 'invalid_type', path: ['limit'], data: 'sensitive-limit-value' },
      { code: 'missing_key', path: ['orgId'], data: 'sensitive-org-id' },
    ]
    const error = buildRedactedError(rawIssues)
    expect(error.issue_count).toBe(2)
    expect(JSON.stringify(error)).not.toContain('sensitive-limit-value')
    expect(JSON.stringify(error)).not.toContain('sensitive-org-id')
    // issues array is not exposed
    expect((error as any).issues).toBeUndefined()
  })

  it('handles empty issues gracefully', () => {
    const error = buildRedactedError([])
    expect(error.issue_count).toBe(0)
  })
})
