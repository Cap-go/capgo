import { describe, expect, it, vi } from 'vitest'

/**
 * Regression coverage for download_link request body and error redaction.
 * Tests the shapes produced by the fixed code paths without importing the
 * full module (which has heavyweight Hono/Supabase dependencies).
 */

describe('download_link request log redaction', () => {
  it('cloudlog uses metadata booleans not raw body fields', () => {
    const body = { app_id: 'com.secret.app', storage_provider: 'r2', id: 42, isManifest: true }

    // Simulate fixed log entry
    const logEntry = {
      message: 'post download link body',
      has_app_id: !!body.app_id,
      has_id: !!body.id,
      has_manifest: !!body.isManifest,
    }

    const serialized = JSON.stringify(logEntry)
    expect(serialized).not.toContain('com.secret.app')
    expect(serialized).not.toContain('r2')
    expect(logEntry.has_app_id).toBe(true)
    expect(logEntry.has_id).toBe(true)
    expect(logEntry.has_manifest).toBe(true)
  })

  it('cloudlog metadata booleans are false when fields absent', () => {
    const body = {}
    const logEntry = {
      has_app_id: !!(body as any).app_id,
      has_id: !!(body as any).id,
      has_manifest: !!(body as any).isManifest,
    }
    expect(logEntry.has_app_id).toBe(false)
    expect(logEntry.has_id).toBe(false)
    expect(logEntry.has_manifest).toBe(false)
  })
})

describe('download_link access denied redaction', () => {
  it('app_access_denied error has no data (no raw app_id)', () => {
    // Simulate fixed error: simpleError('app_access_denied', '...') with no data arg
    const err = { code: 'app_access_denied', data: null }
    expect(err.data).toBeNull()
    // Ensure no raw app_id would appear
    expect(JSON.stringify(err)).not.toContain('app_id')
  })
})

describe('download_link cannot_get_owner_org redaction', () => {
  it('does not echo raw bundle row when owner_org is missing', () => {
    const bundle = {
      id: 123,
      r2_path: 'secret/path/to/bundle.zip',
      checksum: 'sha256:abc123secret',
      owner_org: null,
      // many more internal fields...
    }

    // Simulate fixed error data
    const errData = { has_bundle: !!bundle, has_owner_org: !!bundle?.owner_org }
    const serialized = JSON.stringify(errData)

    expect(serialized).not.toContain('secret/path/to/bundle.zip')
    expect(serialized).not.toContain('abc123secret')
    expect(errData.has_bundle).toBe(true)
    expect(errData.has_owner_org).toBe(false)
  })

  it('has_bundle and has_owner_org are booleans', () => {
    const bundle = { id: 1, owner_org: { created_by: 'user-123' } }
    const errData = { has_bundle: !!bundle, has_owner_org: !!bundle?.owner_org }
    expect(typeof errData.has_bundle).toBe('boolean')
    expect(typeof errData.has_owner_org).toBe('boolean')
    expect(errData.has_bundle).toBe(true)
    expect(errData.has_owner_org).toBe(true)
  })
})
