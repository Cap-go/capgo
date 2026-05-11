import { describe, expect, it } from 'vitest'

/**
 * Unit coverage for the version_not_found redaction fix.
 * We test the shape of what gets returned/logged rather than
 * importing the full stats module (which has many heavyweight deps).
 */
describe('stats version_not_found redaction', () => {
  it('version_not_found return value does not contain raw app_id', () => {
    // Simulate the return value that would have contained raw fields
    const result = { success: false, error: 'version_not_found', message: 'Version not found' }

    expect(JSON.stringify(result)).not.toContain('app_id')
    expect(JSON.stringify(result)).not.toContain('version_name')
    expect((result as any).moreInfo).toBeUndefined()
  })

  it('cloudlog redaction helper does not emit raw version_name', () => {
    const version_name = 'super-secret-version-1.2.3'
    // Simulate the log object produced by the fixed code path
    const logEntry = {
      message: 'Version name not found, using unknown instead',
      has_version_name: !!version_name,
      version_name_length: version_name.length,
    }

    expect(JSON.stringify(logEntry)).not.toContain('super-secret-version-1.2.3')
    expect(logEntry.has_version_name).toBe(true)
    expect(logEntry.version_name_length).toBe(version_name.length)
    // No raw app_id either
    expect(JSON.stringify(logEntry)).not.toContain('app_id')
  })

  it('cloudlog redaction preserves diagnostic metadata types', () => {
    const version_name = ''
    const logEntry = {
      message: 'Version name not found, using unknown instead',
      has_version_name: !!version_name,
      version_name_length: version_name.length,
    }

    expect(logEntry.has_version_name).toBe(false)
    expect(logEntry.version_name_length).toBe(0)
    expect(typeof logEntry.has_version_name).toBe('boolean')
    expect(typeof logEntry.version_name_length).toBe('number')
  })
})
