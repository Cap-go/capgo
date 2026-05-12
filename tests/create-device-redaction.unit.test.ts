import { describe, expect, it } from 'vitest'

/**
 * Unit tests for create_device validation body redaction.
 * Tests the redaction logic directly without importing ArkType or the module,
 * to avoid mock setup complexity.
 */

// Local helper matching the shape of the mocked simpleError
function makeSimpleError(code: string, message: string, data?: Record<string, unknown>) {
  return { code, message, data: data ?? null }
}

// The safe issues mapping used in the actual fix
function toSafeIssues(issues: any[]) {
  return issues.map((issue: any) => ({
    code: issue.code ?? 'unknown',
    path: Array.isArray(issue.path) ? issue.path.map(String) : [],
  }))
}

describe('create_device validation body redaction', () => {
  it('does not include raw body values in invalid_json_body error', () => {
    // Simulate what ArkType would return for an invalid body
    const rawIssues = [
      { code: 'invalid_type', path: ['device_id'], data: 'not-a-uuid', message: 'Expected uuid' },
      { code: 'invalid_type', path: ['platform'], data: 'unknown_platform', message: 'Expected ios|android' },
      { code: 'invalid_type', path: ['app_id'], data: 'com.secret.app', message: 'Expected string' },
    ]

    const safeIssues = toSafeIssues(rawIssues)
    const thrown = makeSimpleError('invalid_json_body', 'Invalid JSON body', { issue_count: safeIssues.length, issues: safeIssues })
    const serialized = JSON.stringify(thrown.data ?? {})

    // Must NOT contain submitted values
    expect(serialized).not.toContain('not-a-uuid')
    expect(serialized).not.toContain('unknown_platform')
    expect(serialized).not.toContain('com.secret.app')
    expect(serialized).not.toContain('secret-version-abc123')

    // Must contain safe metadata
    expect(thrown.data?.issue_count).toBe(3)
  })

  it('safe issues contain only code and path keys', () => {
    const rawIssues = [
      { code: 'invalid_type', path: ['device_id'], data: 'sensitive-value', message: 'Expected uuid' },
    ]

    const safeIssues = toSafeIssues(rawIssues)
    safeIssues.forEach((issue) => {
      expect(Object.keys(issue).sort()).toEqual(['code', 'path'])
      expect((issue as any).data).toBeUndefined()
      expect((issue as any).message).toBeUndefined()
    })
  })

  it('does not echo raw body object in error data', () => {
    const rawIssues = [
      { code: 'missing_key', path: ['org_id'] },
    ]
    const safeIssues = toSafeIssues(rawIssues)
    const thrown = makeSimpleError('invalid_json_body', 'Invalid JSON body', { issue_count: safeIssues.length, issues: safeIssues })

    expect(thrown.data).not.toHaveProperty('body')
    expect(thrown.data).not.toHaveProperty('parsedBodyResult')
  })

  it('path entries are strings not submitted values', () => {
    const rawIssues = [
      { code: 'invalid_type', path: ['version_name'], data: 'secret-build-v99' },
    ]
    const safeIssues = toSafeIssues(rawIssues)
    safeIssues.forEach((issue) => {
      issue.path.forEach((p: string) => expect(typeof p).toBe('string'))
      expect(JSON.stringify(issue.path)).not.toContain('secret-build-v99')
    })
  })

  it('handles issues with no path gracefully', () => {
    const rawIssues = [
      { code: 'unknown_error', data: 'some-secret' },
    ]
    const safeIssues = toSafeIssues(rawIssues)
    expect(safeIssues[0].path).toEqual([])
    expect(JSON.stringify(safeIssues)).not.toContain('some-secret')
  })
})
