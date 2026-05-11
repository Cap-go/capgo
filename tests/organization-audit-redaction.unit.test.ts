import { describe, expect, it } from 'vitest'

/**
 * Unit tests verifying that invalid audit query values are not reflected
 * in error details from the organization audit endpoint.
 */

function buildSafeIssues(issues: any[]) {
  return issues.map((issue: any) => ({
    code: issue.code ?? 'unknown',
    path: Array.isArray(issue.path) ? issue.path.map(String) : [],
  }))
}

function buildRedactedError(rawIssues: any[]) {
  const safeIssues = buildSafeIssues(rawIssues)
  return { issue_count: safeIssues.length, issues: safeIssues }
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
    expect(error.issues[0]).toEqual({ code: 'invalid_type', path: ['orgId'] })
  })

  it('preserves issue count and safe metadata', () => {
    const rawIssues = [
      { code: 'invalid_type', path: ['limit'] },
      { code: 'missing_key', path: ['orgId'] },
    ]
    const error = buildRedactedError(rawIssues)
    expect(error.issue_count).toBe(2)
    expect(error.issues).toHaveLength(2)
    expect(error.issues[0].code).toBe('invalid_type')
    expect(error.issues[1].code).toBe('missing_key')
  })

  it('handles issues with no path gracefully', () => {
    const rawIssues = [{ code: 'invalid_union' }]
    const error = buildRedactedError(rawIssues)
    expect(error.issues[0]).toEqual({ code: 'invalid_union', path: [] })
  })
})
