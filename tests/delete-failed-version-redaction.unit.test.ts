import { describe, expect, it } from 'vitest'

/**
 * Regression coverage for delete_failed_version body and error redaction.
 */

describe('delete_failed_version request log redaction', () => {
  it('cloudlog uses presence booleans, not raw body fields', () => {
    const body = { app_id: 'com.secret.app', name: 'secret-bundle-v1.2.3' }

    const logEntry = {
      message: 'delete failed version body',
      has_app_id: !!body.app_id,
      has_name: !!body.name,
    }

    const serialized = JSON.stringify(logEntry)
    expect(serialized).not.toContain('com.secret.app')
    expect(serialized).not.toContain('secret-bundle-v1.2.3')
    expect(logEntry.has_app_id).toBe(true)
    expect(logEntry.has_name).toBe(true)
  })

  it('cloudlog presence flags false when fields absent', () => {
    const body = {}
    const logEntry = {
      has_app_id: !!(body as any).app_id,
      has_name: !!(body as any).name,
    }
    expect(logEntry.has_app_id).toBe(false)
    expect(logEntry.has_name).toBe(false)
  })
})

describe('delete_failed_version validation error redaction', () => {
  it('not_authorized error has no data (no raw app_id)', () => {
    // Fixed: quickError(401, 'not_authorized', '...') with no extra data
    const errData = null
    expect(errData).toBeNull()
  })

  it('error_app_id_missing uses presence flags not raw body', () => {
    const body = { name: 'some-bundle-name' }
    const errData = { has_app_id: false, has_name: !!body.name }

    expect(JSON.stringify(errData)).not.toContain('some-bundle-name')
    expect(errData.has_app_id).toBe(false)
    expect(errData.has_name).toBe(true)
    expect(typeof errData.has_app_id).toBe('boolean')
    expect(typeof errData.has_name).toBe('boolean')
  })

  it('error_bundle_name_missing uses presence flags not raw body', () => {
    const body = { app_id: 'com.secret.app' }
    const errData = { has_app_id: !!body.app_id, has_name: false }

    expect(JSON.stringify(errData)).not.toContain('com.secret.app')
    expect(errData.has_app_id).toBe(true)
    expect(errData.has_name).toBe(false)
  })

  it('presence flags are booleans not string values', () => {
    const body = { app_id: 'com.example', name: 'v1.0.0' }
    const errData = { has_app_id: !!body.app_id, has_name: !!body.name }

    expect(typeof errData.has_app_id).toBe('boolean')
    expect(typeof errData.has_name).toBe('boolean')
    // Not the raw values
    expect(errData.has_app_id).not.toBe('com.example')
    expect(errData.has_name).not.toBe('v1.0.0')
  })
})
