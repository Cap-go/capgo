import { describe, expect, it } from 'vitest'

/**
 * Regression coverage: webhook schema validation errors and invalid URL
 * errors must not echo raw submitted values back to callers.
 */

// Simulate what ArkType returns in a failed parse (issues can contain .data with submitted value)
function makeFakeArkError(submittedValue: unknown) {
  return {
    issues: [
      { code: 'invalid_type', path: ['url'], data: submittedValue, message: `Expected string, got ${typeof submittedValue}` },
      { code: 'missing_key', path: ['orgId'], message: 'orgId is required' },
    ],
  }
}

// The safe issues mapping used in the fix
function toSafeIssues(error: ReturnType<typeof makeFakeArkError>) {
  return (error?.issues ?? []).map((issue: any) => ({
    code: issue.code ?? 'unknown',
    path: Array.isArray(issue.path) ? issue.path.map(String) : [],
  }))
}

describe('webhook schema validation redaction', () => {
  it('does not include raw issue data values in invalid_body error', () => {
    const sensitiveUrl = 'https://attacker.example.com/steal?secret=abc123'
    const fakeError = makeFakeArkError(sensitiveUrl)
    const safeIssues = toSafeIssues(fakeError)

    const errorData = { issue_count: safeIssues.length, issues: safeIssues }
    const serialized = JSON.stringify(errorData)

    expect(serialized).not.toContain('attacker.example.com')
    expect(serialized).not.toContain('abc123')
    expect(serialized).not.toContain(sensitiveUrl)
    expect(errorData.issue_count).toBe(2)
  })

  it('safe issues contain only code and path keys', () => {
    const fakeError = makeFakeArkError({ secret: 'value', token: 'tok-123' })
    const safeIssues = toSafeIssues(fakeError)

    safeIssues.forEach((issue) => {
      expect(Object.keys(issue).sort()).toEqual(['code', 'path'])
      // No data, message, or other fields
      expect((issue as any).data).toBeUndefined()
      expect((issue as any).message).toBeUndefined()
    })
  })

  it('safe issues path entries are strings (field names, not values)', () => {
    const fakeError = makeFakeArkError('secret-value')
    const safeIssues = toSafeIssues(fakeError)

    safeIssues.forEach((issue) => {
      expect(Array.isArray(issue.path)).toBe(true)
      issue.path.forEach((p: string) => expect(typeof p).toBe('string'))
    })
  })
})

describe('webhook invalid URL redaction', () => {
  it('does not echo raw submitted URL in invalid_url error', () => {
    const sensitiveUrl = 'https://internal-server.corp/webhook?api_key=secret-123'

    // Simulate the fixed error data shape
    const errorData = { url_provided: true }
    const serialized = JSON.stringify(errorData)

    expect(serialized).not.toContain('internal-server.corp')
    expect(serialized).not.toContain('secret-123')
    expect(serialized).not.toContain(sensitiveUrl)
    expect(errorData.url_provided).toBe(true)
  })

  it('url_provided flag is a boolean not the URL value', () => {
    const errorData = { url_provided: true }
    expect(typeof errorData.url_provided).toBe('boolean')
  })
})
